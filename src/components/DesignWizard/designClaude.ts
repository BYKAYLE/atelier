/**
 * Atelier Design Wizard — claude --print 단발 호출 wrapper.
 *
 * 이전 PTY/TUI/마커 방식은 paste 감지/CR vs LF/init 타이밍 등 너무 많은 변수가 있어 회귀.
 * → Rust process spawn(claude --print) + stdin/stdout 단순 통신으로 전환.
 * 한 번 호출당 1회 응답. interactive TUI 미사용. 한글/긴 prompt 모두 안전.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../../lib/tauri";

export async function askDesignClaude(
  systemPrompt: string,
  userInput: string,
): Promise<string> {
  if (!isTauri()) throw new Error("Tauri runtime required");
  const out = await invoke<string>("design_claude_call", {
    systemPrompt,
    userInput,
  });
  return out;
}

/** 호환성 — 이전 진행 미리보기 함수가 호출되던 곳 대비 stub. */
export function getProgressBuffer(): string {
  return "";
}

/**
 * HTML 출력 검증 — LLM이 본문 대신 "저장했습니다" 같은 메타 설명만 반환하면 거부.
 * 호출자: HiFi, CIAssets, AppScreens, PrintFinal 등 HTML 출력 단계.
 *
 * 4중 검증:
 * 1. 최소 byte (기본 3KB — 빈 껍데기 차단)
 * 2. body 안 메타 응답 키워드 (다국어·변형 표현 포괄)
 * 3. body 안 텍스트 콘텐츠 ≥ 50자 (빈 body 차단)
 * 4. 구조 컴포넌트 ≥ 2개 (section/article/header/footer/main 합계) — 본문이 단일 줄로 뭉친 경우 차단
 *
 * @param html stripHtmlFence 후의 raw HTML
 * @param minSize 최소 byte (기본 3KB — 빈 껍데기 차단)
 * @param minStructuralTags 최소 구조 태그 개수 (기본 2개)
 */
export function validateHtmlOutput(
  html: string,
  minSize = 3000,
  minStructuralTags = 2,
): void {
  if (html.length < minSize) {
    throw new Error(
      `출력이 너무 짧습니다 (${html.length}자). 모델이 본문 대신 메타 응답만 반환한 것 같습니다. 재생성하세요.`,
    );
  }

  // <body> 안 텍스트만 추출해 검사 (head·title 무시)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  // 메타 응답 키워드 — 다국어·변형 표현 포괄
  const metaPatterns = [
    /저장(?:했|되었|함|되어|이 완료)/,         // "저장했습니다", "저장되었습니다", "저장 완료"
    /파일(?:이|을)?\s*(?:생성|저장|작성)되/,    // "파일이 생성되었습니다"
    /\/tmp\/[^\s"'<>]+\.html/i,                 // tmp 경로 노출
    /\*\*구성\s*요약\*\*/,                       // "**구성 요약**"
    /(?:created|wrote|saved)\s+(?:the\s+)?(?:html\s+)?file/i,
    /saved\s+to\s+['"`]?\/(?:tmp|var)/i,
    /HTML\s*파일을\s*[`'"]/                      // "HTML 파일을 `..`에 저장"
  ];
  for (const pat of metaPatterns) {
    if (pat.test(bodyContent)) {
      throw new Error(
        "모델이 HTML 본문 대신 메타 설명을 반환했습니다 (예: '저장했습니다'). 재생성하세요.",
      );
    }
  }

  // body 안 텍스트 콘텐츠가 너무 적으면 (50자 미만) 빈 껍데기
  const stripped = bodyContent.replace(/<[^>]+>/g, "").trim();
  if (stripped.length < 50) {
    throw new Error(
      `body 콘텐츠가 비어 있습니다 (${stripped.length}자). 모델이 본문을 작성하지 않았습니다. 재생성하세요.`,
    );
  }

  // 구조 컴포넌트 개수 — section/article/header/footer/main 합계 ≥ minStructuralTags
  // 짧은 메타 응답을 단일 <p>로 감싼 케이스 차단 (이전 회귀 사례)
  const structuralTagRe = /<(section|article|header|footer|main|nav|aside)\b/gi;
  const structuralCount = (bodyContent.match(structuralTagRe) ?? []).length;
  if (structuralCount < minStructuralTags) {
    throw new Error(
      `구조 태그가 부족합니다 (${structuralCount}개, 필요 ${minStructuralTags}개+). 모델이 풀 페이지를 그리지 않았습니다. 재생성하세요.`,
    );
  }
}
