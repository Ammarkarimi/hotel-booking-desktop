#!/usr/bin/env node
// Makes YOUR licence signing key. Run once, before you build the app for customers:
//   npm run license:init
// It writes:
//   tools/license/private-key.pem   — SECRET. Keep it safe (password manager, USB). Never share or commit it.
//   electron/license-public-key.ts  — the public half, built into the app. Safe to commit.
// If you lose the private key you cannot make licences for apps already installed.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const privFile = join(here, "private-key.pem");
const pubFile = join(here, "..", "..", "electron", "license-public-key.ts");

if (existsSync(privFile) && !process.argv.includes("--force")) {
  console.error(`A private key already exists at ${privFile}.\nMaking a new one would stop every licence you have issued from working.\nIf you are sure, run: npm run license:init -- --force`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
writeFileSync(privFile, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
const pub = publicKey.export({ type: "spki", format: "pem" }).toString().trim();
writeFileSync(
  pubFile,
  `// The public half of the key that signs licences. Made by "npm run license:init".
// IS_DEMO_KEY = true means this is the demo key from the repository: anyone could make licences
// for it, so "npm run build" refuses to package the app until a real key is made.
export const IS_DEMO_KEY = false;
export const LICENSE_PUBLIC_KEY = \`${pub}\`;
`
);
console.log(`Done.
  Private key (SECRET, back it up):  ${privFile}
  Public key built into the app:     ${pubFile}

Next: commit electron/license-public-key.ts, build the app, and issue licences with
  npm run license:new -- --to "Hotel name" --plan yearly --machine XXXX-XXXX-XXXX-XXXX`);
