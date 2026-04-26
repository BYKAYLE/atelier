import { useEffect, useRef } from "react";

/**
 * 자동 파이프라인용 단발 트리거 hook.
 * shouldTrigger가 true가 되는 첫 순간 generate를 1회만 호출. 다시 false→true 변동에도 재호출 X.
 *
 * 사용 예:
 *   useAutoTrigger(
 *     !!project.autoMode && !!project.brief && !project.system && !busy,
 *     generate,
 *   );
 *
 * 이전엔 6개 컴포넌트가 각자 useRef + useEffect로 같은 패턴 반복 — 이 hook으로 통합.
 */
export function useAutoTrigger(shouldTrigger: boolean, generate: () => void): void {
  const triggered = useRef(false);
  const generateRef = useRef(generate);
  generateRef.current = generate;

  useEffect(() => {
    if (shouldTrigger && !triggered.current) {
      triggered.current = true;
      generateRef.current();
    }
  }, [shouldTrigger]);
}

/**
 * 자동 파이프라인용 단발 advance hook.
 * shouldAdvance true가 되면 delayMs 후 onAdvance 1회 호출. cleanup으로 timer 해제.
 *
 * 사용 예:
 *   useAutoAdvance(
 *     !!project.autoMode && !!project.system && !busy,
 *     onNext,
 *   );
 */
export function useAutoAdvance(
  shouldAdvance: boolean,
  onAdvance: () => void,
  delayMs = 600,
): void {
  const advanced = useRef(false);
  const onAdvanceRef = useRef(onAdvance);
  onAdvanceRef.current = onAdvance;

  useEffect(() => {
    if (shouldAdvance && !advanced.current) {
      advanced.current = true;
      const t = window.setTimeout(() => onAdvanceRef.current(), delayMs);
      return () => window.clearTimeout(t);
    }
  }, [shouldAdvance, delayMs]);
}
