import type { FeatureModule } from "../../features/featureRegistry";
import { getFeatureSetting } from "../../features/featureSettings";
import { normalizeControlTask } from "./controlRequest";

type PermissionPolicy = "request" | "basic" | "auto" | "full" | "bypass" | "danger";

function normalizeConfiguredControlTask(...args: Parameters<typeof normalizeControlTask>) {
  if (!getFeatureSetting("atelier-cli", "enabled", true)) {
    throw new Error("The Atelier CLI feature is disabled in Feature settings.");
  }
  const task = normalizeControlTask(...args);
  const permissionPolicy = getFeatureSetting<PermissionPolicy>("atelier-cli", "permissionPolicy", "request");
  if (permissionPolicy === "basic") {
    return { ...task, permissionMode: "basic" as const };
  }
  if (permissionPolicy === "auto") {
    return { ...task, permissionMode: "auto" as const };
  }
  if (permissionPolicy === "full" || permissionPolicy === "bypass" || permissionPolicy === "danger") {
    return { ...task, permissionMode: "basic" as const };
  }
  return task;
}

const feature: FeatureModule = {
  id: "atelier-cli",
  order: 10,
  settings: {
    title: { ko: "Atelier CLI", en: "Atelier CLI" },
    description: {
      ko: "자연어 작업 요청을 로컬 에이전트 실행으로 정규화합니다.",
      en: "Normalizes task requests into local agent executions.",
    },
    settings: [
      { key: "enabled", kind: "toggle", label: { ko: "CLI 제어 허용", en: "Enable CLI control" }, defaultValue: true },
      {
        key: "permissionPolicy",
        kind: "select",
        label: { ko: "원격 작업 권한 정책", en: "Remote task permission policy" },
        hint: { ko: "요청값을 유지하거나 기본/자동 검토 권한으로 제한합니다.", en: "Keep the requested value or force basic/auto-review permissions." },
        defaultValue: "request",
        options: [
          { value: "request", label: { ko: "요청값 유지", en: "Use request" } },
          { value: "basic", label: { ko: "항상 기본 권한", en: "Always basic" } },
          { value: "auto", label: { ko: "항상 자동 검토", en: "Always auto review" } },
        ],
      },
    ],
  },
  controlTaskNormalizer: normalizeConfiguredControlTask,
};

export default feature;
