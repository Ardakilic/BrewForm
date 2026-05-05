# Spec: remove-hardcoded-secrets-garagetoml-use-env

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

rpc_secret and admin_token are hardcoded in committed garage.toml, creating a secret-leak risk.

_-- Arda Kilicdagi_

### ambition

1-star: replace literals with placeholders, add GARAGE_RPC_SECRET and GARAGE_ADMIN_TOKEN to .env.example, gitignore garage.toml, create garage.toml.example. 10-star: integrate with a secret vault and automated rotation.

_-- Arda Kilicdagi_

### reversibility

Fully reversible; garage.toml remains in git history and can be restored.

_-- Arda Kilicdagi_

### user_impact

Developers must set GARAGE_RPC_SECRET and GARAGE_ADMIN_TOKEN in .env (already used by compose.yml). This is a one-time local dev setup change.

_-- Arda Kilicdagi_

### verification

1) grep garage.toml to confirm old hex secret is removed, 2) confirm .env.example includes new vars with generation instructions, 3) confirm compose.yml still mounts garage.toml correctly.

_-- Arda Kilicdagi_

### scope_boundary

Will NOT implement a secret vault, change Garage version/network config, or modify S3 access keys (already externalized).

_-- Arda Kilicdagi_

## Test Strategy (well-engineered)

_To be addressed during execution._

## Performance Considerations (well-engineered)

_To be addressed during execution._

## Observability Plan (well-engineered)

_To be addressed during execution._

## Error Handling (well-engineered)

_To be addressed during execution._

## Security & Threat Model (well-engineered)

_To be addressed during execution._

## Developer Ergonomics (well-engineered)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Out of Scope

- Will NOT implement a secret vault, change Garage version/network config, or modify S3 access keys (already externalized).

## Tasks

- [x] task-1: Replace hardcoded rpc_secret in garage.toml with placeholder `<set via GARAGE_RPC_SECRET>`. Files: `garage.toml`
- [x] task-2: Replace hardcoded admin_token in garage.toml with placeholder `<set via GARAGE_ADMIN_TOKEN>`. Files: `garage.toml`
- [x] task-3: Add GARAGE_RPC_SECRET and GARAGE_ADMIN_TOKEN to .env.example with generation instructions. Files: `.env.example`
- [x] task-4: Create garage.toml.example as a non-secret template. Files: `garage.toml.example`
- [x] task-5: Add garage.toml to .gitignore. Files: `.gitignore`
- [x] task-6: Validate no hardcoded secrets remain in garage.toml.

## Verification

- grep garage.toml confirms old hex secret removed.
- .env.example includes GARAGE_RPC_SECRET and GARAGE_ADMIN_TOKEN with generation instructions.
- garage.toml.example exists as a non-secret template.
- .gitignore excludes garage.toml.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-05T20:53:06.864Z | - |
