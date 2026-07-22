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
Optional task flags are `--model`, `--effort`, `--permission`, and `--stella`.

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
