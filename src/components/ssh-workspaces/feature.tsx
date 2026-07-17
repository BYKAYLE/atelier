import type { FeatureModule } from "../../features/featureRegistry";
import { SshWorkspacesPanel } from ".";

const feature: FeatureModule = {
  id: "ssh-workspaces",
  order: 30,
  panels: [{ slot: "connections", component: SshWorkspacesPanel }],
};

export default feature;
