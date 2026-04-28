use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::thread;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Serialize, Clone)]
struct AgentStreamEvent {
    kind: String,
    text: Option<String>,
    status: Option<String>,
    raw: Option<String>,
    provider_session_id: Option<String>,
    is_error: Option<bool>,
}

#[derive(Serialize)]
pub struct AgentRunResult {
    text: String,
    provider_session_id: Option<String>,
    raw_events: Vec<String>,
    is_error: bool,
    error: Option<String>,
}

fn emit_agent_event<R: Runtime>(app: &AppHandle<R>, turn_id: &str, event: AgentStreamEvent) {
    let _ = app.emit(&format!("agent://{turn_id}/event"), event);
}

fn text_from_assistant_message(v: &Value) -> Option<String> {
    let content = v.get("message")?.get("content")?.as_array()?;
    let mut out = String::new();
    for block in content {
        if block.get("type").and_then(Value::as_str) == Some("text") {
            if let Some(text) = block.get("text").and_then(Value::as_str) {
                out.push_str(text);
            }
        }
    }
    if out.is_empty() { None } else { Some(out) }
}

fn parse_claude_line<R: Runtime>(
    app: &AppHandle<R>,
    turn_id: &str,
    line: &str,
    final_text: &mut String,
    provider_session_id: &mut Option<String>,
    is_error: &mut bool,
    error: &mut Option<String>,
) {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        emit_agent_event(app, turn_id, AgentStreamEvent {
            kind: "raw".into(),
            text: None,
            status: None,
            raw: Some(line.to_string()),
            provider_session_id: provider_session_id.clone(),
            is_error: None,
        });
        return;
    };

    if provider_session_id.is_none() {
        if let Some(id) = v.get("session_id").and_then(Value::as_str) {
            *provider_session_id = Some(id.to_string());
        }
    }

    match v.get("type").and_then(Value::as_str).unwrap_or_default() {
        "system" => {
            if let Some(id) = v.get("session_id").and_then(Value::as_str) {
                *provider_session_id = Some(id.to_string());
            }
            let status = v
                .get("subtype")
                .and_then(Value::as_str)
                .or_else(|| v.get("status").and_then(Value::as_str))
                .unwrap_or("system")
                .to_string();
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "status".into(),
                text: None,
                status: Some(status),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: None,
            });
        }
        "stream_event" => {
            let event = v.get("event").unwrap_or(&Value::Null);
            let event_type = event.get("type").and_then(Value::as_str).unwrap_or_default();
            if event_type == "content_block_delta" {
                if let Some(text) = event
                    .get("delta")
                    .and_then(|d| d.get("text"))
                    .and_then(Value::as_str)
                {
                    emit_agent_event(app, turn_id, AgentStreamEvent {
                        kind: "delta".into(),
                        text: Some(text.to_string()),
                        status: None,
                        raw: Some(line.to_string()),
                        provider_session_id: provider_session_id.clone(),
                        is_error: None,
                    });
                }
            } else if event_type == "content_block_start" {
                if let Some(block_type) = event
                    .get("content_block")
                    .and_then(|b| b.get("type"))
                    .and_then(Value::as_str)
                {
                    if block_type != "text" {
                        emit_agent_event(app, turn_id, AgentStreamEvent {
                            kind: "tool".into(),
                            text: event
                                .get("content_block")
                                .and_then(|b| b.get("name"))
                                .and_then(Value::as_str)
                                .map(str::to_string)
                                .or_else(|| Some(block_type.to_string())),
                            status: Some(block_type.to_string()),
                            raw: Some(line.to_string()),
                            provider_session_id: provider_session_id.clone(),
                            is_error: None,
                        });
                    }
                }
            }
        }
        "assistant" => {
            if let Some(text) = text_from_assistant_message(&v) {
                *final_text = text;
            }
        }
        "result" => {
            if let Some(id) = v.get("session_id").and_then(Value::as_str) {
                *provider_session_id = Some(id.to_string());
            }
            *is_error = v.get("is_error").and_then(Value::as_bool).unwrap_or(false);
            if let Some(result) = v.get("result").and_then(Value::as_str) {
                *final_text = result.to_string();
            }
            if *is_error {
                *error = Some(
                    v.get("api_error_status")
                        .and_then(Value::as_str)
                        .unwrap_or("Claude returned an error")
                        .to_string(),
                );
            }
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "result".into(),
                text: Some(final_text.clone()),
                status: v.get("stop_reason").and_then(Value::as_str).map(str::to_string),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: Some(*is_error),
            });
        }
        "error" => {
            *is_error = true;
            let msg = v
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Claude stream error")
                .to_string();
            *error = Some(msg.clone());
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "error".into(),
                text: Some(msg),
                status: Some("error".into()),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: Some(true),
            });
        }
        _ => {}
    }
}

