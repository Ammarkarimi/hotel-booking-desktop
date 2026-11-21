// Bundles the Electron main process and preload script (with the shared code) into dist-electron/.
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const common = { bundle: true, platform: "node", target: "node22", format: "cjs", external: ["electron"], sourcemap: false, logLevel: "info" };
await build({ ...common, entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.js" });
await build({ ...common, entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.js" });
// The script that fills Pathik's form runs inside Pathik's page, so it is shipped as it is.
mkdirSync("dist-electron", { recursive: true });
copyFileSync("electron/pathik-page.js", "dist-electron/pathik-page.js");
