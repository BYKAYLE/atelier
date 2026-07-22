import assert from "node:assert/strict";

import { providerQuotaLabel, providerUsageTone } from "../src/components/provider-usage/providerUsage.ts";

const entry = {
  provider: "openrouter",
  displayName: "OpenRouter",
  installed: true,
  connected: true,
  quotaUsed: 12.5,
  quotaLimit: 100,
  quotaRemaining: 87.5,
  source: "documented endpoint",
  note: "Explicit refresh",
};

assert.equal(providerQuotaLabel(entry, "en"), "12.5 used / 100 limit");
assert.equal(providerUsageTone(entry), "ok");
assert.equal(providerUsageTone({ ...entry, error: "offline" }), "warn");
assert.equal(
  providerQuotaLabel({ ...entry, quotaUsed: null, quotaLimit: null, quotaRemaining: null }, "ko"),
  "사용량 데이터 대기",
);
assert.equal(
  providerQuotaLabel({
    ...entry,
    provider: "codex",
    quotaUsed: null,
    quotaLimit: null,
    quotaRemaining: null,
    subscriptionUsage: {
      provider: "codex",
      plan: "pro",
      source: "Codex app-server",
      capturedAtUnixMs: Date.now(),
      windows: [{
        id: "primary",
        usedPercent: 21,
        remainingPercent: 79,
        windowMinutes: 10_080,
        resetsAtUnixSeconds: null,
      }],
    },
  }, "ko"),
  "7일 사용 21%",
);

console.log("provider usage smoke passed");
