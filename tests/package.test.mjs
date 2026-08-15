import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

test("extension root contains every manifest entrypoint", async () => {
  const files = new Set(await readdir(new URL("../", import.meta.url)));
  for (const file of ["manifest.json", "background.js", "content.js", "popup.html", "popup.js", "popup.css"]) {
    assert.equal(files.has(file), true, `${file} missing`);
  }
});

