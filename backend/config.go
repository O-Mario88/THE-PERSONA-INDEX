package main

import (
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Config is everything the server reads from its environment, checked in one
// place before anything starts, so a wrong setting stops the deploy instead
// of surfacing as odd behaviour later. docs/operations.md lists each one.
type Config struct {
	DatabaseURL string
	MaxConns    int32
	Keys        KeyConfig

	// TrustCF reads the client address from CF-Connecting-IP. EdgeSecret,
	// when set, is the value Cloudflare adds as X-Edge-Secret to every
	// request; anything arriving without it is refused, so the origin is
	// reachable only through the edge and CF-Connecting-IP cannot be forged.
	TrustCF    bool
	EdgeSecret string

	RunWorker     bool
	VoteRetention time.Duration
	Port          int

	// MetricsAddr serves /metrics on its own listener (a private port);
	// MetricsToken serves it on the main port behind a bearer token. Either,
	// both or neither.
	MetricsAddr  string
	MetricsToken string

	// StaticDir is the frontend build (frontend/dist) to serve next to the
	// API, with the headers in its _headers file. Empty: API only.
	StaticDir string

	LogFormat string // json | text
	AccessLog string // errors (failures and slow requests) | all | off
}

const (
	minEdgeSecretBytes   = 32
	minMetricsTokenBytes = 32
)

// loadConfig reads the configuration through getenv. It returns warnings for
// settings that work but deserve a look, and an error for any that would make
// the server unsafe or wrong.
func loadConfig(getenv func(string) string) (Config, []string, error) {
	var warnings []string
	var problems []error
	bad := func(format string, a ...any) { problems = append(problems, fmt.Errorf(format, a...)) }
	whole := func(name string, def int) int {
		v := strings.TrimSpace(getenv(name))
		if v == "" {
			return def
		}
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			bad("%s must be a whole number above 0, not %q", name, v)
			return def
		}
		return n
	}
	flag := func(name string, def bool) bool {
		switch strings.TrimSpace(getenv(name)) {
		case "":
			return def
		case "1", "true", "yes", "on":
			return true
		case "0", "false", "no", "off":
			return false
		}
		bad("%s must be 1 or 0, not %q", name, getenv(name))
		return def
	}

	c := Config{
		DatabaseURL: strings.TrimSpace(getenv("DATABASE_URL")),
		Keys: KeyConfig{
			TokenSecret: []byte(getenv("DEVICE_TOKEN_SECRET")),
			DataSecret:  []byte(getenv("DATA_KEY_SECRET")),
		},
		TrustCF:      flag("TRUST_CF_CONNECTING_IP", false),
		EdgeSecret:   getenv("EDGE_SECRET"),
		RunWorker:    flag("RUN_TALLY_WORKER", true),
		MetricsAddr:  strings.TrimSpace(getenv("METRICS_ADDR")),
		MetricsToken: getenv("METRICS_TOKEN"),
		StaticDir:    strings.TrimSpace(getenv("STATIC_DIR")),
	}
	if prev := getenv("DEVICE_TOKEN_SECRET_PREVIOUS"); prev != "" {
		c.Keys.PreviousTokenSecret = []byte(prev)
	}
	c.MaxConns = int32(whole("DATABASE_MAX_CONNS", 20))
	c.Port = whole("PORT", 8080)
	if c.Port > 65535 {
		bad("PORT must be at most 65535, not %d", c.Port)
	}
	days := whole("VOTE_RETENTION_DAYS", int(defaultRetention.Hours()/24))
	c.VoteRetention = time.Duration(days) * 24 * time.Hour
	if c.VoteRetention < minRetention {
		warnings = append(warnings, fmt.Sprintf("VOTE_RETENTION_DAYS=%d is below the minimum; keeping raw votes %d days", days, int(minRetention.Hours()/24)))
		c.VoteRetention = minRetention
	}

	production := c.DatabaseURL != ""
	if production {
		if len(c.Keys.TokenSecret) < minSecretBytes || len(c.Keys.DataSecret) < minSecretBytes {
			bad("DEVICE_TOKEN_SECRET and DATA_KEY_SECRET must both be set (32+ bytes) when DATABASE_URL is set")
		}
	}
	if c.EdgeSecret != "" && len(c.EdgeSecret) < minEdgeSecretBytes {
		bad("EDGE_SECRET must be at least %d bytes", minEdgeSecretBytes)
	}
	if production && c.TrustCF && c.EdgeSecret == "" {
		warnings = append(warnings, "TRUST_CF_CONNECTING_IP is on without EDGE_SECRET: anyone who finds the origin can forge their address and dodge the per-address limits")
	}
	if c.MetricsToken != "" && len(c.MetricsToken) < minMetricsTokenBytes {
		bad("METRICS_TOKEN must be at least %d bytes", minMetricsTokenBytes)
	}
	if c.MetricsAddr != "" {
		_, port, err := net.SplitHostPort(c.MetricsAddr)
		switch {
		case err != nil:
			bad("METRICS_ADDR must look like :9090 or 127.0.0.1:9090, not %q", c.MetricsAddr)
		case port == strconv.Itoa(c.Port):
			bad("METRICS_ADDR must use a different port from PORT (%d)", c.Port)
		}
	}
	if c.StaticDir != "" {
		if _, err := os.Stat(filepath.Join(c.StaticDir, "index.html")); err != nil {
			bad("STATIC_DIR %q has no index.html; point it at the frontend build (frontend/dist)", c.StaticDir)
		}
	}

	c.LogFormat = strings.TrimSpace(getenv("LOG_FORMAT"))
	switch c.LogFormat {
	case "":
		c.LogFormat = "text"
		if production {
			c.LogFormat = "json"
		}
	case "json", "text":
	default:
		bad("LOG_FORMAT must be json or text, not %q", c.LogFormat)
	}
	c.AccessLog = strings.TrimSpace(getenv("ACCESS_LOG"))
	switch c.AccessLog {
	case "":
		c.AccessLog = "errors"
	case "errors", "all", "off":
	default:
		bad("ACCESS_LOG must be errors, all or off, not %q", c.AccessLog)
	}
	return c, warnings, errors.Join(problems...)
}
