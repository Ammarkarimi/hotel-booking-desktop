// Stops a customer build that still has the demo licence key in it (anyone could make licences for it).
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../electron/license-public-key.ts", import.meta.url), "utf8");
if (/^export const IS_DEMO_KEY = true/m.test(src) && process.env.ALLOW_DEMO_KEY !== "1") {
  console.error(`
  The app still has the DEMO licence key.
  Run "npm run license:init" once to make your own key, commit electron/license-public-key.ts,
  and build again. (For a test build only: set ALLOW_DEMO_KEY=1.)
`);
  process.exit(1);
}
