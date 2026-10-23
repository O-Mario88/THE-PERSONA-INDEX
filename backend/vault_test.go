package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

// Acceptance tests for the encrypted backup (vault.go): sealed on the phone,
// kept by the SHA-256 of a key only the phone holds, written version by
// version so two phones never silently overwrite each other, and gone when
// the phone deletes it or no phone has used it for 400 days.

func vaultKey(name string) string {
	sum := sha256.Sum256([]byte("vault key " + name))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func sealedBytes(n int, fill byte) []byte { return bytes.Repeat([]byte{fill}, n) }

func vaultReq(method, key string, body []byte, header ...string) *http.Request {
	req := httptest.NewRequest(method, "/api/vault", bytes.NewReader(body))
	if key != "" {
		req.Header.Set("Authorization", "Vault "+key)
	}
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	return req
}

func putVault(t *testing.T, s *Server, key string, body []byte, header ...string) *httptest.ResponseRecorder {
	t.Helper()
	return do(t, s, vaultReq(http.MethodPut, key, body, header...))
}

func TestVault(t *testing.T) {
	t.Run("make, read, replace and delete a backup", func(t *testing.T) {
		s := newTestServer()
		k := vaultKey("a")
		expectError(t, do(t, s, vaultReq(http.MethodGet, k, nil)), http.StatusNotFound, "no_backup")

		w := putVault(t, s, k, sealedBytes(100, 1), "If-None-Match", "*")
		expectStatus(t, w, http.StatusOK)
		if w.Header().Get("ETag") != `"1"` || decode[map[string]int](t, w)["version"] != 1 || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("expected version 1, uncached, got %q %s", w.Header().Get("ETag"), w.Body.String())
		}

		w = do(t, s, vaultReq(http.MethodGet, k, nil))
		expectStatus(t, w, http.StatusOK)
		if !bytes.Equal(w.Body.Bytes(), sealedBytes(100, 1)) || w.Header().Get("ETag") != `"1"` ||
			w.Header().Get("Content-Type") != "application/octet-stream" || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("expected the sealed bytes back as they were sent, got %d bytes, %v", w.Body.Len(), w.Header())
		}

		w = putVault(t, s, k, sealedBytes(200, 2), "If-Match", `"1"`)
		expectStatus(t, w, http.StatusOK)
		if w.Header().Get("ETag") != `"2"` {
			t.Fatalf("expected version 2, got %q", w.Header().Get("ETag"))
		}

		w = do(t, s, vaultReq(http.MethodDelete, k, nil))
		expectStatus(t, w, http.StatusOK)
		if !decode[map[string]bool](t, w)["deleted"] {
			t.Fatal("expected the backup deleted")
		}
		expectError(t, do(t, s, vaultReq(http.MethodGet, k, nil)), http.StatusNotFound, "no_backup")
		w = do(t, s, vaultReq(http.MethodDelete, k, nil))
		expectStatus(t, w, http.StatusOK) // a repeated delete is not an error
		if decode[map[string]bool](t, w)["deleted"] {
			t.Fatal("nothing left to delete")
		}
	})

	t.Run("a write that names an old version is turned away with the current one", func(t *testing.T) {
		s := newTestServer()
		k := vaultKey("a")
		expectStatus(t, putVault(t, s, k, sealedBytes(64, 1), "If-None-Match", "*"), http.StatusOK)
		expectStatus(t, putVault(t, s, k, sealedBytes(64, 2), "If-Match", `"1"`), http.StatusOK) // the first phone

		w := putVault(t, s, k, sealedBytes(64, 3), "If-Match", `"1"`) // the second, behind
		expectError(t, w, http.StatusPreconditionFailed, "version_conflict")
		if w.Header().Get("ETag") != `"2"` || decode[map[string]any](t, w)["version"] != float64(2) {
			t.Fatalf("expected the current version in the refusal, got %q %s", w.Header().Get("ETag"), w.Body.String())
		}
		expectError(t, putVault(t, s, k, sealedBytes(64, 3), "If-None-Match", "*"), http.StatusPreconditionFailed, "version_conflict")
		if got := do(t, s, vaultReq(http.MethodGet, k, nil)); !bytes.Equal(got.Body.Bytes(), sealedBytes(64, 2)) {
			t.Fatal("a refused write must change nothing")
		}
		// A backup deleted on another phone: the write says so.
		expectError(t, putVault(t, s, vaultKey("gone"), sealedBytes(64, 1), "If-Match", `"3"`), http.StatusNotFound, "no_backup")
	})

	t.Run("two phones writing the same version at once: one wins, one is told", func(t *testing.T) {
		s := newTestServer()
		k := vaultKey("a")
		expectStatus(t, putVault(t, s, k, sealedBytes(64, 1), "If-None-Match", "*"), http.StatusOK)
		codes := make(chan int, 8)
		for i := range 8 {
			go func() {
				w := httptest.NewRecorder()
				s.Routes().ServeHTTP(w, vaultReq(http.MethodPut, k, sealedBytes(64, byte(10+i)), "If-Match", `"1"`))
				codes <- w.Code
			}()
		}
		won := 0
		for range 8 {
			switch c := <-codes; c {
			case http.StatusOK:
				won++
			case http.StatusPreconditionFailed:
			default:
				t.Fatalf("unexpected status %d", c)
			}
		}
		if won != 1 {
			t.Fatalf("expected exactly one write to win, got %d", won)
		}
	})

	t.Run("requests that are not well formed", func(t *testing.T) {
		s := newTestServer()
		k := vaultKey("a")
		for _, bad := range []string{"", "short", vaultKey("a") + "x", "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"} {
			expectError(t, do(t, s, vaultReq(http.MethodGet, bad, nil)), http.StatusUnauthorized, "invalid_vault_key")
		}
		req := vaultReq(http.MethodGet, "", nil)
		req.Header.Set("Authorization", "Device "+k)
		expectError(t, do(t, s, req), http.StatusUnauthorized, "invalid_vault_key")

		expectError(t, putVault(t, s, k, sealedBytes(64, 1)), http.StatusPreconditionRequired, "precondition_required")
		for _, m := range []string{"1", `"0"`, `"-1"`, `"x"`, `W/"1"`} {
			expectError(t, putVault(t, s, k, sealedBytes(64, 1), "If-Match", m), http.StatusBadRequest, "invalid_request")
		}
		expectError(t, putVault(t, s, k, sealedBytes(minVaultBytes-1, 1), "If-None-Match", "*"), http.StatusBadRequest, "invalid_request")
		expectError(t, putVault(t, s, k, sealedBytes(maxVaultBytes+1, 1), "If-None-Match", "*"), http.StatusRequestEntityTooLarge, "too_large")
		expectStatus(t, putVault(t, s, k, sealedBytes(maxVaultBytes, 1), "If-None-Match", "*"), http.StatusOK)
	})

	t.Run("the server keeps only a hash of the key, and nothing that names a phone", func(t *testing.T) {
		s := newTestServer()
		k := vaultKey("a")
		expectStatus(t, putVault(t, s, k, sealedBytes(64, 7), "If-None-Match", "*"), http.StatusOK)
		raw, _ := base64.RawURLEncoding.DecodeString(k)
		sum := sha256.Sum256(raw)
		ctx := context.Background()
		if v, err := s.vaults.GetVault(ctx, hex.EncodeToString(sum[:]), today); err != nil || v.Version != 1 {
			t.Fatalf("expected the backup kept under the key's hash, got %+v (%v)", v, err)
		}
		if _, err := s.vaults.GetVault(ctx, k, today); err != ErrVaultNotFound {
			t.Fatalf("the key itself must never be the id, got %v", err)
		}
		// The device pass plays no part: a phone that deleted everything
		// deletes its backup by its key, and another phone's backup stays.
		expectStatus(t, putVault(t, s, vaultKey("b"), sealedBytes(64, 8), "If-None-Match", "*"), http.StatusOK)
		expectStatus(t, do(t, s, vaultReq(http.MethodDelete, k, nil)), http.StatusOK)
		expectStatus(t, do(t, s, vaultReq(http.MethodGet, vaultKey("b"), nil)), http.StatusOK)
	})

	t.Run("no one can go looking for backups", func(t *testing.T) {
		s := newTestServer()
		mine := vaultKey("mine")
		expectStatus(t, putVault(t, s, mine, sealedBytes(64, 1), "If-None-Match", "*"), http.StatusOK)
		for i := range vaultMissesPerAddrPerHr {
			req := vaultReq(http.MethodGet, vaultKey("guess"+strconv.Itoa(i)), nil)
			req.RemoteAddr = "203.0.113.9:1234"
			expectError(t, do(t, s, req), http.StatusNotFound, "no_backup")
		}
		req := vaultReq(http.MethodGet, mine, nil)
		req.RemoteAddr = "203.0.113.9:1234"
		w := do(t, s, req)
		expectError(t, w, http.StatusTooManyRequests, "rate_limited")
		if w.Header().Get("Retry-After") == "" {
			t.Fatal("expected Retry-After")
		}
		req = vaultReq(http.MethodGet, mine, nil)
		req.RemoteAddr = "198.51.100.4:1234"
		expectStatus(t, do(t, s, req), http.StatusOK) // another network is not held back
	})

	t.Run("one backup cannot be written without end", func(t *testing.T) {
		s := newTestServer()
		k := vaultKey("busy")
		expectStatus(t, putVault(t, s, k, sealedBytes(64, 1), "If-None-Match", "*"), http.StatusOK)
		for i := 1; i < vaultsPerKeyPerHour; i++ {
			expectStatus(t, putVault(t, s, k, sealedBytes(64, 1), "If-Match", etag(i)), http.StatusOK)
		}
		expectError(t, putVault(t, s, k, sealedBytes(64, 1), "If-Match", etag(vaultsPerKeyPerHour)), http.StatusTooManyRequests, "rate_limited")
	})
}

