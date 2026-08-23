import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFeatureSetting } from "../../features/featureSettings";
import { safeLocalStorageGet } from "../../lib/storage";
import {
  automationRunNow,
  automationSetEnabled,
  automationUpsert,
  automationsSnapshot,
  type AgentPermissionMode,
  type AgentProvider,
  type AutomationDefinition,
  type AutomationSchedule,
  type AutomationSnapshot,
  type AutomationUpsertInput,
} from "../../lib/tauri";
import { cls, type Tweaks } from "../../lib/tokens";
import { I } from "../Icons";

interface Props {
  tw: Tweaks;
}

type ScheduleKind = AutomationSchedule["kind"];

interface FormState {
  automationId?: string;
  name: string;
  prompt: string;
  workspace: string;
  provider: AgentProvider;
  model: string;
  effort: string;
  permissionMode: Exclude<AgentPermissionMode, "full">;
  stellaMode: boolean;
  enabled: boolean;
  scheduleKind: ScheduleKind;
  intervalMinutes: number;
  localTime: string;
  missedRunGraceMinutes: number;
}

const WORKSPACE_KEY = "atelier.agent.cwd.v1";

function emptyForm(): FormState {
  return {
    name: "",
    prompt: "",
    workspace: safeLocalStorageGet(WORKSPACE_KEY) || "",
    provider: "codex",
    model: "",
    effort: "",
    permissionMode: "basic",
    stellaMode: false,
    enabled: true,
    scheduleKind: "manual",
    intervalMinutes: 30,
    localTime: "09:00",
    missedRunGraceMinutes: 30,
  };
}

function formFromAutomation(automation: AutomationDefinition): FormState {
  return {
    automationId: automation.automationId,
    name: automation.name,
    prompt: automation.prompt,
    workspace: automation.workspace,
    provider: automation.provider,
    model: automation.model ?? "",
    effort: automation.effort ?? "",
    permissionMode: automation.permissionMode,
    stellaMode: automation.stellaMode,
    enabled: automation.enabled,
    scheduleKind: automation.schedule.kind,
    intervalMinutes: automation.schedule.kind === "interval"
      ? automation.schedule.intervalMinutes
      : 30,
    localTime: automation.schedule.kind === "daily" ? automation.schedule.localTime : "09:00",
    missedRunGraceMinutes: automation.missedRunGraceMinutes,
  };
}

function scheduleFromForm(form: FormState): AutomationSchedule {
  if (form.scheduleKind === "interval") {
    return { kind: "interval", intervalMinutes: form.intervalMinutes };
  }
  if (form.scheduleKind === "daily") {
    return { kind: "daily", localTime: form.localTime };
  }
  return { kind: "manual" };
}