fn run_claude<R: Runtime>(
    app: AppHandle<R>,
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
) -> Result<AgentRunResult, String> {
    let mut cmd = Command::new("claude");
    cmd.arg("-p")
        .arg("--verbose")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--include-partial-messages")
        .arg("--model")
        .arg(model.unwrap_or_else(|| "sonnet".to_string()))
        .env("PATH", crate::augmented_cli_path())
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(session_id) = resume_session_id.filter(|s| !s.trim().is_empty()) {
        cmd.arg("--resume").arg(session_id);
    }
    if let Some(cwd) = cwd.filter(|s| !s.trim().is_empty()) {
        cmd.current_dir(cwd);
    }

    emit_agent_event(&app, &turn_id, AgentStreamEvent {
        kind: "status".into(),
        text: None,
        status: Some("starting".into()),
        raw: None,
        provider_session_id: None,
        is_error: None,
    });

    let mut child = cmd.spawn().map_err(|e| format!("claude spawn: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .map_err(|e| format!("claude stdin: {e}"))?;
    }

    let stderr = child.stderr.take();
    let stderr_handle = stderr.map(|stderr| {
        thread::spawn(move || {
            let mut out = String::new();
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(&line);
            }
            out
        })
    });

    let stdout = child.stdout.take().ok_or_else(|| "claude stdout missing".to_string())?;
    let reader = BufReader::new(stdout);
    let mut raw_events = Vec::new();
    let mut final_text = String::new();
    let mut provider_session_id = None;
    let mut is_error = false;
    let mut error = None;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("claude stdout: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        raw_events.push(line.clone());
        parse_claude_line(
            &app,
            &turn_id,
            &line,
            &mut final_text,
            &mut provider_session_id,
            &mut is_error,
            &mut error,
        );
    }

    let status = child.wait().map_err(|e| format!("claude wait: {e}"))?;
    let stderr_text = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();
    if !status.success() {
        is_error = true;
        if error.is_none() {
            error = Some(if stderr_text.trim().is_empty() {
                format!("claude exited with {}", status.code().unwrap_or(-1))
            } else {
                stderr_text.trim().to_string()
            });
        }
        emit_agent_event(&app, &turn_id, AgentStreamEvent {
            kind: "error".into(),
            text: error.clone(),
            status: Some("exit".into()),
            raw: None,
            provider_session_id: provider_session_id.clone(),
            is_error: Some(true),
        });
    }

    Ok(AgentRunResult {
        text: final_text,
        provider_session_id,
        raw_events,
        is_error,
        error,
    })
}

