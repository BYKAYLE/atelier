import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { defineConfig, loadEnv, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Tauri는 기본적으로 TAURI_ENV_DEBUG 를 주입합니다.
const host = process.env.TAURI_DEV_HOST;
const virtualFeatureModuleId = "virtual:atelier-feature-modules";
const resolvedVirtualFeatureModuleId = `\0${virtualFeatureModuleId}`;

interface FeaturePackageManifest {
  schemaVersion: 1;
  id: string;
  rustFeature: string;
  rustModule: string;
  smokeScript: string;
  dependencies: string[];
}

function discoverFeaturePackages(root: string): FeaturePackageManifest[] {
  const componentsRoot = join(root, "src", "components");
  const featureIds = readdirSync(componentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(join(componentsRoot, id, "feature.tsx")))
    .sort();

  return featureIds.map((id) => {
    const manifestPath = join(componentsRoot, id, "feature.manifest.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`Atelier feature ${id} is missing feature.manifest.json`);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as FeaturePackageManifest;
    if (manifest.schemaVersion !== 1 || manifest.id !== id) {
      throw new Error(`Invalid Atelier feature manifest for ${id}`);
    }
    if (!manifest.rustFeature || !manifest.rustModule || !manifest.smokeScript) {
      throw new Error(`Incomplete Atelier feature manifest for ${id}`);
    }
    if (!Array.isArray(manifest.dependencies)) {
      throw new Error(`Atelier feature ${id} must declare a dependencies array`);
    }
    return manifest;
  });
}

function resolveEnabledFeatureIds(
  configuredIds: string[],
  packages: FeaturePackageManifest[],
): string[] {
  const packageById = new Map(packages.map((manifest) => [manifest.id, manifest]));
  const enabled = new Set<string>();
  const visiting = new Set<string>();

  const include = (id: string) => {
    if (enabled.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Circular Atelier feature dependency involving ${id}`);
    }
    const manifest = packageById.get(id);
    if (!manifest) throw new Error(`Unknown Atelier feature module: ${id}`);
    visiting.add(id);
    manifest.dependencies.forEach(include);
    visiting.delete(id);
    enabled.add(id);
  };

  (configuredIds.length > 0 ? configuredIds : packages.map((manifest) => manifest.id))
    .forEach(include);
  return packages.map((manifest) => manifest.id).filter((id) => enabled.has(id));
}

function atelierFeatureModules(root: string, configuredIds: string[]): Plugin {
  const packages = discoverFeaturePackages(root);
  const availableIds = packages.map((manifest) => manifest.id);
  const unknownIds = configuredIds.filter((id) => !availableIds.includes(id));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown Atelier feature module: ${unknownIds.join(", ")}`);
  }

  const enabledIds = resolveEnabledFeatureIds(configuredIds, packages);
  const excludedIds = availableIds.filter((id) => !enabledIds.includes(id));

  return {
    name: "atelier-feature-modules",
    enforce: "pre",
    resolveId(id) {
      return id === virtualFeatureModuleId ? resolvedVirtualFeatureModuleId : undefined;
    },
    load(id) {
      if (id !== resolvedVirtualFeatureModuleId) return undefined;

      const imports = enabledIds.map(
        (featureId, index) => `import feature${index} from "/src/components/${featureId}/feature.tsx";`,
      );
      const entries = enabledIds.map(
        (featureId, index) => {
          const manifest = packages.find((candidate) => candidate.id === featureId);
          return `  { path: "../components/${featureId}/feature.tsx", module: feature${index}, manifest: ${JSON.stringify(manifest)} },`;
        },
      );
      return `${imports.join("\n")}\nexport default [\n${entries.join("\n")}\n];\n`;
    },
    generateBundle(_options, bundle) {
      const bundledModuleIds = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const moduleId of Object.keys(output.modules)) {
          bundledModuleIds.add(normalizePath(normalize(moduleId)));
        }
      }

      const compiledFeatureIds = availableIds.filter((featureId) => {
        const marker = `/src/components/${featureId}/`;
        return Array.from(bundledModuleIds).some((moduleId) => moduleId.includes(marker));
      });
      const leakedFeatureIds = excludedIds.filter((id) => compiledFeatureIds.includes(id));
      const missingFeatureIds = enabledIds.filter((id) => !compiledFeatureIds.includes(id));

      if (leakedFeatureIds.length > 0) {
        this.error(`Excluded Atelier features leaked into the frontend bundle: ${leakedFeatureIds.join(", ")}`);
      }
      if (missingFeatureIds.length > 0) {
        this.error(`Enabled Atelier features are missing from the frontend bundle: ${missingFeatureIds.join(", ")}`);
      }

      this.emitFile({
        type: "asset",
        fileName: "atelier-feature-manifest.json",
        source: `${JSON.stringify({
          schemaVersion: 1,
          enabledFeatureIds: enabledIds,
          excludedFeatureIds: excludedIds,
          compiledFeatureIds,
          featurePackages: packages,
        }, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const root = process.cwd();
  const env = loadEnv(mode, root, "");
  const configuredFeatureIds = String(
    process.env.VITE_ATELIER_FEATURES ?? env.VITE_ATELIER_FEATURES ?? "",
  )
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const configuredOutDir = resolve(
    root,
    process.env.ATELIER_FEATURE_BUNDLE_OUT_DIR ?? "dist",
  );

  return {
    plugins: [atelierFeatureModules(root, configuredFeatureIds), react()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? { protocol: "ws", host, port: 1421 }
        : undefined,
      watch: { ignored: ["**/src-tauri/**"] },
    },
    build: {
      outDir: configuredOutDir,
    },
    envPrefix: ["VITE_", "TAURI_ENV_*"],
  };
});
