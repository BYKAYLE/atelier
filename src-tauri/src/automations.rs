use chrono::{Duration as ChronoDuration, Local, NaiveTime, TimeZone};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const AUTOMATIONS_SCHEMA_VERSION: u32 = 1;
const MIN_INTERVAL_MINUTES: u32 = 5;
const MAX_INTERVAL_MINUTES: u32 = 10_080;
const DEFAULT_GRACE_MINUTES: u32 = 30;
const MAX_GRACE_MINUTES: u32 = 1_440;

static STORE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationSchedule {
    pub(crate) kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) interval_minutes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) local_time: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationDefinition {
    pub(crate) schema_version: u32,
    pub(crate) automation_id: String,
    pub(crate) name: String,
    pub(crate) prompt: String,
    pub(crate) workspace: String,
    pub(crate) provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) effort: Option<String>,
    pub(crate) permission_mode: String,
    pub(crate) stella_mode: bool,
    pub(crate) enabled: bool,
    pub(crate) schedule: AutomationSchedule,
    pub(crate) missed_run_grace_minutes: u32,
    pub(crate) created_at_unix_ms: u64,
    pub(crate) updated_at_unix_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) last_dispatched_at_unix_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) next_run_at_unix_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationRun {
    pub(crate) schema_version: u32,
    pub(crate) run_id: String,
    pub(crate) automation_id: String,
    pub(crate) automation_name: String,
    pub(crate) trigger: String,
    pub(crate) status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) request_id: Option<String>,
    pub(crate) created_at_unix_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) finished_at_unix_ms: Option<u64>,
    pub(crate) summary: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutomationStore {
    schema_version: u32,
    automations: Vec<AutomationDefinition>,
    runs: Vec<AutomationRun>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_tick_at_unix_ms: Option<u64>,
}

impl Default for AutomationStore {
    fn default() -> Self {
        Self {
            schema_version: AUTOMATIONS_SCHEMA_VERSION,
            automations: Vec::new(),
            runs: Vec::new(),
            last_tick_at_unix_ms: None,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationUpsertInput {
    #[serde(default)]
    automation_id: Option<String>,
    name: String,
    prompt: String,
    workspace: String,
    provider: String,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    effort: Option<String>,
    permission_mode: String,
    #[serde(default)]
    stella_mode: bool,
    #[serde(default)]
    enabled: bool,
    schedule: AutomationSchedule,
    #[serde(default = "default_grace_minutes")]
    missed_run_grace_minutes: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutomationSnapshot {
    schema_version: u32,
    automations: Vec<AutomationDefinition>,
    runs: Vec<AutomationRun>,
    last_tick_at_unix_ms: Option<u64>,
}

fn default_grace_minutes() -> u32 {
    DEFAULT_GRACE_MINUTES
}

fn now_unix_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("system clock is before Unix epoch: {error}"))
}

fn private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("create automations directory {}: {error}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("secure automations directory {}: {error}", path.display()))?;
    }
    Ok(())
}

fn store_path() -> Result<PathBuf, String> {
    let root = crate::control_plane::application_data_dir()?
        .join("automations")
        .join(format!("v{AUTOMATIONS_SCHEMA_VERSION}"));
    private_dir(&root)?;
    Ok(root.join("store.json"))
}

fn load_store() -> Result<AutomationStore, String> {
    let path = store_path()?;
    if !path.exists() {
        return Ok(AutomationStore::default());
    }
    let content = fs::read(&path)
        .map_err(|error| format!("read automations store {}: {error}", path.display()))?;
    let store: AutomationStore = serde_json::from_slice(&content)
        .map_err(|error| format!("parse automations store {}: {error}", path.display()))?;
    if store.schema_version != AUTOMATIONS_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported automations schema {} (expected {}).",
            store.schema_version, AUTOMATIONS_SCHEMA_VERSION
        ));
    }
    Ok(store)
}

fn save_store(store: &AutomationStore) -> Result<(), String> {
    let path = store_path()?;
    let content = serde_json::to_vec_pretty(store)
        .map_err(|error| format!("serialize automations store: {error}"))?;
    fs::write(&path, content)
        .map_err(|error| format!("write automations store {}: {error}", path.display()))?;
    crate::chmod_600(&path);
    Ok(())
}

fn clean_optional(
    value: Option<String>,
    max: usize,
    label: &str,
) -> Result<Option<String>, String> {
    let value = value.map(|candidate| candidate.trim().to_string());
    let Some(value) = value.filter(|candidate| !candidate.is_empty()) else {
        return Ok(None);
    };
    if value.chars().count() > max {
        return Err(format!("{label} is too long."));
    }
    Ok(Some(value))
}

