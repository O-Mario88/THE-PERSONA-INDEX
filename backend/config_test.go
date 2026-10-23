package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func envOf(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

var goodSecrets = map[string]string{
	"DATABASE_URL":        "postgres://db/persona",
	"DEVICE_TOKEN_SECRET": strings.Repeat("t", 32),
	"DATA_KEY_SECRET":     strings.Repeat("d", 32),
}

func with(base map[string]string, kv ...string) map[string]string {
	out := map[string]string{}
	for k, v := range base {
		out[k] = v
	}
	for i := 0; i+1 < len(kv); i += 2 {
		out[kv[i]] = kv[i+1]
	}
	return out
}

func TestConfigDefaultsForLocalRuns(t *testing.T) {
	c, warnings, err := loadConfig(envOf(nil))
	if err != nil {
		t.Fatal(err)
	}
	if len(warnings) != 0 {
		t.Errorf("warnings = %v", warnings)
	}
	if c.Port != 8080 || c.MaxConns != 20 || !c.RunWorker || c.VoteRetention != defaultRetention {
		t.Errorf("defaults = %+v", c)
	}
	if c.LogFormat != "text" || c.AccessLog != "errors" {
		t.Errorf("local logs = %q, access log = %q", c.LogFormat, c.AccessLog)
	}
}

func TestConfigProduction(t *testing.T) {
	c, warnings, err := loadConfig(envOf(goodSecrets))
	if err != nil {
		t.Fatal(err)
	}
	if c.LogFormat != "json" {
		t.Errorf("production logs as %q, want json", c.LogFormat)
	}
	if len(warnings) != 0 {
		t.Errorf("warnings = %v", warnings)
	}
}

func TestConfigRefusesWhatWouldBeUnsafeOrWrong(t *testing.T) {
	dir := t.TempDir()
	for name, env := range map[string]map[string]string{
		"no secrets with a database":   {"DATABASE_URL": "postgres://db"},
		"short data secret":            with(goodSecrets, "DATA_KEY_SECRET", "short"),
		"pool size not a number":       {"DATABASE_MAX_CONNS": "lots"},
		"pool size zero":               {"DATABASE_MAX_CONNS": "0"},
		"port too big":                 {"PORT": "70000"},
		"worker flag unreadable":       {"RUN_TALLY_WORKER": "maybe"},
		"short edge secret":            {"EDGE_SECRET": "abc"},
		"short metrics token":          {"METRICS_TOKEN": "abc"},
		"metrics on the main port":     {"METRICS_ADDR": ":8080"},
		"metrics address unreadable":   {"METRICS_ADDR": "9090"},
		"static folder without a page": {"STATIC_DIR": dir},
		"log format unknown":           {"LOG_FORMAT": "xml"},
		"access log unknown":           {"ACCESS_LOG": "some"},
	} {
		if _, _, err := loadConfig(envOf(env)); err == nil {
			t.Errorf("%s: no error", name)
		}
	}
}

func TestConfigSaysEveryProblemAtOnce(t *testing.T) {
	_, _, err := loadConfig(envOf(map[string]string{"PORT": "x", "LOG_FORMAT": "xml", "EDGE_SECRET": "abc"}))
	if err == nil {
		t.Fatal("no error")
	}
	for _, want := range []string{"PORT", "LOG_FORMAT", "EDGE_SECRET"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not mention %s", err, want)
		}
	}
}

func TestConfigWarnings(t *testing.T) {
	_, warnings, err := loadConfig(envOf(with(goodSecrets, "TRUST_CF_CONNECTING_IP", "1", "VOTE_RETENTION_DAYS", "3")))
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(warnings, "\n")
	if !strings.Contains(joined, "EDGE_SECRET") {
		t.Errorf("no warning about trusting CF without an edge secret: %v", warnings)
	}
	if !strings.Contains(joined, "VOTE_RETENTION_DAYS") {
		t.Errorf("no warning about retention below the minimum: %v", warnings)
	}
	c, _, _ := loadConfig(envOf(with(goodSecrets, "VOTE_RETENTION_DAYS", "3")))
	if c.VoteRetention != minRetention {
		t.Errorf("retention = %v, want the minimum %v", c.VoteRetention, minRetention)
	}
	c, _, _ = loadConfig(envOf(with(goodSecrets, "VOTE_RETENTION_DAYS", "30")))
	if c.VoteRetention != 30*24*time.Hour {
		t.Errorf("retention = %v, want 30 days", c.VoteRetention)
	}
}

func TestConfigReadsEverySetting(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "index.html"), []byte("<!doctype html>"), 0o644)
	env := with(goodSecrets,
		"DATABASE_MAX_CONNS", "40", "PORT", "9000", "RUN_TALLY_WORKER", "0", "TRUST_CF_CONNECTING_IP", "1",
		"EDGE_SECRET", strings.Repeat("e", 40), "METRICS_ADDR", "127.0.0.1:9090", "METRICS_TOKEN", strings.Repeat("m", 32),
		"STATIC_DIR", dir, "LOG_FORMAT", "text", "ACCESS_LOG", "all", "DEVICE_TOKEN_SECRET_PREVIOUS", strings.Repeat("p", 32))
	c, warnings, err := loadConfig(envOf(env))
	if err != nil {
		t.Fatal(err)
	}
	if len(warnings) != 0 {
		t.Errorf("warnings = %v", warnings)
	}
	if c.MaxConns != 40 || c.Port != 9000 || c.RunWorker || !c.TrustCF || c.EdgeSecret == "" || c.MetricsAddr != "127.0.0.1:9090" ||
		c.MetricsToken == "" || c.StaticDir != dir || c.LogFormat != "text" || c.AccessLog != "all" || len(c.Keys.PreviousTokenSecret) != 32 {
		t.Errorf("config = %+v", c)
	}
}
