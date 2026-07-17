import type { FeatureModule } from "../../features/featureRegistry";
import { ProviderUsagePanel } from ".";

const feature: FeatureModule = {
  id: "provider-usage",
  order: 20,
  panels: [{ slot: "connections", component: ProviderUsagePanel }],
};

export default feature;
