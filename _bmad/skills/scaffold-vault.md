# Skill: Scaffold Vault

Test the `create-agentfs` CLI by running it against a temporary directory and verifying the generated vault structure.

## Prerequisites

- Node.js >= 18 installed
- Project built: `dist/cli.js` must exist (run `npm run build` first)
- Write access to `/tmp`

## Steps

### 1. Build the project

```bash
npm run build
```

Verify `dist/cli.js` exists before proceeding.

### 2. Create a temporary directory

```bash
TMPDIR=$(mktemp -d /tmp/agentfs-test-XXXXXX)
echo "Test dir: $TMPDIR"
```

### 3. Run the CLI

```bash
node dist/cli.js --output "$TMPDIR" --profile personal --non-interactive
```

If the CLI uses positional args or a different flag, adapt accordingly:

```bash
node dist/cli.js "$TMPDIR"
```

### 4. Verify kernel space (.agentos/)

```bash
ls "$TMPDIR/.agentos/"
```

Expected files:
- `.agentos/manifest.yaml`
- `.agentos/policy.yaml`
- `.agentos/memory/semantic.md`
- `.agentos/memory/episodic/` (directory)
- `.agentos/memory/procedural/` (directory)
- `.agentos/compile.d/` (directory containing driver files)
- `.agentos/init.d/` (directory)
- `.agentos/cron.d/` (directory)

### 5. Verify user space directories

```bash
ls "$TMPDIR/"
```

Expected top-level directories:
- `Inbox/`
- `Daily/`
- `Projects/`
- `Resources/`
- `Archive/`

### 6. Verify native runtime directories

```bash
ls "$TMPDIR/.claude/" 2>/dev/null || echo "MISSING: .claude/"
ls "$TMPDIR/.omc/" 2>/dev/null || echo "MISSING: .omc/"
```

### 7. Verify compiled outputs

```bash
test -f "$TMPDIR/CLAUDE.md" && echo "PASS: CLAUDE.md" || echo "FAIL: CLAUDE.md missing"
test -f "$TMPDIR/AGENT-MAP.md" && echo "PASS: AGENT-MAP.md" || echo "FAIL: AGENT-MAP.md missing"
```

## Expected Results

All of the following must exist after a successful scaffold:

| Path | Type |
|------|------|
| `.agentos/manifest.yaml` | file |
| `.agentos/policy.yaml` | file |
| `.agentos/memory/semantic.md` | file |
| `.agentos/memory/episodic/` | directory |
| `.agentos/memory/procedural/` | directory |
| `.agentos/compile.d/` | directory |
| `.agentos/init.d/` | directory |
| `.agentos/cron.d/` | directory |
| `Inbox/` | directory |
| `Daily/` | directory |
| `Projects/` | directory |
| `Resources/` | directory |
| `Archive/` | directory |
| `CLAUDE.md` | file |
| `AGENT-MAP.md` | file |

CLI exit code must be `0`.

## Cleanup

```bash
rm -rf "$TMPDIR"
echo "Cleaned up $TMPDIR"
```
