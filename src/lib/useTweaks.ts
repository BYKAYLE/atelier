import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_TWEAKS, mergeDefaultProfiles, Profile, Tweaks, WELCOME_COPY } from "./tokens";
import { isTauri, loadProfilesFile, saveProfilesFile } from "./tauri";

const KEY = "atelier.tweaks";

function load(): Tweaks {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_TWEAKS };
    const parsed = JSON.parse(raw) as Partial<Tweaks>;
    // profiles 유효성 검사 — localStorage 손상/누락 시 DEFAULT로 fallback.
    const profiles: Profile[] =
      Array.isArray(parsed.profiles) && parsed.profiles.length > 0
        ? mergeDefaultProfiles(parsed.profiles)
        : DEFAULT_TWEAKS.profiles;
    const language = parsed.language === "en" ? "en" : "ko";
    const defaultHeadlines = Object.values(WELCOME_COPY).map((v) => v.headline);
    const defaultSubs = Object.values(WELCOME_COPY).map((v) => v.sub);
    const welcomeHeadline =
      !parsed.welcomeHeadline || defaultHeadlines.includes(parsed.welcomeHeadline)
        ? WELCOME_COPY[language].headline
        : parsed.welcomeHeadline;
    const welcomeSub =
      !parsed.welcomeSub || defaultSubs.includes(parsed.welcomeSub)
        ? WELCOME_COPY[language].sub
        : parsed.welcomeSub;
    return { ...DEFAULT_TWEAKS, ...parsed, language, welcomeHeadline, welcomeSub, profiles };
  } catch {
    return { ...DEFAULT_TWEAKS };
  }
}

export function useTweaks(): [Tweaks, (patch: Partial<Tweaks>) => void] {
  const [tw, setTw] = useState<Tweaks>(() => load());
  const profilesLoadedRef = useRef(false);

  // 앱 시작 시 파일에서 profiles 1회 복원. 이전 구현에서 load 시작 **즉시**
  // profilesLoadedRef=true 설정 후 비동기 load 하는 바람에, 완료 전에 save effect가
  // 먼저 돌아 localStorage 값으로 파일을 덮어썼다(Hermes 등 사용자 프로필 유실).
  // 수정: load 완료 **후**에 profilesLoadedRef를 set → save는 그 이후로 게이팅.
  useEffect(() => {
    if (profilesLoadedRef.current) return;
    if (!isTauri()) {
      profilesLoadedRef.current = true;
      return;
    }
    (async () => {
      try {
        const raw = await loadProfilesFile();
        if (raw.trim()) {
          const parsed = JSON.parse(raw) as Profile[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTw((prev) => ({ ...prev, profiles: mergeDefaultProfiles(parsed) }));
          }
        }
      } catch (err) {
        console.warn("load profiles file failed", err);
      } finally {
        profilesLoadedRef.current = true;
      }
    })();
  }, []);

  // localStorage 저장 (기존) + profiles는 파일에도 저장해 이중 백업.
  // 파일 load가 끝나기 전에는 파일 save 금지 (위 경쟁 조건 방어).
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(tw));
    } catch {}
    if (isTauri() && profilesLoadedRef.current) {
      saveProfilesFile(JSON.stringify(tw.profiles)).catch((err) =>
        console.warn("save profiles file failed", err),
      );
    }
  }, [tw]);

  const patch = useCallback((p: Partial<Tweaks>) => {
    setTw((prev) => ({ ...prev, ...p }));
  }, []);
  return [tw, patch];
}
