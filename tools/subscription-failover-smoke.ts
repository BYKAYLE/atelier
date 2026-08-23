import assert from "node:assert/strict";
import {
  DEFAULT_FAILOVER_ORDER,
  isSubscriptionExhausted,
  pickFailoverLane,
  type SubscriptionLane,
} from "../src/lib/subscriptionFailover.ts";

// 소진: 기다려도 안 풀린다 — 갈아타야 이어서 쓸 수 있다.
for (const exhausted of [
  "Codex error event: The usage limit has been reached (code=usage_limit_reached)",
  "ERROR: You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Aug 8th, 2026 12:35 PM.",
  "Claude usage limit reached. Your limit will reset at 5pm.",
  "openrouter error: insufficient_quota",
  "Codex 구독 사용량이 소진되었습니다. 연결된 다른 구독으로 이어서 쓸 수 있습니다: Claude",
]) {
  assert.equal(isSubscriptionExhausted(exhausted), true, `must detect: ${exhausted}`);
}

// 공급자측 일시 제한은 소진이 아니다 — 갈아타면 안 되고 기다리면 된다.
assert.equal(
  isSubscriptionExhausted(
    "API Error: Server is temporarily limiting requests (not your usage limit) · All 2 accounts exhausted. Retry in 300s.",
  ),
  false,
  "provider-side cooldown must not be treated as subscription exhaustion",
);
assert.equal(isSubscriptionExhausted(""), false);
assert.equal(isSubscriptionExhausted(null), false);

// 대표님 기준 경로: 코덱스 소진 → 클로드로 이어서.
assert.equal(
  pickFailoverLane({
    current: "codex",
    connected: ["claude", "alibaba", "codex"],
  }),
  "claude",
);

// 이미 소진된 레인으로 되돌아가면 즉시 다시 막힌다 — 후보에서 뺀다.
assert.equal(
  pickFailoverLane({
    current: "codex",
    connected: ["claude", "alibaba", "codex"],
    exhausted: ["claude"],
  }),
  "alibaba",
);

// 연결 안 된 구독은 절대 제안하지 않는다.
assert.equal(
  pickFailoverLane({ current: "codex", connected: ["codex"] }),
  null,
  "must not invent a lane that is not connected",
);
assert.equal(pickFailoverLane({ current: "claude", connected: [] }), null);

// 선호 순서 밖의 레인이라도 연결돼 있으면 막다른 길보다 낫다.
const exotic = "openrouter" as SubscriptionLane;
assert.equal(
  pickFailoverLane({
    current: "codex",
    connected: [exotic],
    order: ["claude"],
  }),
  exotic,
);

assert.equal(DEFAULT_FAILOVER_ORDER[0], "claude", "codex 소진 시 기본 목적지는 Claude");

console.log("subscription-failover smoke: ok");
