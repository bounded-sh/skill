package cli

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestAuditGitIgnoreNegatedClassLeaksIgnoredFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".gitignore"), []byte("local.[!e]*\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "local.prod"), []byte("AUDIT_FAKE_TOKEN=not-a-real-secret\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "init", "-q")
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git init: %v: %s", err, out)
	}
	cmd = exec.Command("git", "check-ignore", "-q", "local.prod")
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("Git did not ignore local.prod: %v: %s", err, out)
	}
	files, _, err := collectSourceArtifactFiles(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, uploaded := files["local.prod"]; !uploaded {
		t.Fatal("expected the source collector to include the Git-ignored credential fixture")
	}
}

func TestAuditBareEnvironmentDeployKeepsStagingDefaults(t *testing.T) {
	policy := map[string]any{
		"environments": map[string]any{
			"staging": map[string]any{"appId": "staging-app", "constants": map[string]any{"ADMIN": "StagingAdmin", "DAILY_CAP": float64(50)}},
			"production": map[string]any{"appId": "production-app", "constants": map[string]any{"ADMIN": "ProductionAdmin", "DAILY_CAP": float64(5000)}},
		},
		"constants": map[string]any{"ADMIN": "StagingAdmin", "DAILY_CAP": float64(50)},
		"roles": map[string]any{"admin": map[string]any{"members": []any{"@const.ADMIN"}, "read": "*"}},
	}
	if err := refuseEnvironmentScopedFunctions(policy); err != nil {
		t.Fatalf("bare deploy unexpectedly refused: %v", err)
	}
	stripEnvironments(policy)
	constants := policy["constants"].(map[string]any)
	if got := constants["ADMIN"]; got != "StagingAdmin" {
		t.Fatalf("bare deploy did not retain staging ADMIN: %v", got)
	}
	if got := constants["DAILY_CAP"]; got != float64(50) {
		t.Fatalf("bare deploy did not retain staging DAILY_CAP: %v", got)
	}
}
