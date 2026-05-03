<!-- noskills:start -->
## noskills orchestrator

State-driven orchestration. Do NOT read `.eser/` files directly — noskills provides everything via JSON.

### Protocol

    deno run --allow-all jsr:@eser/cli noskills spec <name> next                           # get instruction
    deno run --allow-all jsr:@eser/cli noskills spec <name> next --answer="response"       # submit and advance
    deno run --allow-all jsr:@eser/cli noskills spec new "description"                     # create spec (name auto-generated)

Every spec command MUST include `spec <name>`. Use `deno run --allow-all jsr:@eser/cli noskills spec list` for available specs.

### Core rules

- Call noskills ONCE per interaction. One question, one answer, one submit.
- Call `next` at: conversation start, before file edits, after completing work, at decisions.
- Never batch-submit. Never answer discovery questions yourself.
- Never skip steps or infer decisions. Ask first. Explicit > Clever.
- NEVER suggest bypassing or skipping noskills. Discovery is not overhead.
- NEVER ask permission to run the next noskills command. After spec new → run next. After approve → run next. Each step has one next step. Just run it.
- Execute noskills commands IMMEDIATELY — the output has all context needed.
- Display `roadmap` before content. Display `gate` prominently.

### Interactive choices

- Use AskUserQuestion for `interactiveOptions`. Use `commandMap` to resolve selections.
- On recurring patterns or corrections: ask 'Permanent rule?' → `deno run --allow-all jsr:@eser/cli noskills rule add "description"`.

### Git

Read-only: log, diff, status, show, blame. No write commands (commit, push, checkout, etc.).

### Discovery

Listen first: after spec creation, ask user to share context before mode selection.
Modes: full (default), validate, technical-depth, ship-fast, explore.
Pre-scan codebase before questions. Challenge premises. Propose alternatives.
With --from-plan: extract answers, present for user confirmation.

### Execution

- Re-read files before and after editing. Files >500 LOC: read in chunks.
- Run type-check + lint after every edit. Never mark AC passed if type-check fails.
- If search returns few results, re-run narrower — assume truncation.
- Clean dead code before structural refactors on files >300 LOC.
- Complete the spec — no mid-execution pauses or checkpoints.
- `meta` block has resume context for session start or after compaction.
<!-- noskills:end -->
