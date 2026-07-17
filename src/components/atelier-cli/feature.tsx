import type { FeatureModule } from "../../features/featureRegistry";
import { normalizeControlTask } from "./controlRequest";

const feature: FeatureModule = {
  id: "atelier-cli",
  order: 10,
  controlTaskNormalizer: normalizeControlTask,
};

export default feature;
