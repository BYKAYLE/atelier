# Atelier Agent Harness

Atelier agent chat hides the raw terminal and renders Claude, Codex, and Hermes
as structured messages. This harness verifies the exact CLI adapter shape used by
that structured surface without opening the desktop UI.

## Quick Checks

```bash
npm run harness:fixture
npm run harness:claude -- --prompt "ok만 답해"
```

The fixture check protects two regressions:

- Claude emits a successful `stream-json` result and a later non-zero process
  exit arrives after completion. Atelier should keep the successful answer
  instead of replacing it with `claude exited with 1`.
- Claude emits an error `stream-json` result even though the process exits with
  code 0. Atelier should still treat the turn as failed.

## Provider Runs

```bash
node tools/atelier-agent-harness.mjs --provider claude --model claude-sonnet-4-6
node tools/atelier-agent-harness.mjs --provider codex --model gpt-5.5
node tools/atelier-agent-harness.mjs --provider hermes --hermes-provider openai-codex --model gpt-5.5
```

Artifacts are written to `src-tauri/target/atelier-harness/` and include the
redacted command, exit code, parsed session id, detected hook markers, and the
tail of raw provider output.
