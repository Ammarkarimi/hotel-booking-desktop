import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { parseLicenseKey } from "../shared/license-format";

test("licence keys round-trip and signatures are checked", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const payload = { v: 1, id: "ABCD", to: "Hotel Test", plan: "yearly", issued: "2026-11-20", expires: "2027-11-19", machine: "*" };
  const head = `INNV1.${b64url(Buffer.from(JSON.stringify(payload)))}`;
  const key = `${head}.${b64url(sign(null, Buffer.from(head), privateKey))}`;
  const parsed = parseLicenseKey(` ${key.slice(0, 40)}\n${key.slice(40)} `);
  assert.ok(parsed);
  assert.equal(parsed!.payload.to, "Hotel Test");
  const { verify } = await import("node:crypto");
  assert.ok(verify(null, Buffer.from(parsed!.signed), publicKey, Buffer.from(parsed!.signature)));
  const forged = { ...payload, expires: "2099-12-31" };
  const tampered = parseLicenseKey(`INNV1.${b64url(Buffer.from(JSON.stringify(forged)))}.${key.split(".")[2]}`);
  assert.ok(!tampered || !verify(null, Buffer.from(tampered.signed), publicKey, Buffer.from(tampered.signature)));
  assert.equal(parseLicenseKey("not a key"), null);
});
