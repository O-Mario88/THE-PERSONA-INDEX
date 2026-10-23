package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// The encrypted backup (Phase 3 of the review of 2026-10-15). The phone
// makes two keys from its 12-word recovery phrase: one seals the backup, and
// never leaves the phone; the other, the vault key, shows the server which
// backup is the phone's. The server keeps the sealed bytes under the SHA-256
// of the vault key, so it can neither open a backup nor say whose it is, and
// a copy of the database is no way in. There is no email and no account:
// lose the phrase and the backup cannot be opened by anyone.
//
//	PUT    /api/vault   write; If-None-Match: * to make it, If-Match: "<version>" to replace that version
//	GET    /api/vault   read, with its version as the ETag
//	DELETE /api/vault   delete (the phone's "Delete everything" does this first)
//
// Every request carries "Authorization: Vault <key>", the vault key in
// unpadded base64url. Two phones restored from one phrase share one backup;
// a write that names an older version gets 412 with the current one, and the
// phone reads, merges and writes again.

const (
	// maxVaultBytes bounds one sealed backup. The phone compresses before it
	// seals; a year of heavy use is well under half of this.
	maxVaultBytes = 2 << 20
	// minVaultBytes is the smallest sealed backup: a format byte, a 12-byte
	// nonce and a 16-byte tag.
	minVaultBytes = 1 + 12 + 16
	// vaultRetention: a backup no phone has written or read for this long
	// goes. The notebook's own removal marks last as long (frontend/src/notebook.ts).
	vaultRetention = 400 * 24 * time.Hour
	// vaultTransferTimeout lets a slow phone upload or download a large
	// backup; every other route keeps the server's shorter limits.
	vaultTransferTimeout = 90 * time.Second

	vaultsPerKeyPerHour     = 120 // the phone backs up after changes, at most about once a minute
	vaultMissesPerAddrPerHr = 30  // a mistyped phrase is caught on the phone by its checksum
)

var (
	ErrVaultNotFound = errors.New("no backup")
)

// VaultConflict is returned when a write names a version that is not the
// current one, or makes a backup that already exists.
type VaultConflict struct{ Version int }

func (c VaultConflict) Error() string { return fmt.Sprintf("backup is at version %d", c.Version) }

// Vault is one sealed backup.
type Vault struct {
	Version int
	Sealed  []byte
}

// VaultStore keeps the sealed backups. Both stores implement it.
type VaultStore interface {
	// PutVault writes the backup under id. replaces is the version it
	// replaces, or 0 to make it. It returns the new version, a VaultConflict
	// when replaces is not the current version (or 0 when one exists), and
	// ErrVaultNotFound when replaces is above 0 and there is none.
	PutVault(ctx context.Context, id string, replaces int, sealed []byte, today string) (int, error)
	// GetVault reads the backup under id and notes today as the day it was
	// last seen; ErrVaultNotFound when there is none.
	GetVault(ctx context.Context, id, today string) (Vault, error)
	// DeleteVault deletes the backup under id and reports whether there was one.
	DeleteVault(ctx context.Context, id string) (bool, error)
	// DeleteVaultsBefore deletes backups last seen before date.
	DeleteVaultsBefore(ctx context.Context, date string) (int, error)
}

// vaultID reads "Authorization: Vault <key>" and returns the id the backup is
// kept under: the hex SHA-256 of the 32-byte key.
func vaultID(r *http.Request) (string, bool) {
	enc, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Vault ")
	if !ok || len(enc) != 43 {
		return "", false
	}
	key, err := base64.RawURLEncoding.DecodeString(enc)
	if err != nil || len(key) != 32 {
		return "", false
	}
	sum := sha256.Sum256(key)
	return hex.EncodeToString(sum[:]), true
}

// vaultRequest does the checks every vault route shares and writes the
// error itself when one fails.
func (s *Server) vaultRequest(w http.ResponseWriter, r *http.Request) (string, bool) {
	w.Header().Set("Cache-Control", "no-store")
	id, ok := vaultID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid_vault_key")
		return "", false
	}
	if blocked, retry := s.vaultMissLimit.Blocked(clientAddress(r, s.trustCF), s.clock()); blocked {
		rateLimited(w, retry)
		return "", false
	}
	if ok, retry := s.vaultLimit.Allow(id, s.clock()); !ok {
		rateLimited(w, retry)
		return "", false
	}
	return id, true
}

// vaultMissed counts a request for a backup that is not there against the
// client's address, so no one can go looking for backups.
func (s *Server) vaultMissed(w http.ResponseWriter, r *http.Request) {
	s.vaultMissLimit.Allow(clientAddress(r, s.trustCF), s.clock())
	writeError(w, http.StatusNotFound, "no_backup")
}

