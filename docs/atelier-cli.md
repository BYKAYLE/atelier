# Atelier CLI

`atelier` is the local, versioned control surface for the Atelier desktop app.
It does not execute arbitrary shell text. Mutating commands are placed in the
private Atelier control queue and are completed by the running desktop app
through the existing permission, provider, worktree, and audit paths.

## Commands

```text
atelier version --json
atelier status --json
atelier snapshot --workspace <path> --json
atelier verify --workspace <path> --json
atelier task list --json
atelier task status <request-id> --json
atelier task cancel <request-id> --reason <text> --json
atelier task dispatch --workspace <path> --provider <provider> --prompt <text>
atelier worktree create --workspace <path> --task <name> --json
```

Supported task providers are `claude`, `codex`, `hermes`, and `gajecode`.
Optional task flags are `--model`, `--effort`, `--permission`, `--stella`, and
`--stage-models`.

### Stella Mode stage models (`--stage-models`)

`--stage-models` accepts a JSON object that assigns a model per Stella Mode
stage. It requires `--stella`. Stages are `planning`, `execution`,
`verification`, `security`, and `audit`; each stage entry may set `model`,
`effort`, and `provider` (any of `claude`/`codex`/`hermes`/`gajecode`/`grok`,
always with an explicit `model`). For a `hermes` stage the sub-backend may be
named explicitly with `backend` (`openai-codex`/`anthropic`/`openrouter`/
`alibaba`/`grok`); without it the backend is derived from the model value
(`claude-*` → Anthropic, `qwen*`/`glm*` → Alibaba Cloud, `vendor/model` →
OpenRouter, `grok-*` → Grok API, default Codex). Name the backend whenever the
model value is ambiguous — e.g. OpenRouter's `anthropic/claude-*` models
require `"backend":"openrouter"`. A `gajecode` stage derives its sub-provider
from the model prefix.
Supply-path rule: every supply path selectable in the composer — including
backend-only paths such as Alibaba Cloud and OpenRouter — is reachable in the
stage selector with a single selection (the UI maps them to
`hermes` + the derived backend), and headlessly via `hermes` plus a model of
that backend. Stage receipts record the derived `backend` alongside provider,
model, and effort.

```bash
atelier task dispatch \
  --workspace ~/Service/example \
  --provider claude \
  --stella \
  --stage-models '{"planning":{"model":"claude-opus-4-8"},"execution":{"model":"claude-sonnet-4-6"}}' \
  --prompt "리드미 요약 기능을 추가해"
```

Rules (static mapping v1):

- Unassigned stages inherit the session model; a dispatch with zero overrides
  runs the unchanged single-session Stella Mode path.
- With one or more overrides the run splits into the five stages executed
  sequentially. Context crosses stages only through explicit `STAGE HANDOFF`
  summaries, never provider conversation resumption.
- Fail-closed: an unknown stage, malformed JSON, a model missing from the
  provider catalog, a provider override without a model, or a stage provider
  whose runtime/authentication is not ready stops the run at that stage with
  the reason; no silent model substitution happens.
- The terminal receipt (`atelier task status <request-id>`) carries a
  `stageReceipts` array with the provider, model, effort, status, and duration
  of every executed stage.

## Control contract

- Schema: `1`
- Private root: the Atelier application-data directory under `control/v1`
- States: `pending`, `claimed`, and terminal `receipts`
- Terminal receipt states: `succeeded`, `failed`, or `cancelled`
- A claim records its process ID and timestamp.
- If the claiming process exits before completion, the next Atelier launch
  converts the abandoned claim to a failed receipt. It is never silently
  replayed.
- Workspace paths are canonicalized before queueing.
- Request IDs are UUID-shaped and cannot escape the control directory.

The CLI is local-only. GitHub, SSH, Linear, mobile, and Computer Use capabilities
have separate contracts and do not inherit implicit authority from this queue.
