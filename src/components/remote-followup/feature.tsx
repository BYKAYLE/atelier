import type { FeatureModule } from "../../features/featureRegistry";
import { RemoteFollowupPanel } from ".";

const feature: FeatureModule = {
  id: "remote-followup",
  order: 20,
  panels: [{ slot: "settings.remote", component: RemoteFollowupPanel }],
};

export default feature;
