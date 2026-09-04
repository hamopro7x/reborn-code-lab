// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { PluginOption } from "vite";

// على ويندوز يفشل تحقق المسارات داخل mcpPlugin بسبب اختلاف الفواصل (\ مقابل /).
// لا نستورد الإضافة أصلًا على ويندوز، حتى لا تنفذ تحقق المسارات قبل تطبيق الشرط.
const disableMcpPlugin =
  process.platform === "win32" || process.env["DISABLE_MCP_PLUGIN"] === "1";

const plugins: PluginOption[] = [];

if (!disableMcpPlugin) {
  const { mcpPlugin } = await import("@lovable.dev/mcp-js/stacks/tanstack/vite");
  plugins.push(mcpPlugin());
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins,
    // معرّف نسخة يتغيّر مع كل بناء/نشر، يستخدمه الموقع لعمل تحديث تلقائي
    define: { __APP_BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  },
});