fn parse_codex_line<R: Runtime>(
    app: &AppHandle<R>,
    turn_id: &str,
    line: &str,
    final_text: &mut String,
    provider_session_id: &mut Option<String>,
    is_error: &mut bool,
    error: &mut Option<String>,
) {
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        emit_agent_event(app, turn_id, AgentStreamEvent {
            kind: "raw".into(),
            text: None,
            status: None,
            raw: Some(line.to_string()),
            provider_session_id: provider_session_id.clone(),
            is_error: None,
        });
        return;
    };

    match v.get("type").and_then(Value::as_str).unwrap_or_default() {
        "thread.started" => {
            if let Some(id) = v.get("thread_id").and_then(Value::as_str) {
                *provider_session_id = Some(id.to_string());
            }
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "status".into(),
                text: None,
                status: Some("thread.started".into()),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: None,
            });
        }
        "turn.started" => {
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "status".into(),
                text: None,
                status: Some("turn.started".into()),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: None,
            });
        }
        "item.completed" => {
            let item = v.get("item").unwrap_or(&Value::Null);
            let item_type = item.get("type").and_then(Value::as_str).unwrap_or_default();
            if item_type == "agent_message" {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    *final_text = text.to_string();
                    emit_agent_event(app, turn_id, AgentStreamEvent {
                        kind: "result".into(),
                        text: Some(text.to_string()),
                        status: Some("agent_message".into()),
                        raw: Some(line.to_string()),
                        provider_session_id: provider_session_id.clone(),
                        is_error: Some(false),
                    });
                }
            } else {
                emit_agent_event(app, turn_id, AgentStreamEvent {
                    kind: "tool".into(),
                    text: Some(item_type.to_string()),
                    status: Some("item.completed".into()),
                    raw: Some(line.to_string()),
                    provider_session_id: provider_session_id.clone(),
                    is_error: None,
                });
            }
        }
        "turn.failed" | "error" => {
            *is_error = true;
            let msg = v
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| v.get("error").and_then(Value::as_str))
                .unwrap_or("Codex returned an error")
                .to_string();
            *error = Some(msg.clone());
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "error".into(),
                text: Some(msg),
                status: Some("error".into()),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: Some(true),
            });
        }
        "turn.completed" => {
            emit_agent_event(app, turn_id, AgentStreamEvent {
                kind: "status".into(),
                text: None,
                status: Some("turn.completed".into()),
                raw: Some(line.to_string()),
                provider_session_id: provider_session_id.clone(),
                is_error: Some(false),
            });
        }
        _ => {}
    }
}

fn run_codex<R: Runtime>(
    app: AppHandle<R>,
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
) -> Result<AgentRunResult, String> {
    let mut cmd = Command::new("codex");
    cmd.arg("exec");
    if let Some(cwd) = cwd.filter(|s| !s.trim().is_empty()) {
        cmd.arg("--cd").arg(cwd);
    }
    if let Some(model) = model.filter(|s| !s.trim().is_empty()) {
        cmd.arg("--model").arg(model);
    }
    cmd.env("PATH", crate::augmented_cli_path())
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(session_id) = resume_session_id.filter(|s| !s.trim().is_empty()) {
        cmd.arg("resume")
            .arg("--json")
            .arg("--skip-git-repo-check")
            .arg(session_id)
            .arg(prompt);
    } else {
        cmd.arg("--json")
            .arg("--sandbox")
            .arg("workspace-write")
            .arg("--skip-git-repo-check")
            .arg(prompt);
    }

    emit_agent_event(&app, &turn_id, AgentStreamEvent {
        kind: "status".into(),
        text: None,
        status: Some("codex.starting".into()),
        raw: None,
        provider_session_id: None,
        is_error: None,
    });

    let mut child = cmd.spawn().map_err(|e| format!("codex spawn: {e}"))?;
    let stderr = child.stderr.take();
    let stderr_handle = stderr.map(|stderr| {
        thread::spawn(move || {
            let mut out = String::new();
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(&line);
            }
            out
        })
    });

    let stdout = child.stdout.take().ok_or_else(|| "codex stdout missing".to_string())?;
    let reader = BufReader::new(stdout);
    let mut raw_events = Vec::new();
    let mut final_text = String::new();
    let mut provider_session_id = None;
    let mut is_error = false;
    let mut error = None;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("codex stdout: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        raw_events.push(line.clone());
        parse_codex_line(
            &app,
            &turn_id,
            &line,
            &mut final_text,
            &mut provider_session_id,
            &mut is_error,
            &mut error,
        );
    }

    let status = child.wait().map_err(|e| format!("codex wait: {e}"))?;
    let stderr_text = stderr_handle.and_then(|h| h.join().ok()).unwrap_or_default();
    if !status.success() {
        is_error = true;
        if error.is_none() {
            error = Some(if stderr_text.trim().is_empty() {
                format!("codex exited with {}", status.code().unwrap_or(-1))
            } else {
                stderr_text.trim().to_string()
            });
        }
        emit_agent_event(&app, &turn_id, AgentStreamEvent {
            kind: "error".into(),
            text: error.clone(),
            status: Some("exit".into()),
            raw: None,
            provider_session_id: provider_session_id.clone(),
            is_error: Some(true),
        });
    }

    Ok(AgentRunResult {
        text: final_text,
        provider_session_id,
        raw_events,
        is_error,
        error,
    })
}

