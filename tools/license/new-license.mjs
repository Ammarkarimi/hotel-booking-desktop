#!/usr/bin/env node
// Issues a licence key for a customer. Examples:
//   npm run license:new -- --to "Hotel Sunrise" --plan monthly --machine 1A2B-3C4D-5E6F-7A8B
//   npm run license:new -- --to "Hotel Sunrise" --plan yearly  --machine 1A2B-3C4D-5E6F-7A8B --rooms 20
//   npm run license:new -- --to "Hotel Sunrise" --until 2027-03-31 --machine any
// The customer finds the machine code on the licence screen of the app (Settings → Licence).
// A renewal is simply a new key: issue one with the new end date.
// Options:
//   --to       hotel name (shown in the app)                       required
//   --machine  the computer's code, or "any" for any computer       required
//   --plan     monthly | quarterly | yearly | lifetime              default monthly
//   --from     first day (YYYY-MM-DD); the end is counted from it   default today
//   --until    exact last day instead of --plan length (YYYY-MM-DD)
//   --rooms    most rooms allowed (0 = no limit)                    default 0
//   --key      private key file                                     default tools/license/private-key.pem
//   --demo     sign with the demo key (for testing a development build only)
import { createPrivateKey, sign, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const fail = (msg) => {
  console.error(`Error: ${msg}\nSee the top of tools/license/new-license.mjs for help.`);
  process.exit(1);
};

const to = opt("to");
const machineArg = opt("machine");
if (!to) fail("--to is required (the hotel name)");
if (!machineArg) fail('--machine is required (the code from the app\'s licence screen, or "any")');
const machine = machineArg.toLowerCase() === "any" ? "*" : machineArg.toUpperCase();
if (machine !== "*" && !/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(machine)) fail("the machine code looks like 1A2B-3C4D-5E6F-7A8B");

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const from = opt("from", iso(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))));
const plan = opt("plan", opt("until") ? "custom" : "monthly");
const months = { monthly: 1, quarterly: 3, yearly: 12, lifetime: 1200 }[plan];
let expires = opt("until");
if (!expires) {
  if (!months) fail("--plan must be monthly, quarterly, yearly or lifetime (or give --until)");
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  expires = iso(d);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) fail("--until must be a date like 2027-03-31");

const keyFile = flag("demo") ? join(here, "demo-private-key.pem") : opt("key", join(here, "private-key.pem"));
if (!existsSync(keyFile)) fail(`no private key at ${keyFile}. Run "npm run license:init" first.`);
const privateKey = createPrivateKey(readFileSync(keyFile));

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const payload = { v: 1, id: randomBytes(4).toString("hex").toUpperCase(), to, plan, issued: iso(today), expires, machine, rooms: Number(opt("rooms", "0")) || 0 };
const head = `INNV1.${b64url(JSON.stringify(payload))}`;
const key = `${head}.${b64url(sign(null, Buffer.from(head), privateKey))}`;

const safe = to.replace(/[^\w-]+/g, "-").replace(/-+/g, "-");
const licFile = join(process.cwd(), `${safe}-${expires}.lic`);
writeFileSync(licFile, key + "\n");
if (!flag("demo")) {
  const ledger = join(here, "issued-licenses.csv");
  if (!existsSync(ledger)) appendFileSync(ledger, "licence id,issued,hotel,plan,expires,machine,rooms\n");
  appendFileSync(ledger, `${payload.id},${payload.issued},"${to.replace(/"/g, '""')}",${plan},${expires},${machineArg},${payload.rooms}\n`);
}
console.log(`Licence ${payload.id} for "${to}" · ${plan} · valid until ${expires} · computer ${machineArg}${payload.rooms ? ` · up to ${payload.rooms} rooms` : ""}

${key}

Saved as ${licFile}
Send the key (or the .lic file) to the customer. They paste it in Settings → Licence.`);
