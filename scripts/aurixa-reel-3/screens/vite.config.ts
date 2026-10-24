import { defineConfig, type Plugin } from "vite";
import type { AcceptedPlugin, AtRule, Root } from "postcss";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import path from "node:path";

// The product's checkout: AURIXA_PRODUCT, or npc-client-dashboard beside this repository.
const PRODUCT =
  process.env.AURIXA_PRODUCT ?? path.resolve(__dirname, "../../../../npc-client-dashboard");
// The product's own PostCSS step (postcss.config.js): an @layer in a file with no @tailwind is unwrapped.
const unwrapStandaloneTailwindLayers: AcceptedPlugin = {
  postcssPlugin: "unwrap-standalone-tailwind-layers",
  Once(root: Root) {
    if (root.toString().includes("@tailwind")) return;
    root.walkAtRules("layer", (rule: AtRule) => {
      if (!["base", "components", "utilities"].includes(rule.params)) return;
      rule.replaceWith(...(rule.nodes ?? []));
    });
  },
};

/**
 * The product's network layer is the harness's (src/stubs): a module the product resolves to one of these files is
 * served the stand-in instead, however it is imported (an alias or a relative path).
 */
const STUBS: Record<string, string> = {
  [path.join(PRODUCT, "src/lib/secureInvoke.ts")]: path.join(__dirname, "src/stubs/secureInvoke.ts"),
};
const productStubs: Plugin = {
  name: "product-stubs",
  enforce: "pre",
  async resolveId(source, importer, options) {
    if (source.startsWith("\0") || !importer) return null;
    const r = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (r && STUBS[r.id]) return STUBS[r.id];
    return null;
  },
};

/** A bare import from the product's own files resolves as if this harness made it: the product has no node_modules here. */
const productDeps: Plugin = {
  name: "product-deps-from-harness",
  enforce: "pre",
  async resolveId(source, importer) {
    if (
      !importer ||
      !importer.startsWith(PRODUCT) ||
      source.startsWith(".") ||
      source.startsWith("/") ||
      source.startsWith("@/") ||
      source.startsWith("\0")
    )
      return null;
    const r = await this.resolve(source, path.join(__dirname, "src", "main.tsx"), {
      skipSelf: true,
    });
    return r ?? null;
  },
};

export default defineConfig({
  root: __dirname,
  publicDir: path.join(PRODUCT, "public"),
  plugins: [productStubs, productDeps, react()],
  resolve: { alias: { "@": path.join(PRODUCT, "src") } },
  css: {
    postcss: {
      plugins: [
        unwrapStandaloneTailwindLayers,
        tailwindcss({ config: path.join(__dirname, "tailwind.config.ts") }),
        autoprefixer(),
      ],
    },
  },
  server: { port: Number(process.env.REEL_HARNESS_PORT ?? 5198), strictPort: true, fs: { allow: [PRODUCT, __dirname] } },
  logLevel: "warn",
});
