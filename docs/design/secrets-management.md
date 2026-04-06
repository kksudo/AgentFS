---
title: "Design Draft: Secrets Management"
date: 2026-04-07
status: draft
phase: 6
---

# Secrets Management — Design Draft

## Problem

AI агенты работают через LLM API. Всё что агент "прочитал" — отправлено в облако провайдера. Это означает:
1. Если агент прочитал `.env` — секреты утекли в логи OpenAI/Anthropic
2. Deny-read правила в policy.yaml работают только на уровне compile (advisory), реального перехвата fs-вызовов нет
3. Нужен механизм, при котором агент может *использовать* секреты, не *видя* их

## Architecture

### Уровни защиты (Defense in Depth)

```
Level 1: .gitignore          — секреты не попадают в git
Level 2: policy.yaml deny    — агент "не должен" читать (advisory)
Level 3: SOPS/age encryption — файлы зашифрованы at rest
Level 4: Reference-only      — агент видит refs.yaml, не сырые значения
Level 5: Template injection  — секреты подставляются в runtime, минуя LLM context
```

### File Structure

```
.agentos/
  secrets/
    refs.yaml          ← Агент видит ТОЛЬКО этот файл
    encrypted/
      .sops.yaml       ← SOPS config (age recipient)
      env.enc.yaml     ← Зашифрованные переменные окружения
      creds.enc.yaml   ← Зашифрованные credentials
    age/
      key.txt          ← age private key (NEVER committed, .gitignore)
```

### refs.yaml — что видит агент

```yaml
# References to available secrets. Agent sees names and descriptions only.
# Values are NEVER exposed. Use `agentfs exec --with-secrets` to inject.

secrets:
  - name: GITHUB_TOKEN
    description: "GitHub Personal Access Token (PRGate, CI)"
    type: env
    source: encrypted/env.enc.yaml

  - name: AWS_ACCESS_KEY_ID
    description: "AWS access key for Terraform"
    type: env
    source: encrypted/env.enc.yaml

  - name: OPENAI_API_KEY
    description: "OpenAI API key for PRGate"
    type: env
    source: encrypted/env.enc.yaml

  - name: kubeconfig
    description: "Kubernetes cluster config"
    type: file
    source: encrypted/creds.enc.yaml
    mount_path: ~/.kube/config
```

Агент может спросить "какие секреты доступны?" и увидеть список имён + описаний. Но НИКОГДА не видит значения.

### Encrypted storage (SOPS + age)

```yaml
# encrypted/env.enc.yaml (расшифрованный вид — НИКОГДА не хранится так)
GITHUB_TOKEN: ghp_xxxxxxxxxxxxxxxxxxxx
AWS_ACCESS_KEY_ID: AKIA...
OPENAI_API_KEY: sk-...

# encrypted/env.enc.yaml (реальный вид на диске)
GITHUB_TOKEN: ENC[AES256_GCM,data:xxxxx,iv:xxxxx,tag:xxxxx,type:str]
AWS_ACCESS_KEY_ID: ENC[AES256_GCM,data:xxxxx,iv:xxxxx,tag:xxxxx,type:str]
sops:
  age:
    - recipient: age1xxxxxxx
      enc: |
        -----BEGIN AGE ENCRYPTED FILE-----
        ...
```

### CLI Commands

```bash
# Initialization
agentfs secret init                    # Generate age keypair, create .sops.yaml
agentfs secret init --import .env      # Import existing .env into encrypted store

# CRUD
agentfs secret set GITHUB_TOKEN        # Interactive: paste value (не логируется)
agentfs secret set GITHUB_TOKEN --from-env  # Read from current env var
agentfs secret get GITHUB_TOKEN        # Print decrypted value (requires age key)
agentfs secret remove GITHUB_TOKEN
agentfs secret list                    # Same as reading refs.yaml

# Rotation
agentfs secret rotate GITHUB_TOKEN     # Re-encrypt with new value
agentfs secret rotate --all            # Re-encrypt everything (after key rotation)
agentfs secret rotate-key              # Generate new age key, re-encrypt all

# Security
agentfs secret audit                   # Check for leaked secrets in vault files
agentfs secret audit --git             # Check git history for accidental commits

# Runtime injection
agentfs exec --with-secrets <command>  # Inject secrets as env vars, run command
agentfs exec --with-secrets "terraform apply"
agentfs exec --with-secrets --template config.tmpl  # Template substitution
```

### Template Injection

Для случаев когда агенту нужно сгенерировать конфиг с секретами:

```yaml
# config.tmpl
apiVersion: v1
kind: Secret
metadata:
  name: my-app
data:
  token: {{ secret "GITHUB_TOKEN" | b64enc }}
```

```bash
agentfs exec --with-secrets --template config.tmpl > config.yaml
```

Агент генерирует шаблон с `{{ secret "NAME" }}` плейсхолдерами. `agentfs exec` подставляет реальные значения в отдельном процессе, минуя LLM context.

### Exfiltration Guard

Compile-time проверка: regex scanner ищет паттерны секретов в скомпилированных файлах.

```yaml
# policy.yaml (addition)
security:
  exfiltration_guard:
    enabled: true
    patterns:
      - "ghp_[A-Za-z0-9]{36}"         # GitHub PAT
      - "sk-[A-Za-z0-9]{48}"          # OpenAI key
      - "AKIA[A-Z0-9]{16}"            # AWS Access Key
      - "age1[a-z0-9]{58}"            # age public key (warning only)
    action: block  # block | warn | log
```

При `agentfs compile`: если обнаружен паттерн секрета в выходных файлах (CLAUDE.md, .cursor/rules/) — компиляция прерывается с ошибкой.

### Dependencies

- **SOPS** (Mozilla): https://github.com/getsops/sops — шифрование YAML/JSON
- **age**: https://github.com/FiloSottile/age — простое шифрование (замена PGP)
- Оба — single binary, zero dependencies, широко приняты в DevOps

### Implementation Notes

1. `agentfs secret init` — проверить наличие `sops` и `age` в PATH, предложить установку
2. `age/key.txt` MUST be in `.gitignore` — scaffold добавляет автоматически
3. `.sops.yaml` определяет creation rules: какие файлы шифровать и каким ключом
4. Для CI/CD: age key передаётся через env var `SOPS_AGE_KEY` или `SOPS_AGE_KEY_FILE`
5. Для Cowork VM: age key должен быть доступен в env контейнера (отдельная забота деплоя)

### Open Questions

1. Нужен ли master password поверх age key? (complexity vs usability)
2. Как rotateить ключи при командной работе? (shared profiles, v0.5.0)
3. Стоит ли поддерживать Vault (HashiCorp) как альтернативный backend? (overengineering?)
