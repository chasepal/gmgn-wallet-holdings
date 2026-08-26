import { mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const output = resolve(process.argv[2] || `/Users/chase/Documents/Codex/Projects/releases/gmgn-wallet-holdings-v${manifest.version}.zip`);
const assets = [
  "manifest.json",
  "background.js",
  "content.js",
  "fomo-token.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "lib",
  "README.md",
  "PRIVACY.md",
  "CHANGELOG.md",
  "LICENSE",
  "SECURITY.md"
];
const requiredEntries = [
  "manifest.json",
  manifest.background.service_worker,
  "content.js",
  "fomo-token.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "lib/chains.js",
  "lib/settings.js",
  "lib/holdings.js",
  "lib/fomo-holders.js"
];

await mkdir(dirname(output), { recursive: true });
await rm(output, { force: true });

const packed = spawnSync("zip", ["-q", "-r", "-X", output, ...assets], {
  cwd: root,
  encoding: "utf8"
});
if (packed.status !== 0) {
  throw new Error(packed.stderr || packed.stdout || "zip failed");
}

const listed = spawnSync("unzip", ["-Z1", output], { encoding: "utf8" });
if (listed.status !== 0) throw new Error(listed.stderr || "unable to inspect ZIP");
const entries = new Set(listed.stdout.trim().split("\n"));
const missing = requiredEntries.filter((entry) => !entries.has(entry));
if (missing.length) {
  await rm(output, { force: true });
  throw new Error(`release ZIP missing required files: ${missing.join(", ")}`);
}

console.log(output);