fn run_hermes<R: Runtime>(
    app: AppHandle<R>,
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
) -> Result<AgentRunResult, String> {
    let mut cmd = Command::new("hermes");
    cmd.arg("chat")
        .arg("-Q")
        .arg("--max-turns")
        .arg("25")
        .arg("-m")
        .arg(model.unwrap_or_else(|| "gpt-5.4".to_string()))
        .arg("-q")
        .arg(prompt)
        .env("PATH", crate::augmented_cli_path())
        .env("LANG", "ko_KR.UTF-8")
        .env("LC_CTYPE", "ko_KR.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(session_id) = resume_session_id.filter(|s| !s.trim().is_empty()) {
        cmd.arg("--resume").arg(session_id);
    }
    if let Some(cwd) = cwd.filter(|s| !s.trim().is_empty()) {
        cmd.current_dir(cwd);
    }

    emit_agent_event(&app, &turn_id, AgentStreamEvent {
        kind: "status".into(),
        text: None,
        status: Some("hermes.starting".into()),
        raw: None,
        provider_session_id: None,
        is_error: None,
    });

    let output = cmd.output().map_err(|e| format!("hermes spawn: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let mut provider_session_id = None;
    for line in stderr.lines().chain(stdout.lines()) {
        if let Some(rest) = line.strip_prefix("session_id:") {
            provider_session_id = Some(rest.trim().to_string());
        }
    }
    let raw_events = stdout
        .lines()
        .chain(stderr.lines())
        .filter(|l| !l.trim().is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    let mut text = stdout
        .lines()
        .filter(|l| !l.trim_start().starts_with("session_id:"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    if text.is_empty() && !stderr.is_empty() {
        text = stderr
            .lines()
            .filter(|l| !l.trim_start().starts_with("session_id:"))
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();
    }
    let is_error = !output.status.success();
    let error = if is_error {
        Some(if stderr.is_empty() {
            format!("hermes exited with {}", output.status.code().unwrap_or(-1))
        } else {
            stderr.clone()
        })
    } else {
        None
    };

    emit_agent_event(&app, &turn_id, AgentStreamEvent {
        kind: if is_error { "error".into() } else { "result".into() },
        text: Some(if is_error { error.clone().unwrap_or_default() } else { text.clone() }),
        status: Some("hermes.completed".into()),
        raw: Some(raw_events.join("\n")),
        provider_session_id: provider_session_id.clone(),
        is_error: Some(is_error),
    });

    Ok(AgentRunResult {
        text,
        provider_session_id,
        raw_events,
        is_error,
        error,
    })
}

#[tauri::command]
pub async fn agent_claude_send<R: Runtime>(
    app: AppHandle<R>,
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
) -> std::result::Result<AgentRunResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_claude(app, turn_id, prompt, resume_session_id, cwd, model)
    })
    .await
    .map_err(|e| format!("agent thread join: {e}"))?
}

#[tauri::command]
pub async fn agent_send<R: Runtime>(
    app: AppHandle<R>,
    provider: String,
    turn_id: String,
    prompt: String,
    resume_session_id: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
) -> std::result::Result<AgentRunResult, String> {
    tauri::async_runtime::spawn_blocking(move || match provider.as_str() {
        "claude" => run_claude(app, turn_id, prompt, resume_session_id, cwd, model),
        "codex" => run_codex(app, turn_id, prompt, resume_session_id, cwd, model),
        "hermes" => run_hermes(app, turn_id, prompt, resume_session_id, cwd, model),
        other => Err(format!("unsupported provider: {other}")),
    })
    .await
    .map_err(|e| format!("agent thread join: {e}"))?
}
