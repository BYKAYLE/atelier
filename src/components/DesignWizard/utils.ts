import type { Philosophy } from "./useDesignProject";

/**
 * Atelier Design Wizard 공통 유틸 — 9개 step 컴포넌트에 분산되어 있던 helper 통합.
 * 학파 추가/스니펫 형식 변경 시 한 곳만 수정하면 모든 step에 반영.
 */

/** 학파 ID → philosophies/{file}.md 파일 prefix */
export function phiToFile(phi: Philosophy): string {
  switch (phi) {
    case "pentagram":
      return "01-pentagram";
    case "field-io":
      return "02-field-io";
    case "kenya-hara":
      return "03-kenya-hara";
    case "linear":
      return "04-linear";
  }
}

/** ```html ... ``` 또는 ```HTML ... ``` 펜스 제거. 펜스 없으면 trim만. */
export function stripHtmlFence(s: string): string {
  const m = s.match(/```(?:html|HTML)?\s*\n([\s\S]*?)\n```/);
  if (m) return m[1];
  return s.trim();
}

/** ```markdown ... ``` 또는 ```md ... ``` 펜스 제거. 펜스 없으면 trim만. */
export function stripCodeFence(s: string): string {
  const m = s.match(/```(?:markdown|md)?\s*\n([\s\S]*?)\n```/);
  if (m) return m[1];
  return s.trim();
}

/** ```json ... ``` 펜스 제거. 펜스 없으면 trim만. */
export function stripJsonFence(s: string): string {
  const m = s.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (m) return m[1].trim();
  return s.trim();
}
