# Issues

## Open

- A click-driven installed-app E2E covering React parallel launch, native
  worktree preparation, IPC, adapter execution, comparison, and adoption is not
  yet implemented. Current proof combines frontend contracts with backend E2E
  and worktree integration tests.
- A real self-hosted model response has not been tested. The borrowed GPU
  server was intentionally left unchanged in this phase.
- Windows code compiles and links through `cargo xwin`; real `taskkill` and
  `tasklist` behavior still requires a physical Windows runner.

## Resolved in this session

- Independent QC found that the pre-existing worktree adoption test briefly
  wrote and removed its own test receipt under Atelier's real app-support
  directory, changing only the directory mtime. No receipt file remained.
  Tests now inject a temporary receipt directory, assert the resulting path,
  and preserve the real app-support directory mtime across the harness.
- Windows process-exit verification now rejects a failed `tasklist` command
  instead of treating empty output as successful cleanup.
- Fixture timeout and panic paths now issue cancellation cleanup for all turns.
