import type { FeatureModule } from "../../features/featureRegistry";
import { ComputerUsePanel } from ".";

const feature: FeatureModule = {
  id: "computer-use",
  order: 30,
  panels: [{ slot: "settings.remote", component: ComputerUsePanel }],
};

export default feature;
