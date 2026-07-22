# Stella Factory Critic Report

generated_at: 2026-07-13T09:35:39+09:00

## False-Green Risks Reviewed

- macOS cross-compilation cannot prove Windows default-browser behavior,
  Authenticode reputation, Store replacement, or Smart App Control acceptance.
- An exit-zero provider process without assistant text can create a false
  success unless adapter semantics are checked.
- Preview/server logs can leak credentials or grow persistence without bounds.
- An inspected page can attempt to tamper with element-picker state and smuggle
  input values, URL attributes, or arbitrary styles into agent context.
- A package build does not prove that `/Applications/Atelier.app` or a Windows
  installed identity was actually replaced.
- Successful Windows process creation does not prove a visible default-browser
  window or completed provider authentication.
- Generated SOT state can drift from the current validator and silently make
  historical completion look current.
- An automated macOS launch can create native surfaces without yielding an
  accessibility/on-screen window, so process or layer ownership alone is not a
  visual pass.
- A background WebKit window can indefinitely defer animation-frame callbacks,
  so a frame-based startup receipt can falsely report a timeout after document
  load.

## Countermeasures Applied

- A manual self-hosted Windows gate records exact installed version/path,
  valid signature, exact-path restart, native browser probe, post-login status,
  and read-only Smart App Control evidence.
- The harness rejects semantic failures and missing assistant output even when
  the child process exits zero.
- Preview evidence has native and frontend redaction plus strict body/line
  bounds; full browser archival remains deferred.
- Element selection uses a fixed script-side allowlist plus independent
  host-side normalization, rejects unsafe selectors, and never reads field
  values, cookies, storage, headers, or response bodies.
- Installed macOS version, signature, executable hash, browser probes, running
  path, and PTY reconnect are checked separately from source/package truth.
- The Windows physical gate now exercises the same signed Atelier browser
  helper passed to provider CLIs, but still requires post-login CLI status and
  human-visible browser evidence before accepting the machine.
- Browser handoff automation now records a new browser process, while the
  physical gate requires a visible top-level window. This prevents helper
  exit-zero from becoming a false browser-success signal.
- Current Service Factory state validates with no errors or warnings while
  preserving historical stage completion.
- The fresh automated visual result is recorded as inconclusive. The retained
  0.2.3 app reproduces it, so it is neither hidden nor mislabeled as a 0.2.4
  regression.
- Renderer readiness is emitted at the top-level React mount instead of an
  animation frame and is validated against live PID, canonical executable,
  version, main-window label, timestamp, and ready status.

## Critic Judgment

The 0.2.5 local candidate is evidence-backed and does not collapse source,
package, installed, physical-platform, or public-signing truth into one green
label. Public release remains blocked until the external gates are actually
observed.
