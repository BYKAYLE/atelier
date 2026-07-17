import type { FeatureModule } from "../../features/featureRegistry";
import { LinearWorkflowPanel } from ".";

const feature: FeatureModule = {
  id: "linear-workflows",
  order: 20,
  sourceControl: {
    id: "linear",
    order: 20,
    shortLabel: "LN",
    title: {
      ko: "Linear 이슈 및 워크플로 상태",
      en: "Linear issues and workflow states",
    },
    component: LinearWorkflowPanel,
  },
};

export default feature;
