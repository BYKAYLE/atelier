import assert from "node:assert/strict";

import {
  OAUTH_LOGIN_RETRY_COOLDOWN_MS,
  OAUTH_LOGIN_RETRY_LIMIT,
  isAllowedOauthLoginUrl,
  planOauthLoginUrlAttempt,
} from "../src/features/connections/oauthLoginFlow.ts";

assert.equal(isAllowedOauthLoginUrl("claude", "https://claude.ai/oauth/authorize"), true);
assert.equal(isAllowedOauthLoginUrl("claude", "https://console.anthropic.com/oauth"), true);
assert.equal(isAllowedOauthLoginUrl("codex", "https://auth.openai.com/codex/device"), true);
assert.equal(isAllowedOauthLoginUrl("codex", "https://chatgpt.com/auth/login"), true);
assert.equal(isAllowedOauthLoginUrl("codex", "http://auth.openai.com/codex/device"), false);
assert.equal(isAllowedOauthLoginUrl("claude", "https://claude.ai.evil.example/login"), false);
assert.equal(isAllowedOauthLoginUrl("codex", "https://user@example.com@openai.com/login"), false);
assert.equal(isAllowedOauthLoginUrl("openrouter", "https://openrouter.ai/auth"), false);

const url = "https://auth.openai.com/codex/device";
let plan = planOauthLoginUrlAttempt(undefined, url, 1_000);
assert.equal(plan.shouldOpen, true);
assert.equal(plan.next.count, 1);

plan = planOauthLoginUrlAttempt(plan.next, url, 1_001);
assert.equal(plan.shouldOpen, false);
assert.equal(plan.reason, "cooldown");

let attempt = plan.next;
for (let index = 1; index < OAUTH_LOGIN_RETRY_LIMIT; index += 1) {
  const next = planOauthLoginUrlAttempt(
    attempt,
    url,
    attempt.lastAt + OAUTH_LOGIN_RETRY_COOLDOWN_MS,
  );
  assert.equal(next.shouldOpen, true);
  attempt = next.next;
}
assert.equal(attempt.count, OAUTH_LOGIN_RETRY_LIMIT);
assert.equal(
  planOauthLoginUrlAttempt(
    attempt,
    url,
    attempt.lastAt + OAUTH_LOGIN_RETRY_COOLDOWN_MS,
  ).reason,
  "limit",
);

const forced = planOauthLoginUrlAttempt(attempt, url, attempt.lastAt + 1, true);
assert.equal(forced.shouldOpen, true);
assert.equal(forced.next.count, OAUTH_LOGIN_RETRY_LIMIT + 1);

const changed = planOauthLoginUrlAttempt(
  attempt,
  "https://auth.openai.com/codex/device?challenge=new",
  attempt.lastAt + 1,
);
assert.equal(changed.shouldOpen, true);
assert.equal(changed.next.count, 1);

console.log("OAuth login flow smoke passed");
