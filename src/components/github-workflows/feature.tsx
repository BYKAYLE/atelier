import type { FeatureModule } from "../../features/featureRegistry";
import { GithubWorkflowPanel } from ".";

const feature: FeatureModule = {
  id: "github-workflows",
  order: 10,
  sourceControl: {
    id: "github",
    order: 10,
    shortLabel: "GH",
    title: {
      ko: "GitHub 이슈, PR, 체크 및 리뷰",
      en: "GitHub issues, pull requests, checks, and reviews",
    },
    component: GithubWorkflowPanel,
  },
};

export default feature;
