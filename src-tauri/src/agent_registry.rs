use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum AgentProviderKind {
    Claude,
    Codex,
    Hermes,
    GajaeCode,
}

impl AgentProviderKind {
    pub(crate) fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "claude" => Ok(Self::Claude),
            "codex" => Ok(Self::Codex),
            "hermes" => Ok(Self::Hermes),
            "gajecode" => Ok(Self::GajaeCode),
            other => Err(format!("unsupported provider: {other}")),
        }
    }

    pub(crate) const fn id(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Hermes => "hermes",
            Self::GajaeCode => "gajecode",
        }
    }

    pub(crate) const fn supports_managed_agent_send(self) -> bool {
        matches!(self, Self::Claude | Self::Codex)
            || (cfg!(target_os = "macos") && matches!(self, Self::Hermes | Self::GajaeCode))
    }

    pub(crate) const fn supports_permission_mode(self) -> bool {
        self.supports_managed_agent_send()
    }

    pub(crate) const fn managed_agent_send_disabled_reason(self) -> Option<&'static str> {
        match self {
            Self::Claude | Self::Codex => None,
            Self::Hermes if cfg!(target_os = "macos") => None,
            Self::GajaeCode if cfg!(target_os = "macos") => None,
            Self::Hermes => Some(
                "Hermes managed Basic/Auto execution requires Atelier's macOS /usr/bin/sandbox-exec child-process boundary; this platform is unsupported and execution was not started.",
            ),
            Self::GajaeCode => Some(
                "Gajae Code managed Basic/Auto execution requires Atelier's macOS /usr/bin/sandbox-exec child-process boundary; this platform is unsupported and execution was not started. Direct GJC/Team/RLM commands remain separate.",
            ),
        }
    }

    const fn capability(self) -> AgentRuntimeCapability {
        match self {
            Self::Claude => AgentRuntimeCapability {
                id: "claude",
                label: "Claude Code",
                cli: "claude",
                adapter_provider: "claude",
                execution_controller: "claude_cli_sandbox",
                skill_owner: "claude_cli",
                auth_owner: "provider_cli",
                automatic_online_runtime_bootstrap: false,
                supports_resume: true,
                supports_model_catalog: true,
                supports_permission_mode: true,
                supports_managed_agent_send: true,
                managed_agent_send_disabled_reason: None,
            },
            Self::Codex => AgentRuntimeCapability {
                id: "codex",
                label: "Codex CLI",
                cli: "codex",
                adapter_provider: "codex",
                execution_controller: "codex_cli_sandbox",
                skill_owner: "codex_cli",
                auth_owner: "provider_cli",
                automatic_online_runtime_bootstrap: false,
                supports_resume: true,
                supports_model_catalog: true,
                supports_permission_mode: true,
                supports_managed_agent_send: true,
                managed_agent_send_disabled_reason: None,
            },
            Self::Hermes => AgentRuntimeCapability {
                id: "hermes",
                label: "Hermes Agent",
                cli: "hermes",
                adapter_provider: "hermes",
                execution_controller: "atelier_macos_sandbox_exec",
                skill_owner: "atelier_managed_hermes",
                auth_owner: "provider_or_scoped_backend_bridge",
                automatic_online_runtime_bootstrap: true,
                supports_resume: true,
                supports_model_catalog: true,
                supports_permission_mode: self.supports_permission_mode(),
                supports_managed_agent_send: self.supports_managed_agent_send(),
                managed_agent_send_disabled_reason: self.managed_agent_send_disabled_reason(),
            },
            Self::GajaeCode => AgentRuntimeCapability {
                id: "gajecode",
                label: "Gajae Code",
                cli: "gjc",
                adapter_provider: "gajecode",
                execution_controller: "atelier_macos_sandbox_exec",
                skill_owner: "gajecode_isolated",
                auth_owner: "atelier_scoped_provider_bridge",
                automatic_online_runtime_bootstrap: true,
                supports_resume: true,
                supports_model_catalog: true,
                supports_permission_mode: self.supports_permission_mode(),
                supports_managed_agent_send: self.supports_managed_agent_send(),
                managed_agent_send_disabled_reason: self.managed_agent_send_disabled_reason(),
            },
        }
    }
}

#[derive(Clone, Serialize)]
pub struct AgentRuntimeCapability {
    id: &'static str,
    label: &'static str,
    cli: &'static str,
    adapter_provider: &'static str,
    execution_controller: &'static str,
    skill_owner: &'static str,
    auth_owner: &'static str,
    automatic_online_runtime_bootstrap: bool,
    supports_resume: bool,
    supports_model_catalog: bool,
    supports_permission_mode: bool,
    supports_managed_agent_send: bool,
    managed_agent_send_disabled_reason: Option<&'static str>,
}

pub(crate) fn runtime_capabilities() -> Vec<AgentRuntimeCapability> {
    [
        AgentProviderKind::Claude,
        AgentProviderKind::Codex,
        AgentProviderKind::Hermes,
        AgentProviderKind::GajaeCode,
    ]
    .into_iter()
    .map(AgentProviderKind::capability)
    .collect()
}

#[cfg(test)]
mod tests {
    use super::{runtime_capabilities, AgentProviderKind};

    #[test]
    fn parses_every_registered_provider() {
        for provider in ["claude", "codex", "hermes", "gajecode"] {
            assert_eq!(AgentProviderKind::parse(provider).unwrap().id(), provider);
        }
    }

    #[test]
    fn rejects_unknown_provider() {
        assert!(AgentProviderKind::parse("other").is_err());
    }

    #[test]
    fn publishes_one_capability_per_provider() {
        let capabilities = runtime_capabilities();
        let ids = capabilities
            .iter()
            .map(|capability| capability.id)
            .collect::<Vec<_>>();
        assert_eq!(ids, vec!["claude", "codex", "hermes", "gajecode"]);
        assert!(capabilities[0].supports_managed_agent_send);
        assert!(capabilities[1].supports_managed_agent_send);
        assert_eq!(capabilities[2].adapter_provider, "hermes");
        assert_eq!(capabilities[3].adapter_provider, "gajecode");
        assert_eq!(
            capabilities[2].execution_controller,
            "atelier_macos_sandbox_exec"
        );
        assert_eq!(
            capabilities[3].execution_controller,
            "atelier_macos_sandbox_exec"
        );
        assert_eq!(capabilities[2].skill_owner, "atelier_managed_hermes");
        assert_eq!(capabilities[3].skill_owner, "gajecode_isolated");
        assert!(capabilities[2].automatic_online_runtime_bootstrap);
        assert!(capabilities[3].automatic_online_runtime_bootstrap);
        if cfg!(target_os = "macos") {
            assert!(capabilities[2].supports_managed_agent_send);
            assert!(capabilities[3].supports_managed_agent_send);
            assert!(capabilities[2].supports_permission_mode);
            assert!(capabilities[3].supports_permission_mode);
            assert!(capabilities[2].managed_agent_send_disabled_reason.is_none());
            assert!(capabilities[3].managed_agent_send_disabled_reason.is_none());
        } else {
            assert!(!capabilities[2].supports_managed_agent_send);
            assert!(!capabilities[3].supports_managed_agent_send);
            assert!(!capabilities[2].supports_permission_mode);
            assert!(!capabilities[3].supports_permission_mode);
            assert!(capabilities[2].managed_agent_send_disabled_reason.is_some());
            assert!(capabilities[3].managed_agent_send_disabled_reason.is_some());
        }
    }
}
