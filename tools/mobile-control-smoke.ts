import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pairingSecondsLeft, preferredPairingUrl } from "../src/components/mobile-control/mobileControl.ts";

assert.equal(pairingSecondsLeft(61_000, 1_000), 60);
assert.equal(pairingSecondsLeft(1_000, 2_000), 0);
assert.equal(
  preferredPairingUrl(["https://127.0.0.1:4000", "https://192.168.1.20:4000"], true),
  "https://192.168.1.20:4000",
);
assert.equal(preferredPairingUrl(["http://127.0.0.1:4000"], false), "http://127.0.0.1:4000");

const backend = readFileSync(new URL("../src-tauri/src/mobile_control.rs", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/mobile-control/RemoteAccessSection.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/components/App.tsx", import.meta.url), "utf8");

assert.match(backend, /monitor:read/);
assert.match(backend, /PAIRING_TTL_MS/);
assert.match(backend, /revoked_at_ms/);
assert.match(backend, /command:propose/);
assert.match(backend, /mobile_control_device_followups_set/);
assert.match(backend, /This device cannot propose follow-up instructions/);
assert.match(backend, /from_tcp_rustls/);
assert.match(backend, /certificate_fingerprint/);
assert.match(backend, /lan_surface_is_https_only/);
assert.match(panel, /mobileControlDeviceRevoke/);
assert.match(panel, /mobileControlDeviceFollowupsSet/);
assert.match(panel, /후속 지시 허용/);
assert.match(panel, /SHA-256/);
assert.match(app, /settingsSection: "remote"/);

console.log("mobile control smoke: passed");
