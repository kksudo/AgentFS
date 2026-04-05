# Skill: Run Compile Pipeline

Test the `agentfs compile` command by running it against a minimal test vault and verifying the compiled outputs.

## Prerequisites

- Node.js >= 18 installed
- Project built: `dist/cli.js` must exist (run `npm run build` first)
- Write access to `/tmp`

## Steps

### 1. Build the project

```bash
npm run build
```

### 2. Create a minimal test vault

```bash
VAULT=$(mktemp -d /tmp/agentfs-compile-test-XXXXXX)
mkdir -p "$VAULT/.agentos/compile.d"
mkdir -p "$VAULT/.agentos/memory/episodic"
mkdir -p "$VAULT/.agentos/memory/procedural"
mkdir -p "$VAULT/.agentos/init.d"
mkdir -p "$VAULT/.agentos/cron.d"
echo "Test vault: $VAULT"
```

### 3. Write a minimal manifest.yaml

```bash
cat > "$VAULT/.agentos/manifest.yaml" << 'EOF'
version: "1.0"
profile: personal
agents:
  - id: claude
    driver: claude.hbs
  - id: omc
    driver: omc.hbs
memory:
  semantic: memory/semantic.md
  episodic: memory/episodic/
  procedural: memory/procedural/
EOF
```

### 4. Write a minimal semantic memory file

```bash
cat > "$VAULT/.agentos/memory/semantic.md" << 'EOF'
# Semantic Memory

## Identity
This vault belongs to the project owner.

## Key Facts
- Project: AgentFS test vault
- Purpose: compile pipeline verification
EOF
```

### 5. Run compile in dry-run mode

```bash
node dist/cli.js compile --vault "$VAULT" --dry-run
```

Expected: command exits with code `0` and prints a list of files that would be written without writing them.

### 6. Run compile for real

```bash
node dist/cli.js compile --vault "$VAULT"
```

### 7. Verify compiled outputs

```bash
test -f "$VAULT/CLAUDE.md"    && echo "PASS: CLAUDE.md"    || echo "FAIL: CLAUDE.md missing"
test -f "$VAULT/AGENT-MAP.md" && echo "PASS: AGENT-MAP.md" || echo "FAIL: AGENT-MAP.md missing"
```

Check that CLAUDE.md contains content derived from semantic.md:

```bash
grep -q "AgentFS test vault" "$VAULT/CLAUDE.md" && echo "PASS: content injected" || echo "FAIL: semantic memory not compiled in"
```

Check that AGENT-MAP.md lists the configured agents:

```bash
grep -q "claude" "$VAULT/AGENT-MAP.md" && echo "PASS: claude agent listed" || echo "FAIL: claude agent missing"
grep -q "omc"    "$VAULT/AGENT-MAP.md" && echo "PASS: omc agent listed"    || echo "FAIL: omc agent missing"
```

### 8. Verify idempotency

Run compile a second time and confirm no errors and no unintended overwrites of user-owned files:

```bash
node dist/cli.js compile --vault "$VAULT"
echo "Exit code: $?"
```

## Expected Results

| Check | Expected |
|-------|----------|
| `compile --dry-run` exit code | `0` |
| `compile` exit code | `0` |
| `CLAUDE.md` exists | yes |
| `AGENT-MAP.md` exists | yes |
| `CLAUDE.md` contains semantic content | yes |
| `AGENT-MAP.md` lists all agents from manifest | yes |
| Second `compile` run exit code | `0` (idempotent) |

## Cleanup

```bash
rm -rf "$VAULT"
echo "Cleaned up $VAULT"
```
