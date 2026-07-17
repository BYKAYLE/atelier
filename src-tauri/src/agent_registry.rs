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

    const fn capability(self) -> AgentRuntimeCapability {
        match self {
            Self::Claude => AgentRuntimeCapability {
                id: "claude",
                label: "Claude Code",
                cli: "claude",
                auth_owner: "provider_cli",
                supports_resume: true,
                supports_model_catalog: true,
                supports_permission_mode: true,
            },
            Self::Codex => AgentRuntimeCapability {
                id: "codex",
                label: "Codex CLI",
                cli: "codex",
                auth_owner: "provider_cli",
                supports_resume: true,
                supports_model_catalog: true,
                supports_permission_mode: true,
            },
            Self::Hermes => AgentRuntimeCapability {
                id: "hermes",
                label: "Hermes Agent",
                cli: "hermes",
                auth_owner: "provider_or_scoped_backend_bridge",
                supports_resume: true,
                supports_model_catalog: true,
                supports_permission_mode: true,
            },
            Self::GajaeCode => AgentRuntimeCapability {
                id: "gajecode",
                label: "Gajae Code",
                cli: "gjc",
                auth_owner: "atelier_scoped_provider_bridge",
                supports_resume: true,
                supports_model_catalog: true,
                supports_permission_mode: true,
            },
        }
    }
}

#[derive(Clone, Serialize)]
pub struct AgentRuntimeCapability {
    id: &'static str,
    label: &'static str,
    cli: &'static str,
    auth_owner: &'static str,
    supports_resume: bool,
    supports_model_catalog: bool,
    supports_permission_mode: bool,
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
    }
}
