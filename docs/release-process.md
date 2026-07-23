# Release Process

Atelier separates source readiness, signed candidate creation, installed-app
proof, and public distribution. A successful build is not a public release.

## One-Time GitHub Configuration

- Configure the `production-release` environment with required reviewers.
- Register an interactive self-hosted Windows x64 runner. A service session is
  rejected because it cannot prove that a browser window was visible. Install
  7-Zip on that runner so both the MSI and NSIS payloads can be extracted and
  verified rather than trusting only the outer installer signature.
- Add the Apple Developer ID, notarization, Tauri updater, and SignPath secrets
  and variables required by `.github/workflows/release.yml`.
- Keep branch and tag protection enabled. The release tag must point to the
  exact reviewed source commit.

Secret values must never be written to logs, artifacts, release notes, or the
repository.

## Stage 1: Local Source Candidate

Run the local gates before creating a tag:

```bash
npm ci
npm run smoke:release-preflight
npm run release:preflight -- --output artifacts/release-preflight.json
npm run release:readiness
npm run build
npm run gate:orca-features
npm run smoke:updater-contract
npm run smoke:release-candidate
npm run smoke:publish-evidence
npm run smoke:oauth-login-flow
npm run audit:release
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

The local preflight always writes a redacted `source-preflight` report and
lists missing signing configuration without printing credential values. Local
inspection does not return a failing exit code merely because release
credentials are intentionally absent. The tag workflow runs the same evaluator
with `--strict`, the exact tag and repository, and preserves
`release-preflight.json` as a workflow artifact even when the gate blocks.

`npm run release:readiness` extends the same evaluator with read-only release
infrastructure checks. On macOS it verifies the local signing, Gatekeeper,
packaging, notarization, stapling tools and requires a Developer ID Application
identity. On GitHub it checks only credential names, never values, and verifies
the SignPath variables, protected `production-release` reviewer gate, and an
online self-hosted Windows x64 runner. The report is written to
`artifacts/release-readiness-preflight.json`. Use
`npm run release:readiness:strict` when a nonzero exit is required for any
missing prerequisite. Passing this preflight means the infrastructure can run;
it does not replace the signed, notarized, or physical-device receipts from the
later stages.

Version metadata, release notes, and the reviewed commit must agree before the
version tag is pushed.

## Stage 2: Sealed Private Draft

Pushing the version tag starts `.github/workflows/release.yml`. The workflow
must finish with all of these properties:

- `macos-release-evidence.json` proves that the built app, the app embedded in
  the DMG, and the app embedded in the updater archive have the same version
  and executable hash;
- macOS app and DMG carry a Developer ID Application signature, Gatekeeper
  accepts both packages, and notarization tickets are stapled to both;
- Windows MSI and NSIS installers carry valid Authenticode signatures;
- every `latest.json` platform entry uses the exact configured GitHub
  repository, tag, asset URL, and matching updater signature;
- schema 2 `release-manifest.json` binds the repository and every platform
  mapping, plus all assets, to the exact tag, version, source commit, byte
  length, and SHA-256 hash;
- the GitHub release remains a private draft.

No partial platform release is public if a later job fails.

## Stage 3: Physical Windows Evidence

Manually run `Windows Physical Release Gate` with the exact private-draft tag
and version. Select that same tag in GitHub's `Use workflow from` control; a
run dispatched from another ref is rejected even when its inputs name the
correct tag. The selected runner must be logged into an interactive desktop.
The workflow installs the signed candidate rather than testing an unrelated
pre-existing copy.

Required proof includes the installer and installed-executable signatures,
exact installed path, version, and executable SHA-256, renderer-ready receipt,
restart persistence, visible native browser handoff, and successful Claude and
Codex CLI authentication. The source gate separately proves that the connection
UI accepts only supported provider URLs and follows the bounded browser retry
contract. The physical gate then proves that the installed native executable
opens the real browser and completes authentication; neither proof substitutes
for the other. The installed executable hash must match in both the candidate
and provider receipts.

An existing older signed installation is required to prove that installing the
candidate replaces the previous application and remains current after restart,
except for an explicitly approved first signed-channel waiver. This is a signed
installer upgrade test. It must not be described as an in-app updater test,
because the private draft does not yet expose the public `latest.json` endpoint
that the application updater consumes.

The resulting artifact is named
`atelier-windows-physical-release-gate-<tag>`. Preserve its run ID for the
publication stage. Candidate, package, and provider receipts are accepted only
when all three were generated by that exact run ID and source commit.

## Stage 4: Approval-Protected Publication

Run `Publish Sealed Release` with:

- the exact release tag;
- the successful physical-gate run ID;
- `PUBLISH <tag>` as the confirmation text;
- the first-channel waiver only when it was also used by the physical gate.

The workflow re-downloads the private candidate and physical evidence, checks
their tag, source commit, version, hashes, installed path, browser visibility,
provider authentication, package payloads, and signatures, then uploads an
accepted evidence report. Immediately before publication it downloads the
remote draft again, re-runs the sealed-candidate verifier, and requires the
manifest hash to match the initially reviewed copy. Only after those checks
and the `production-release` environment approval does it make the existing
draft public and mark it latest.

## Stop Conditions

Do not publish when any of the following is missing or inconsistent:

- Developer ID, notarization, stapling, Authenticode, or updater signatures;
- one of the required macOS or Windows assets;
- exact tag, version, source commit, manifest hash, or installed-path binding;
- interactive visible-browser and provider-authentication evidence;
- restart/update persistence evidence;
- protected-environment reviewer approval.

Microsoft Store packages use the separate process in
`docs/microsoft-store-release.md`; Store approval is not evidence that a direct
GitHub installer passed this process.

## Stage 5: Post-Public Updater Canary

The first public signed release establishes the updater channel. Starting with
the next release, keep the previous public version installed on a physical
machine and use Atelier's Settings > Updates action to consume the public
`latest.json`, install the new signed version, restart, and record the resulting
version, executable hash, and persistence receipt. Only this post-public canary
may be reported as proof that the in-app updater path works end to end.

If this canary fails, retain the current public release as latest and return the
new release to draft or withdraw it according to the incident procedure. Do not
replace the missing receipt with a direct installer run or a schema-only smoke
test.
