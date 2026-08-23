# Phase handoff — F-Phase 1 to F-Phase 2: mobile reachable pairing and QR

Date: 2026-08-02 KST

## Decisions

- Treat the unreachable phone as a listener/address defect, not a QR-only UI
  request. The installed server is healthy on loopback but refuses both Wi-Fi
  and Tailscale addresses.
- Preserve explicit external exposure. Loopback remains the safe default; a
  visible phone-connection action restarts on one validated private LAN address
  and generates a new short-lived pairing.
- Bind LAN mode to the selected private address instead of `0.0.0.0`, and
  advertise only the exact HTTPS endpoint covered by the certificate.
- QR encodes the reachable URL and pairing id only. The six-digit one-use code
  remains a second value that the user types after scanning.
- Close the existing query-bootstrap injection boundary before enabling the LAN
  flow, add exact Host/Origin checks, and bound wrong-code attempts.

## Rejected alternatives

- QR-encoding the current `127.0.0.1` URL: a phone would still route to itself.
- Putting the six-digit code in the QR/query string: this would leak the secret
  into screenshots, clipboard/browser history, and captured QR images.
- Binding to every interface: the current `0.0.0.0` implementation also exposes
  VPN/Tailscale/other adapters that are not represented by the UI or certificate.
- Silently enabling LAN at app launch: Atelier's manual-start and fail-closed
  network boundary must remain intact.
- Treating the selected LAN listener as if it also provided remote access:
  Tailscale requires a separate explicit mode, loopback proxy target, tailnet
  HTTPS URL, and independently managed Serve lifecycle.

## Scope amendment after this handoff

The user explicitly expanded the approved result to remote phone access from a
Windows or macOS host. The earlier decision not to claim Tailscale support is
therefore superseded, not silently reinterpreted. The new mode uses Tailscale
Serve on an Atelier-specific HTTPS port/path, never Funnel; both host and phone
must be signed into the same tailnet. LAN mode keeps its exact selected-address
self-signed TLS contract, while Tailscale mode keeps the Atelier HTTP backend on
loopback and lets the local Tailscale daemon terminate valid tailnet HTTPS.

## Risks

- Self-signed HTTPS can show a first-visit certificate warning on phones.
  Preserve the visible fingerprint and explicit guidance.
- Windows Defender Firewall behavior requires physical Windows validation; do
  not add or claim a broad automatic firewall rule.
- Wi-Fi address changes require server restart and certificate regeneration;
  existing certificate metadata already supports exact-SAN regeneration.

## F-Phase 2 entry conditions

- [x] User directly approved QR access and correction of the failed connection.
- [x] Atelier SOT ownership and current installed baseline were verified.
- [x] Loopback-only failure was reproduced with process/listener and HTTP proof.
- [x] Security expansion blockers and preservation boundaries were identified.
- [x] Backend and frontend ownership can be separated without target-file
  conflicts.

## 2026-08-02 Follow-up update — external access proof boundary

- Implemented tailnet-only remote access using Tailscale Serve only (Funnel remains
  disabled). Target URL is now:
  `https://kansic-macbookpro.tailb0943d.ts.net:8443/atelier/`
  with backend loopback semantics.
- Verified live:
  - HTTPS root and static file path (`/atelier/`, `/atelier/app.js`) are reachable.
  - `/atelier/health` succeeds on tailnet.
  - Wrong Host/Origin API attempts are rejected as expected (`403`/`401` paths).
  - Physical iPhone Safari launch via pairing URL succeeded and Tailscale counters
    increased (`Rx 122908 -> 128476`, `Tx 166316 -> 184020`), confirming the
    physical browser used the tailnet route rather than screen mirroring.
- Closure verification completed:
  - All-feature Rust: `268` passed, `6` ignored.
  - Strict all-target/all-feature Clippy, mobile-control smoke, production frontend
    build, and diff check passed.
  - Candidate and installed `0.2.21` executables match at
    `f03d9cf2c77b9f66cb42579202bd37d0f0e28fd114e075edccb642593b550dfc`.
  - Installed-process SIGTERM and the normal UI Stop flow both remove the Atelier
    mapping, close the backend port, and reap the foreground Serve guard/child;
    final Serve status is `{}`.
- Distribution-level boundary remains unchanged:
  - No physical Windows proof.
  - No physical off-LAN cellular-path proof.
  - No public/notarized/released artifact.