function formatDate(value: number | null | undefined, language: "ko" | "en") {
  if (!value) return language === "ko" ? "없음" : "None";
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function scheduleLabel(automation: AutomationDefinition, ko: boolean) {
  const schedule = automation.schedule;
  if (schedule.kind === "manual") return ko ? "수동 실행" : "Manual";
  if (schedule.kind === "interval") {
    return ko ? `${schedule.intervalMinutes}분마다` : `Every ${schedule.intervalMinutes} min`;
  }
  return ko ? `매일 ${schedule.localTime}` : `Daily at ${schedule.localTime}`;
}

const AutomationsPage: React.FC<Props> = ({ tw }) => {
  const ko = tw.language === "ko";
  const dark = tw.dark;
  const [featureEnabled] = useFeatureSetting<boolean>("automations", "enabled", true);
  const [snapshot, setSnapshot] = useState<AutomationSnapshot | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await automationsSnapshot());
      setError(null);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const recentRuns = useMemo(() => (snapshot?.runs ?? []).slice(0, 20), [snapshot]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function beginNew() {
    setForm(emptyForm());
    setEditorOpen(true);
    setError(null);
  }

  function beginEdit(automation: AutomationDefinition) {
    setForm(formFromAutomation(automation));
    setEditorOpen(true);
    setError(null);
  }

  async function saveAutomation() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const input: AutomationUpsertInput = {
      automationId: form.automationId ?? null,
      name: form.name,
      prompt: form.prompt,
      workspace: form.workspace,
      provider: form.provider,
      model: form.model || null,
      effort: form.effort || null,
      permissionMode: form.permissionMode,
      stellaMode: form.stellaMode,
      enabled: form.enabled,
      schedule: scheduleFromForm(form),
      missedRunGraceMinutes: form.missedRunGraceMinutes,
    };
    try {
      await automationUpsert(input);
      setEditorOpen(false);
      setForm(emptyForm());
      await refresh();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function setEnabled(automation: AutomationDefinition, enabled: boolean) {
    setBusyId(automation.automationId);
    setError(null);
    try {
      await automationSetEnabled(automation.automationId, enabled);
      await refresh();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(automation: AutomationDefinition) {
    setBusyId(automation.automationId);
    setError(null);
    try {
      await automationRunNow(automation.automationId);
      await refresh();
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setBusyId(null);
    }
  }

  const fieldClass = cls(
    "h-10 w-full rounded-md border bg-transparent px-3 text-[12.5px] outline-none focus:border-[var(--accent)] disabled:opacity-50",
    dark ? "border-dline text-dink" : "border-line text-ink",
  );
  const buttonClass = cls(
    "h-9 rounded-md border px-3 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50",
    dark ? "border-dline hover:bg-dbg" : "border-line hover:bg-cream",
  );

  return (
    <div data-testid="automations-page">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={cls("font-display text-[32px] font-medium leading-tight", dark ? "text-dink" : "text-ink")}>
            {ko ? "자동화" : "Automations"}
          </h1>
          <p className={cls("mt-2 max-w-[660px] text-[14px] leading-relaxed", dark ? "text-dsub" : "text-sub")}>
            {ko
              ? "반복 작업을 Atelier 작업 큐에 예약하고 실행 결과를 한곳에서 확인합니다."
              : "Schedule recurring work through Atelier's task queue and review every run."}
          </p>
        </div>
        <button type="button" onClick={beginNew} disabled={!featureEnabled} className={buttonClass}>
          <span className="mr-1.5 inline-flex align-middle">{I.plus}</span>
          {ko ? "새 자동화" : "New automation"}
        </button>
      </div>

      {!featureEnabled && (
        <div className={cls("mb-4 rounded-md border px-4 py-3 text-[12.5px]", dark ? "border-dline text-dsub" : "border-line text-sub")}>
          {ko
            ? "기능 설정에서 자동화를 켜면 예약 실행을 다시 시작합니다. 저장된 정의와 기록은 그대로입니다."
            : "Enable Automations in Feature settings to resume scheduled runs. Definitions and history are preserved."}
        </div>
      )}

      {editorOpen && (
        <section className={cls("mb-5 overflow-hidden rounded-lg border", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}>
          <header className={cls("flex items-center justify-between border-b px-4 py-3", dark ? "border-dline" : "border-line")}>
            <h2 className="text-[14px] font-semibold">
              {form.automationId ? (ko ? "자동화 편집" : "Edit automation") : (ko ? "새 자동화" : "New automation")}
            </h2>
            <button type="button" onClick={() => setEditorOpen(false)} className="p-1 opacity-65 hover:opacity-100" title={ko ? "닫기" : "Close"}>
              {I.x}
            </button>
          </header>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <Field label={ko ? "이름" : "Name"}>
              <input className={fieldClass} value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
            </Field>
            <Field label={ko ? "작업 폴더" : "Workspace"}>
              <input className={fieldClass} value={form.workspace} onChange={(event) => updateForm("workspace", event.target.value)} />
            </Field>
            <div className="md:col-span-2">
              <Field label={ko ? "요청" : "Prompt"}>
                <textarea
                  className={cls(fieldClass, "h-[112px] resize-y py-2.5 leading-relaxed")}
                  value={form.prompt}
                  onChange={(event) => updateForm("prompt", event.target.value)}
                />
              </Field>
            </div>
            <Field label={ko ? "에이전트" : "Agent"}>
              <select className={fieldClass} value={form.provider} onChange={(event) => updateForm("provider", event.target.value as AgentProvider)}>
                <option value="claude">Claude Code</option>
                <option value="codex">Codex CLI</option>
                <option value="hermes">Hermes</option>
                <option value="gajecode">Gajae Code</option>
                <option value="grok">Grok Build</option>
              </select>
            </Field>
            <Field label={ko ? "권한" : "Permission"}>
              <select className={fieldClass} value={form.permissionMode} onChange={(event) => updateForm("permissionMode", event.target.value as FormState["permissionMode"])}>
                <option value="basic">{ko ? "기본 권한" : "Basic"}</option>
                <option value="auto">{ko ? "자동 검토" : "Auto review"}</option>
              </select>
            </Field>
            <Field label={ko ? "모델 (선택)" : "Model (optional)"}>
              <input className={fieldClass} value={form.model} onChange={(event) => updateForm("model", event.target.value)} />
            </Field>
            <Field label={ko ? "작업량 (선택)" : "Effort (optional)"}>
              <input className={fieldClass} value={form.effort} onChange={(event) => updateForm("effort", event.target.value)} />
            </Field>
            <Field label={ko ? "실행 방식" : "Schedule"}>
              <select className={fieldClass} value={form.scheduleKind} onChange={(event) => updateForm("scheduleKind", event.target.value as ScheduleKind)}>
                <option value="manual">{ko ? "수동" : "Manual"}</option>
                <option value="interval">{ko ? "반복 간격" : "Interval"}</option>
                <option value="daily">{ko ? "매일" : "Daily"}</option>
              </select>
            </Field>
            {form.scheduleKind === "interval" && (
              <Field label={ko ? "간격 (분)" : "Interval (minutes)"}>
                <input type="number" min={5} max={10080} className={fieldClass} value={form.intervalMinutes} onChange={(event) => updateForm("intervalMinutes", Number(event.target.value))} />
              </Field>
            )}
            {form.scheduleKind === "daily" && (
              <Field label={ko ? "실행 시각" : "Local time"}>
                <input type="time" className={fieldClass} value={form.localTime} onChange={(event) => updateForm("localTime", event.target.value)} />
              </Field>
            )}
            <Field label={ko ? "지연 허용 (분)" : "Missed-run grace (minutes)"}>
              <input type="number" min={1} max={1440} className={fieldClass} value={form.missedRunGraceMinutes} onChange={(event) => updateForm("missedRunGraceMinutes", Number(event.target.value))} />
            </Field>
            <div className="flex flex-wrap items-end gap-5 pb-1">
              <Check label={ko ? "활성화" : "Enabled"} checked={form.enabled} onChange={(value) => updateForm("enabled", value)} />
              <Check label="Stella Mode" checked={form.stellaMode} onChange={(value) => updateForm("stellaMode", value)} />
            </div>
          </div>
          <footer className={cls("flex justify-end gap-2 border-t px-4 py-3", dark ? "border-dline" : "border-line")}>
            <button type="button" onClick={() => setEditorOpen(false)} className={buttonClass}>{ko ? "취소" : "Cancel"}</button>
            <button type="button" onClick={() => void saveAutomation()} disabled={saving} className={cls(buttonClass, "border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-90")}>
              {saving ? (ko ? "저장 중..." : "Saving...") : (ko ? "저장" : "Save")}
            </button>
          </footer>
        </section>
      )}

      {error && <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 px-4 py-3 text-[12px] text-red-500">{error}</div>}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{ko ? "예약 작업" : "Scheduled work"}</h2>
          <button type="button" onClick={() => void refresh()} className={buttonClass}>{ko ? "새로고침" : "Refresh"}</button>
        </div>
        {loading ? (
          <p className={cls("py-8 text-[12.5px]", dark ? "text-dsub" : "text-sub")}>{ko ? "불러오는 중..." : "Loading..."}</p>
        ) : (snapshot?.automations.length ?? 0) === 0 ? (
          <div className={cls("rounded-lg border px-5 py-10 text-center", dark ? "border-dline text-dsub" : "border-line text-sub")}>
            <div className="mx-auto mb-2 w-fit text-[var(--accent)]">{I.zap}</div>
            <p className="text-[13px]">{ko ? "아직 등록된 자동화가 없습니다." : "No automations yet."}</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {snapshot!.automations.map((automation) => (
              <article key={automation.automationId} className={cls("rounded-lg border p-4", dark ? "border-dline bg-dpanel" : "border-line bg-panel")}>
                <div className="flex items-start gap-3">
                  <span className={cls("mt-1 h-2 w-2 shrink-0 rounded-full", automation.enabled ? "bg-emerald-500" : "bg-zinc-500")} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14px] font-semibold">{automation.name}</h3>
                    <p className={cls("mt-1 line-clamp-2 text-[11.5px] leading-relaxed", dark ? "text-dsub" : "text-sub")}>{automation.prompt}</p>
                  </div>
                  <button type="button" onClick={() => beginEdit(automation)} className="shrink-0 p-1 opacity-60 hover:opacity-100" title={ko ? "편집" : "Edit"}>{I.gear}</button>
                </div>
                <div className={cls("mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10.5px]", dark ? "text-dsub" : "text-sub")}>
                  <span>{automation.provider} {automation.model || "default"}</span>
                  <span>{scheduleLabel(automation, ko)}</span>
                  <span>{ko ? "다음" : "Next"}: {formatDate(automation.nextRunAtUnixMs, tw.language)}</span>
                  <span>{ko ? "최근" : "Last"}: {formatDate(automation.lastDispatchedAtUnixMs, tw.language)}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={() => void setEnabled(automation, !automation.enabled)} disabled={busyId === automation.automationId} className={buttonClass}>
                    {automation.enabled ? (ko ? "일시중지" : "Pause") : (ko ? "활성화" : "Enable")}
                  </button>
                  <button type="button" onClick={() => void runNow(automation)} disabled={!featureEnabled || busyId === automation.automationId} className={cls(buttonClass, "border-[var(--accent)] text-[var(--accent)]")}>
                    {busyId === automation.automationId ? (ko ? "처리 중..." : "Working...") : (ko ? "지금 실행" : "Run now")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-[15px] font-semibold">{ko ? "최근 실행" : "Recent runs"}</h2>
        {recentRuns.length === 0 ? (
          <p className={cls("py-4 text-[12px]", dark ? "text-dsub" : "text-sub")}>{ko ? "실행 기록이 없습니다." : "No run history."}</p>
        ) : (
          <div className={cls("divide-y overflow-hidden rounded-lg border", dark ? "divide-dline border-dline" : "divide-line border-line")}>
            {recentRuns.map((run) => (
              <div key={run.runId} className="flex min-w-0 items-center gap-3 px-4 py-3 text-[11.5px]">
                <span className={cls("h-2 w-2 shrink-0 rounded-full", run.status === "succeeded" ? "bg-emerald-500" : run.status === "failed" ? "bg-red-500" : run.status === "skipped" ? "bg-amber-500" : "bg-blue-500")} />
                <span className="min-w-0 flex-1 truncate font-medium">{run.automationName}</span>
                <span className={cls("shrink-0", dark ? "text-dsub" : "text-sub")}>{run.trigger} · {run.status}</span>
                <span className={cls("hidden shrink-0 sm:block", dark ? "text-dsub" : "text-sub")}>{formatDate(run.createdAtUnixMs, tw.language)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block text-[11.5px]">
    <span className="mb-1.5 block opacity-70">{label}</span>
    {children}
  </label>
);

const Check: React.FC<{ label: string; checked: boolean; onChange: (value: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex cursor-pointer items-center gap-2 text-[12px]">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-[var(--accent)]" />
    {label}
  </label>
);

export default AutomationsPage;
