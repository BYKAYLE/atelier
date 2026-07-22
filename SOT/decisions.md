# Decisions

## 2026-07-21 — Test the provider boundary without shipping a fake provider

Decision: use a Rust `cfg(test)` launch override and make the Rust test binary
act as the child provider fixture.

Reasons:

- exercises the real adapter, subprocess, event, lifecycle, and cancellation
  path;
- runs on macOS, Linux, and Windows without installing Gajae/Hermes/Qwen;
- cannot appear in a production provider list or accept user traffic;
- avoids provider credentials, API charges, and borrowed-server changes.

## 2026-07-21 — Keep worktree receipts inside the test store

Decision: production adoption continues using the application receipt folder,
while tests inject a receipt directory under their unique temporary store.

Reason: test verification must not touch user application data, even briefly.
