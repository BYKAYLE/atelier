import type { FeatureModule } from "../../features/featureRegistry";
import { RemoteAccessSection } from ".";

const feature: FeatureModule = {
  id: "mobile-control",
  order: 10,
  panels: [{ slot: "settings.remote", component: RemoteAccessSection }],
};

export default feature;