fn canonical_workspace(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("An automation workspace is required.".to_string());
    }
    let canonical = fs::canonicalize(trimmed)
        .map_err(|error| format!("resolve automation workspace '{trimmed}': {error}"))?;
    if !canonical.is_dir() {
        return Err("The automation workspace must be a directory.".to_string());
    }
    Ok(canonical.to_string_lossy().into_owned())
}

fn normalized_schedule(schedule: AutomationSchedule) -> Result<AutomationSchedule, String> {
    match schedule.kind.trim().to_ascii_lowercase().as_str() {
        "manual" => Ok(AutomationSchedule {
            kind: "manual".to_string(),
            interval_minutes: None,
            local_time: None,
        }),
        "interval" => {
            let minutes = schedule
                .interval_minutes
                .ok_or_else(|| "Interval automations require intervalMinutes.".to_string())?;
            if !(MIN_INTERVAL_MINUTES..=MAX_INTERVAL_MINUTES).contains(&minutes) {
                return Err(format!(
                    "Automation intervals must be between {MIN_INTERVAL_MINUTES} and {MAX_INTERVAL_MINUTES} minutes."
                ));
            }
            Ok(AutomationSchedule {
                kind: "interval".to_string(),
                interval_minutes: Some(minutes),
                local_time: None,
            })
        }
        "daily" => {
            let local_time = schedule
                .local_time
                .as_deref()
                .ok_or_else(|| "Daily automations require localTime.".to_string())?;
            NaiveTime::parse_from_str(local_time, "%H:%M")
                .map_err(|_| "Daily automation localTime must use HH:MM.".to_string())?;
            Ok(AutomationSchedule {
                kind: "daily".to_string(),
                interval_minutes: None,
                local_time: Some(local_time.to_string()),
            })
        }
        _ => Err("Automation schedule kind must be manual, interval, or daily.".to_string()),
    }
}

fn next_run_at(schedule: &AutomationSchedule, now_ms: u64) -> Result<Option<u64>, String> {
    match schedule.kind.as_str() {
        "manual" => Ok(None),
        "interval" => {
            let minutes = schedule
                .interval_minutes
                .ok_or_else(|| "Interval schedule is missing intervalMinutes.".to_string())?;
            Ok(Some(
                now_ms.saturating_add(u64::from(minutes).saturating_mul(60_000)),
            ))
        }
        "daily" => {
            let time = NaiveTime::parse_from_str(
                schedule
                    .local_time
                    .as_deref()
                    .ok_or_else(|| "Daily schedule is missing localTime.".to_string())?,
                "%H:%M",
            )
            .map_err(|_| "Daily automation localTime must use HH:MM.".to_string())?;
            let now = Local
                .timestamp_millis_opt(
                    i64::try_from(now_ms).map_err(|_| "Timestamp overflow.".to_string())?,
                )
                .single()
                .ok_or_else(|| "Could not resolve the local automation time.".to_string())?;
            let today = now.date_naive().and_time(time);
            let mut candidate = Local
                .from_local_datetime(&today)
                .earliest()
                .ok_or_else(|| "The requested local automation time does not exist.".to_string())?;
            if candidate <= now {
                candidate += ChronoDuration::days(1);
            }
            Ok(Some(candidate.timestamp_millis() as u64))
        }
        _ => Err("Unsupported automation schedule kind.".to_string()),
    }
}

fn validate_input(
    input: AutomationUpsertInput,
    now_ms: u64,
) -> Result<AutomationUpsertInput, String> {
    let name = input.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 120 {
        return Err("Automation names must contain 1 to 120 characters.".to_string());
    }
    let prompt = input.prompt.trim().to_string();
    if prompt.is_empty() || prompt.chars().count() > 20_000 {
        return Err("Automation prompts must contain 1 to 20,000 characters.".to_string());
    }
    let provider = input.provider.trim().to_ascii_lowercase();
    if !matches!(
        provider.as_str(),
        "claude" | "codex" | "hermes" | "gajecode"
    ) {
        return Err("Automation provider must be claude, codex, hermes, or gajecode.".to_string());
    }
    let permission_mode = input.permission_mode.trim().to_ascii_lowercase();
    if !matches!(permission_mode.as_str(), "basic" | "auto") {
        return Err(
            "Scheduled automations allow basic or auto permission only; full permission requires an interactive run."
                .to_string(),
        );
    }
    if !(1..=MAX_GRACE_MINUTES).contains(&input.missed_run_grace_minutes) {
        return Err(format!(
            "Missed-run grace must be between 1 and {MAX_GRACE_MINUTES} minutes."
        ));
    }
    if let Some(automation_id) = input.automation_id.as_deref() {
        Uuid::parse_str(automation_id).map_err(|_| "Invalid automation id.".to_string())?;
    }
    let normalized = AutomationUpsertInput {
        automation_id: input.automation_id,
        name,
        prompt,
        workspace: canonical_workspace(&input.workspace)?,
        provider,
        model: clean_optional(input.model, 200, "Automation model")?,
        effort: clean_optional(input.effort, 80, "Automation effort")?,
        permission_mode,
        stella_mode: input.stella_mode,
        enabled: input.enabled,
        schedule: normalized_schedule(input.schedule)?,
        missed_run_grace_minutes: input.missed_run_grace_minutes,
    };
    let _ = next_run_at(&normalized.schedule, now_ms)?;
    Ok(normalized)
}

