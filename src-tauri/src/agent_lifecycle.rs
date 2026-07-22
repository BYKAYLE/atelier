use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::agent_registry::AgentProviderKind;

const MAX_TRACKED_TURNS: usize = 512;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AgentLifecyclePhase {
    Started,
    Output,
    ToolStarted,
    WaitingForUser,
    Completed,
    Failed,
    Cancelled,
}

impl AgentLifecyclePhase {
    pub(crate) const fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct AgentLifecycleEvent {
    turn_id: String,
    provider: String,
    sequence: u64,
    phase: AgentLifecyclePhase,
    status: Option<String>,
    summary: Option<String>,
    provider_session_id: Option<String>,
    terminal: bool,
    timestamp_ms: u64,
}

#[derive(Clone, Debug)]
struct AgentLifecycleState {
    provider: AgentProviderKind,
    sequence: u64,
    phase: AgentLifecyclePhase,
    updated_at_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentLifecycleSnapshot {
    turn_id: String,
    provider: String,
    phase: AgentLifecyclePhase,
    terminal: bool,
    updated_at_ms: u64,
}

fn states() -> &'static Mutex<HashMap<String, AgentLifecycleState>> {
    static STATES: OnceLock<Mutex<HashMap<String, AgentLifecycleState>>> = OnceLock::new();
    STATES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn event_from_state(
    turn_id: &str,
    state: &AgentLifecycleState,
    status: Option<&str>,
    summary: Option<&str>,
    provider_session_id: Option<&str>,
) -> AgentLifecycleEvent {
    AgentLifecycleEvent {
        turn_id: turn_id.to_string(),
        provider: state.provider.id().to_string(),
        sequence: state.sequence,
        phase: state.phase,
        status: status.map(str::to_string),
        summary: summary.map(str::to_string),
        provider_session_id: provider_session_id.map(str::to_string),
        terminal: state.phase.is_terminal(),
        timestamp_ms: timestamp_ms(),
    }
}

pub(crate) fn begin(
    turn_id: &str,
    provider: AgentProviderKind,
) -> Result<AgentLifecycleEvent, String> {
    let mut states = states()
        .lock()
        .map_err(|err| format!("agent lifecycle lock: {err}"))?;
    if states.len() >= MAX_TRACKED_TURNS {
        states.retain(|_, state| !state.phase.is_terminal());
    }
    let state = AgentLifecycleState {
        provider,
        sequence: 1,
        phase: AgentLifecyclePhase::Started,
        updated_at_ms: timestamp_ms(),
    };
    let event = event_from_state(turn_id, &state, Some("starting"), None, None);
    states.insert(turn_id.to_string(), state);
    Ok(event)
}

fn classify(kind: &str, status: Option<&str>, is_error: Option<bool>) -> AgentLifecyclePhase {
    if kind == "error" || is_error == Some(true) {
        return AgentLifecyclePhase::Failed;
    }
    if kind == "result" {
        return AgentLifecyclePhase::Completed;
    }
    if kind == "tool" {
        return AgentLifecyclePhase::ToolStarted;
    }
    let status = status.unwrap_or_default().to_ascii_lowercase();
    if status.contains("waiting")
        || status.contains("approval")
        || status.contains("permission")
        || status.contains("input_required")
    {
        return AgentLifecyclePhase::WaitingForUser;
    }
    if kind == "delta" || kind == "raw" {
        return AgentLifecyclePhase::Output;
    }
    AgentLifecyclePhase::Started
}

pub(crate) fn observe(
    turn_id: &str,
    kind: &str,
    status: Option<&str>,
    summary: Option<&str>,
    provider_session_id: Option<&str>,
    is_error: Option<bool>,
) -> Option<AgentLifecycleEvent> {
    let mut states = states().lock().ok()?;
    let state = states.get_mut(turn_id)?;
    if state.phase.is_terminal() {
        return None;
    }
    let next = classify(kind, status, is_error);
    state.sequence = state.sequence.saturating_add(1);
    state.phase = next;
    state.updated_at_ms = timestamp_ms();
    Some(event_from_state(
        turn_id,
        state,
        status,
        summary,
        provider_session_id,
    ))
}

pub(crate) fn finish(
    turn_id: &str,
    phase: AgentLifecyclePhase,
    summary: Option<&str>,
) -> Option<AgentLifecycleEvent> {
    debug_assert!(phase.is_terminal());
    let mut states = states().lock().ok()?;
    let state = states.get_mut(turn_id)?;
    if state.phase.is_terminal() {
        return None;
    }
    state.sequence = state.sequence.saturating_add(1);
    state.phase = phase;
    state.updated_at_ms = timestamp_ms();
    Some(event_from_state(turn_id, state, None, summary, None))
}

pub(crate) fn snapshot(limit: usize) -> Vec<AgentLifecycleSnapshot> {
    let Ok(states) = states().lock() else {
        return Vec::new();
    };
    let mut items = states
        .iter()
        .map(|(turn_id, state)| AgentLifecycleSnapshot {
            turn_id: turn_id.clone(),
            provider: state.provider.id().to_string(),
            phase: state.phase,
            terminal: state.phase.is_terminal(),
            updated_at_ms: state.updated_at_ms,
        })
        .collect::<Vec<_>>();
    items.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));
    items.truncate(limit.min(100));
    items
}

#[cfg(test)]
mod tests {
    use super::{begin, finish, observe, AgentLifecyclePhase};
    use crate::agent_registry::AgentProviderKind;

    #[test]
    fn normalizes_provider_events_and_ends_once() {
        let started = begin("turn-normal", AgentProviderKind::Codex).unwrap();
        assert_eq!(started.sequence, 1);
        assert_eq!(started.phase, AgentLifecyclePhase::Started);

        let output = observe("turn-normal", "delta", None, Some("hello"), None, None).unwrap();
        assert_eq!(output.sequence, 2);
        assert_eq!(output.phase, AgentLifecyclePhase::Output);

        let completed = observe(
            "turn-normal",
            "result",
            Some("done"),
            Some("complete"),
            Some("provider-session"),
            Some(false),
        )
        .unwrap();
        assert_eq!(completed.phase, AgentLifecyclePhase::Completed);
        assert!(completed.terminal);
        assert!(finish(
            "turn-normal",
            AgentLifecyclePhase::Failed,
            Some("late exit")
        )
        .is_none());
    }

    #[test]
    fn recognizes_waiting_and_cancelled_states() {
        begin("turn-wait", AgentProviderKind::Claude).unwrap();
        let waiting = observe(
            "turn-wait",
            "status",
            Some("permission.waiting"),
            None,
            None,
            None,
        )
        .unwrap();
        assert_eq!(waiting.phase, AgentLifecyclePhase::WaitingForUser);
        let cancelled = finish(
            "turn-wait",
            AgentLifecyclePhase::Cancelled,
            Some("cancelled by user"),
        )
        .unwrap();
        assert!(cancelled.terminal);
    }

    #[test]
    fn failure_is_terminal_even_when_provider_calls_it_a_result() {
        begin("turn-error", AgentProviderKind::GajaeCode).unwrap();
        let failed = observe(
            "turn-error",
            "result",
            Some("completed"),
            Some("authentication failed"),
            None,
            Some(true),
        )
        .unwrap();
        assert_eq!(failed.phase, AgentLifecyclePhase::Failed);
        assert!(observe("turn-error", "delta", None, Some("late"), None, None).is_none());
    }
}
