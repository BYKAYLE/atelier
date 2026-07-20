/// <reference types="vite/client" />

declare module "virtual:atelier-feature-modules" {
  const modules: readonly {
    path: string;
    module: import("./features/featureRegistry").FeatureModule;
    manifest: import("./features/featureRegistry").FeaturePackageManifest;
  }[];
  export default modules;
}