fn reconcile_runs(store: &mut AutomationStore) -> Result<bool, String> {
    let mut changed = false;
    for run in store.runs.iter_mut().filter(|run| run.status == "queued") {
        let Some(request_id) = run.request_id.as_deref() else {
            continue;
        };
        let Some(receipt) = crate::control_plane::receipt(request_id)? else {
            continue;
        };
        run.status = receipt.status;
        run.finished_at_unix_ms = Some(receipt.finished_at_unix_ms);
        run.summary = receipt.summary;
        changed = true;
    }
    Ok(changed)
}

fn snapshot_from(store: &AutomationStore) -> AutomationSnapshot {
    let mut automations = store.automations.clone();
    automations.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    let mut runs = store.runs.clone();
    runs.sort_by(|left, right| right.created_at_unix_ms.cmp(&left.created_at_unix_ms));
    AutomationSnapshot {
        schema_version: AUTOMATIONS_SCHEMA_VERSION,
        automations,
        runs,
        last_tick_at_unix_ms: store.last_tick_at_unix_ms,
    }
}

fn dispatch(
    automation: &AutomationDefinition,
    trigger: &str,
    now_ms: u64,
) -> Result<AutomationRun, String> {
    let request = crate::control_plane::enqueue_request(
        "task.dispatch",
        Some(automation.workspace.clone()),
        json!({
            "provider": automation.provider,
            "prompt": automation.prompt,
            "model": automation.model,
            "effort": automation.effort,
            "permissionMode": automation.permission_mode,
            "stellaMode": automation.stella_mode,
            "automationId": automation.automation_id,
            "automationName": automation.name,
        }),
        &format!("automation:{}", automation.automation_id),
    )?;
    Ok(AutomationRun {
        schema_version: AUTOMATIONS_SCHEMA_VERSION,
        run_id: Uuid::new_v4().to_string(),
        automation_id: automation.automation_id.clone(),
        automation_name: automation.name.clone(),
        trigger: trigger.to_string(),
        status: "queued".to_string(),
        request_id: Some(request.request_id),
        created_at_unix_ms: now_ms,
        finished_at_unix_ms: None,
        summary: "Queued in the Atelier task dispatcher.".to_string(),
    })
}

#[tauri::command]
pub(crate) fn automations_snapshot() -> Result<AutomationSnapshot, String> {
    let _guard = STORE_LOCK
        .lock()
        .map_err(|_| "The automations store lock is poisoned.".to_string())?;
    let mut store = load_store()?;
    if reconcile_runs(&mut store)? {
        save_store(&store)?;
    }
    Ok(snapshot_from(&store))
}

#[tauri::command]
pub(crate) fn automation_upsert(
    input: AutomationUpsertInput,
) -> Result<AutomationDefinition, String> {
    let _guard = STORE_LOCK
        .lock()
        .map_err(|_| "The automations store lock is poisoned.".to_string())?;
    let now_ms = now_unix_ms()?;
    let input = validate_input(input, now_ms)?;
    let mut store = load_store()?;
    let existing_index = input.automation_id.as_ref().and_then(|id| {
        store
            .automations
            .iter()
            .position(|automation| &automation.automation_id == id)
    });
    if input.automation_id.is_some() && existing_index.is_none() {
        return Err("The automation no longer exists.".to_string());
    }
    let created_at = existing_index
        .map(|index| store.automations[index].created_at_unix_ms)
        .unwrap_or(now_ms);
    let last_dispatched =
        existing_index.and_then(|index| store.automations[index].last_dispatched_at_unix_ms);
    let automation = AutomationDefinition {
        schema_version: AUTOMATIONS_SCHEMA_VERSION,
        automation_id: input
            .automation_id
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        name: input.name,
        prompt: input.prompt,
        workspace: input.workspace,
        provider: input.provider,
        model: input.model,
        effort: input.effort,
        permission_mode: input.permission_mode,
        stella_mode: input.stella_mode,
        enabled: input.enabled,
        next_run_at_unix_ms: if input.enabled {
            next_run_at(&input.schedule, now_ms)?
        } else {
            None
        },
        schedule: input.schedule,
        missed_run_grace_minutes: input.missed_run_grace_minutes,
        created_at_unix_ms: created_at,
        updated_at_unix_ms: now_ms,
        last_dispatched_at_unix_ms: last_dispatched,
    };
    if let Some(index) = existing_index {
        store.automations[index] = automation.clone();
    } else {
        store.automations.push(automation.clone());
    }
    save_store(&store)?;
    Ok(automation)
}

