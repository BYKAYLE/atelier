import { existsSync, readdirSync } from "node:fs";
import { join, normalize } from "node:path";
import { defineConfig, loadEnv, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Tauri는 기본적으로 TAURI_ENV_DEBUG 를 주입합니다.
const host = process.env.TAURI_DEV_HOST;
const virtualFeatureModuleId = "virtual:atelier-feature-modules";
const resolvedVirtualFeatureModuleId = `\0${virtualFeatureModuleId}`;

function discoverFeatureIds(root: string): string[] {
  const componentsRoot = join(root, "src", "components");
  return readdirSync(componentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(join(componentsRoot, id, "feature.tsx")))
    .sort();
}

function atelierFeatureModules(root: string, configuredIds: string[]): Plugin {
  const availableIds = discoverFeatureIds(root);
  const unknownIds = configuredIds.filter((id) => !availableIds.includes(id));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown Atelier feature module: ${unknownIds.join(", ")}`);
  }

  const enabledIds = configuredIds.length > 0 ? configuredIds : availableIds;
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
        (featureId, index) => `  { path: "../components/${featureId}/feature.tsx", module: feature${index} },`,
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
    envPrefix: ["VITE_", "TAURI_ENV_*"],
  };
});
