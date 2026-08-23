// 구독 소진 시 살아있는 다른 구독으로 갈아타기 위한 순수 판정 로직.
//
// why: Atelier 의 목적은 여러 CLI 하네스를 한 자리에서 쓰는 것이고, 한 구독이
// 소진되면 다른 구독으로 **이어서** 쓰는 것이다. 그러려면 두 가지를 갈라야 한다 —
// "기다리면 풀리는 공급자측 일시 제한"(재시도가 정답)과 "내 구독 한도 소진"
// (전환이 정답). 섞으면 소진된 레인에서 무한 재시도하며 사용자를 막아 세운다.
// 백엔드(agent.rs provider_usage_exhausted)와 같은 시그니처를 쓰되, 프론트는
// 어느 공급자 경로로 올라온 메시지든 텍스트 한 겹에서 판정할 수 있어 전 프로바이더를
// 한 번에 덮는다. (260804)

export type SubscriptionLane = "claude" | "codex" | "alibaba" | "openrouter";

/** 갈아탈 곳을 고를 때의 기본 선호 순서. 대표님 기준: 코덱스 소진 → 클로드. */
export const DEFAULT_FAILOVER_ORDER: SubscriptionLane[] = [
  "claude",
  "alibaba",
  "openrouter",
  "codex",
];

const EXHAUSTION_SIGNATURES = [
  "usage_limit_reached",
  "usage limit has been reached",
  "hit your usage limit",
  "usage limit reached",
  "reached your usage limit",
  "insufficient_quota",
  "quota exceeded",
  "out of credits",
];

/** 백엔드가 승격해 내려보내는 한국어 문장도 같은 사실로 인식해야 한다. */
const EXHAUSTION_SIGNATURES_KO = ["구독 사용량이 소진"];

/**
 * 이 텍스트가 "내 구독이 소진됐다"를 뜻하는가.
 * 공급자 계정 풀의 일시 제한은 스스로 "네 한도가 아니다"라고 밝히므로 제외한다.
 */
export function isSubscriptionExhausted(text?: string | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (lower.includes("not your usage limit")) return false;
  if (EXHAUSTION_SIGNATURES_KO.some((sig) => text.includes(sig))) return true;
  return EXHAUSTION_SIGNATURES.some((sig) => lower.includes(sig));
}

/**
 * 소진된 레인에서 갈아탈 대상을 고른다.
 * `connected` 는 실제로 연결이 확인된 레인만 담아야 한다 — 연결 안 된 곳으로
 * 갈아태우면 사용자는 전환 후에야 못 쓴다는 걸 알게 된다.
 * 갈아탈 곳이 없으면 null 을 돌려주고, 호출부는 있는 척하지 않는다.
 */
export function pickFailoverLane({
  current,
  connected,
  order = DEFAULT_FAILOVER_ORDER,
  exhausted = [],
}: {
  current: SubscriptionLane;
  connected: SubscriptionLane[];
  order?: SubscriptionLane[];
  /** 이번 대화에서 이미 소진으로 확인된 레인 — 되돌아가면 즉시 다시 막힌다. */
  exhausted?: SubscriptionLane[];
}): SubscriptionLane | null {
  const blocked = new Set<SubscriptionLane>([current, ...exhausted]);
  const available = connected.filter((lane) => !blocked.has(lane));
  if (available.length === 0) return null;
  for (const lane of order) {
    if (available.includes(lane)) return lane;
  }
  // 선호 순서에 없는 레인이라도 연결돼 있으면 막다른 길보다는 낫다.
  return available[0];
}