func TestVaultRetention(t *testing.T) {
	ctx := context.Background()
	st := testStore()
	if _, err := st.PutVault(ctx, "old", 0, sealedBytes(64, 1), "2025-01-01"); err != nil {
		t.Fatal(err)
	}
	if _, err := st.PutVault(ctx, "read", 0, sealedBytes(64, 1), "2025-01-01"); err != nil {
		t.Fatal(err)
	}
	if _, err := st.GetVault(ctx, "read", "2026-10-01"); err != nil { // restored on a new phone
		t.Fatal(err)
	}
	if v, err := st.PutVault(ctx, "written", 0, sealedBytes(64, 1), "2025-01-01"); err != nil || v != 1 {
		t.Fatal(err)
	}
	if v, err := st.PutVault(ctx, "written", 1, sealedBytes(64, 2), "2026-10-01"); err != nil || v != 2 {
		t.Fatalf("expected version 2, got %d (%v)", v, err)
	}
	n, err := st.DeleteVaultsBefore(ctx, "2025-09-11")
	if err != nil || n != 1 {
		t.Fatalf("expected only the backup no one used deleted, got %d (%v)", n, err)
	}
	for _, id := range []string{"read", "written"} {
		if _, err := st.GetVault(ctx, id, "2026-10-01"); err != nil {
			t.Fatalf("expected %s kept: %v", id, err)
		}
	}
	if _, err := st.GetVault(ctx, "old", "2026-10-01"); err != ErrVaultNotFound {
		t.Fatalf("expected the unused backup gone, got %v", err)
	}
	if vaultRetention < 365*24*time.Hour {
		t.Fatal("a backup must outlast a year away from the app")
	}
}