func etag(version int) string { return `"` + strconv.Itoa(version) + `"` }

// PutVault is PUT /api/vault.
func (s *Server) PutVault(w http.ResponseWriter, r *http.Request) {
	id, ok := s.vaultRequest(w, r)
	if !ok {
		return
	}
	replaces := -1
	if m := r.Header.Get("If-Match"); m != "" {
		if n, err := strconv.Atoi(strings.Trim(m, `"`)); err == nil && n > 0 && etag(n) == m {
			replaces = n
		}
	} else if r.Header.Get("If-None-Match") == "*" {
		replaces = 0
	} else {
		writeError(w, http.StatusPreconditionRequired, "precondition_required")
		return
	}
	if replaces < 0 {
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	extendDeadlines(w)
	sealed, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxVaultBytes))
	var tooBig *http.MaxBytesError
	switch {
	case errors.As(err, &tooBig):
		writeError(w, http.StatusRequestEntityTooLarge, "too_large")
		return
	case err != nil || len(sealed) < minVaultBytes:
		writeError(w, http.StatusBadRequest, "invalid_request")
		return
	}
	version, err := s.vaults.PutVault(r.Context(), id, replaces, sealed, s.clock().UTC().Format(dateLayout))
	var conflict VaultConflict
	switch {
	case errors.As(err, &conflict):
		w.Header().Set("ETag", etag(conflict.Version))
		writeJSON(w, http.StatusPreconditionFailed, map[string]any{"error": "version_conflict", "version": conflict.Version})
	case errors.Is(err, ErrVaultNotFound):
		s.vaultMissed(w, r)
	case err != nil:
		log.Printf("vault put: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	default:
		w.Header().Set("ETag", etag(version))
		writeJSON(w, http.StatusOK, map[string]int{"version": version})
	}
}

// GetVault is GET /api/vault.
func (s *Server) GetVault(w http.ResponseWriter, r *http.Request) {
	id, ok := s.vaultRequest(w, r)
	if !ok {
		return
	}
	v, err := s.vaults.GetVault(r.Context(), id, s.clock().UTC().Format(dateLayout))
	switch {
	case errors.Is(err, ErrVaultNotFound):
		s.vaultMissed(w, r)
		return
	case err != nil:
		log.Printf("vault get: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	extendDeadlines(w)
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("ETag", etag(v.Version))
	w.Header().Set("Content-Length", strconv.Itoa(len(v.Sealed)))
	w.WriteHeader(http.StatusOK)
	w.Write(v.Sealed)
}

// DeleteVault is DELETE /api/vault. Deleting a backup that is not there is
// not an error: the phone may be repeating a delete that went through.
func (s *Server) DeleteVault(w http.ResponseWriter, r *http.Request) {
	id, ok := s.vaultRequest(w, r)
	if !ok {
		return
	}
	deleted, err := s.vaults.DeleteVault(r.Context(), id)
	if err != nil {
		log.Printf("vault delete: %v", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": deleted})
}

// extendDeadlines gives a backup transfer longer than the server's usual
// read and write limits (newHTTPServer). A writer that cannot (a test
// recorder) keeps its own.
func extendDeadlines(w http.ResponseWriter) {
	rc := http.NewResponseController(w)
	at := time.Now().Add(vaultTransferTimeout)
	_ = rc.SetReadDeadline(at)
	_ = rc.SetWriteDeadline(at)
}

// The in-memory side.

type memoryVault struct {
	Vault
	seen string
}

func (m *memoryStore) PutVault(_ context.Context, id string, replaces int, sealed []byte, today string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur, ok := m.vaults[id]
	switch {
	case !ok && replaces > 0:
		return 0, ErrVaultNotFound
	case ok && cur.Version != replaces:
		return 0, VaultConflict{Version: cur.Version}
	}
	v := memoryVault{Vault: Vault{Version: replaces + 1, Sealed: append([]byte(nil), sealed...)}, seen: today}
	m.vaults[id] = v
	return v.Version, nil
}

func (m *memoryStore) GetVault(_ context.Context, id, today string) (Vault, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.vaults[id]
	if !ok {
		return Vault{}, ErrVaultNotFound
	}
	v.seen = max(v.seen, today)
	m.vaults[id] = v
	return Vault{Version: v.Version, Sealed: append([]byte(nil), v.Sealed...)}, nil
}

func (m *memoryStore) DeleteVault(_ context.Context, id string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.vaults[id]
	delete(m.vaults, id)
	return ok, nil
}

func (m *memoryStore) DeleteVaultsBefore(_ context.Context, date string) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for id, v := range m.vaults {
		if v.seen < date {
			delete(m.vaults, id)
			n++
		}
	}
	return n, nil
}
