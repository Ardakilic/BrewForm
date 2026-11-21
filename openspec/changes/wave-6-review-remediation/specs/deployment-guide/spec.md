## ADDED Requirements

### Requirement: Deployment guides keep secrets off command lines
The deployment guides SHALL NOT show a command that puts a password, connection string with a password, or secret key into a process argument or a literal shell assignment; secrets SHALL be passed through the environment (`-e VAR` with no value, `--env-file`), read with `read -rs`, or avoided by running the command inside the database container over its local socket.

#### Scenario: Coolify identifier check passes DATABASE_URL through the environment
- **WHEN** an operator runs the identifier check from `docs/deployment_coolify.md`
- **THEN** the command uses `-e DATABASE_URL` without a value after `read -rs DATABASE_URL`, so the value appears in neither `ps` nor the shell history

#### Scenario: Photo-row audit needs no connection string
- **WHEN** an operator runs the photo-row query of the Coolify photo storage security check
- **THEN** it runs with `docker exec` inside the postgres container without a password argument