#[tauri::command]
pub(crate) fn automation_set_enabled(
    automation_id: String,
    enabled: bool,
) -> Result<AutomationDefinition, String> {
    let _guard = STORE_LOCK
        .lock()
        .map_err(|_| "The automations store lock is poisoned.".to_string())?;
    let now_ms = now_unix_ms()?;
    let mut store = load_store()?;
    let automation = store
        .automations
        .iter_mut()
        .find(|automation| automation.automation_id == automation_id)
        .ok_or_else(|| "The automation no longer exists.".to_string())?;
    automation.enabled = enabled;
    automation.updated_at_unix_ms = now_ms;
    automation.next_run_at_unix_ms = if enabled {
        next_run_at(&automation.schedule, now_ms)?
    } else {
        None
    };
    let result = automation.clone();
    save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub(crate) fn automation_run_now(automation_id: String) -> Result<AutomationRun, String> {
    let _guard = STORE_LOCK
        .lock()
        .map_err(|_| "The automations store lock is poisoned.".to_string())?;
    let now_ms = now_unix_ms()?;
    let mut store = load_store()?;
    let index = store
        .automations
        .iter()
        .position(|automation| automation.automation_id == automation_id)
        .ok_or_else(|| "The automation no longer exists.".to_string())?;
    let run = dispatch(&store.automations[index], "manual", now_ms)?;
    store.automations[index].last_dispatched_at_unix_ms = Some(now_ms);
    store.automations[index].updated_at_unix_ms = now_ms;
    store.runs.push(run.clone());
    save_store(&store)?;
    Ok(run)
}

#[tauri::command]
pub(crate) fn automations_tick() -> Result<AutomationSnapshot, String> {
    let _guard = STORE_LOCK
        .lock()
        .map_err(|_| "The automations store lock is poisoned.".to_string())?;
    let now_ms = now_unix_ms()?;
    let mut store = load_store()?;
    let _ = reconcile_runs(&mut store)?;
    let due = store
        .automations
        .iter()
        .enumerate()
        .filter_map(|(index, automation)| {
            automation
                .enabled
                .then_some(automation.next_run_at_unix_ms)
                .flatten()
                .filter(|scheduled_at| *scheduled_at <= now_ms)
                .map(|scheduled_at| (index, scheduled_at))
        })
        .collect::<Vec<_>>();

    for (index, scheduled_at) in due {
        let grace_ms =
            u64::from(store.automations[index].missed_run_grace_minutes).saturating_mul(60_000);
        if now_ms.saturating_sub(scheduled_at) <= grace_ms {
            let run = dispatch(&store.automations[index], "scheduled", now_ms)?;
            store.runs.push(run);
            store.automations[index].last_dispatched_at_unix_ms = Some(now_ms);
        } else {
            store.runs.push(AutomationRun {
                schema_version: AUTOMATIONS_SCHEMA_VERSION,
                run_id: Uuid::new_v4().to_string(),
                automation_id: store.automations[index].automation_id.clone(),
                automation_name: store.automations[index].name.clone(),
                trigger: "missed".to_string(),
                status: "skipped".to_string(),
                request_id: None,
                created_at_unix_ms: now_ms,
                finished_at_unix_ms: Some(now_ms),
                summary: "Skipped because the missed-run grace window elapsed.".to_string(),
            });
        }
        store.automations[index].updated_at_unix_ms = now_ms;
        store.automations[index].next_run_at_unix_ms =
            next_run_at(&store.automations[index].schedule, now_ms)?;
    }
    store.last_tick_at_unix_ms = Some(now_ms);
    save_store(&store)?;
    Ok(snapshot_from(&store))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interval_schedule_respects_minimum_and_calculates_next_run() {
        let schedule = normalized_schedule(AutomationSchedule {
            kind: "interval".to_string(),
            interval_minutes: Some(15),
            local_time: None,
        })
        .unwrap();
        assert_eq!(next_run_at(&schedule, 1_000).unwrap(), Some(901_000));
        assert!(normalized_schedule(AutomationSchedule {
            kind: "interval".to_string(),
            interval_minutes: Some(1),
            local_time: None,
        })
        .is_err());
    }

    #[test]
    fn daily_schedule_requires_a_real_clock_time() {
        assert!(normalized_schedule(AutomationSchedule {
            kind: "daily".to_string(),
            interval_minutes: None,
            local_time: Some("25:99".to_string()),
        })
        .is_err());
        assert_eq!(
            normalized_schedule(AutomationSchedule {
                kind: "daily".to_string(),
                interval_minutes: None,
                local_time: Some("09:30".to_string()),
            })
            .unwrap()
            .local_time
            .as_deref(),
            Some("09:30")
        );
    }
}
