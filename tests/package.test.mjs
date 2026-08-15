import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("extension root contains every manifest entrypoint", async () => {
  const files = new Set(await readdir(new URL("../", import.meta.url)));
  for (const file of ["manifest.json", "background.js", "content.js", "popup.html", "popup.js", "popup.css"]) {
    assert.equal(files.has(file), true, `${file} missing`);
  }
});

test("release packager includes every service-worker module", async () => {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const background = await readFile(new URL(manifest.background.service_worker, root), "utf8");
  const importedModules = [...background.matchAll(/from\s+["'](\.\/[^"']+)["']/g)]
    .map((match) => match[1].replace(/^\.\//, ""));
  assert.ok(importedModules.length > 0, "expected background module imports");

  const outputDir = await mkdtemp(join(tmpdir(), "gmgn-wallet-holdings-package-"));
  const output = join(outputDir, "extension.zip");
  const result = spawnSync(process.execPath, [new URL("../scripts/package.mjs", import.meta.url).pathname, output], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const listing = spawnSync("unzip", ["-Z1", output], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  const entries = new Set(listing.stdout.trim().split("\n"));
  for (const modulePath of importedModules) {
    assert.equal(entries.has(modulePath), true, `${modulePath} missing from release ZIP`);
  }
});
