// Development: the Vite dev server for the screens + Electron pointed at it.
import { spawn } from "node:child_process";
import { createServer } from "vite";

const server = await createServer();
await server.listen();
await import("./build-main.mjs");
const electron = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["electron", "."], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: "http://localhost:5183" },
  shell: process.platform === "win32",
});
electron.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
