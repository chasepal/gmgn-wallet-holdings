import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await fs.readFile(new URL("../lib/fomo-holders.js", import.meta.url), "utf8");
const tokenSource = await fs.readFile(new URL("../fomo-token.js", import.meta.url), "utf8");

function load() {
  const sandbox = { URL };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox.__GWH_FOMO_HOLDERS__;
}

test("reads the explicit FOMO aggregate holders tab without confusing the chain-wide metric", () => {
  const holders = load();
  const node = (text) => ({
    textContent: text,
    getAttribute() { return null; },
  });
  const root = {
    querySelectorAll() {
      return [
        node("Holders 1,772"),
        node("Holders (1.49K)"),
      ];
    },
  };

  assert.deepEqual(
    { ...holders.readFomoHolderCount(root) },
    { count: 1490, approximate: true, display: "1.49K" },
  );
  assert.equal(
    holders.readFomoHolderCount({ querySelectorAll() { return [node("Holders 1,772")]; } }),
    null,
  );
});

test("FOMO token page stores only the aggregate count for the exact token", async () => {
  const listeners = [];
  const snapshot = {};
  const sandbox = {
    URL,
    location: {
      href: "https://fomo.family/tokens/bnb/0x1111111111111111111111111111111111111111",
    },
    document: {
      hidden: false,
      documentElement: {},
      querySelectorAll() {
        return [{ textContent: "Holders (494)", getAttribute() { return null; } }];
      },
      addEventListener() {},
    },
    chrome: {
      storage: {
        local: {
          async get(key) { return { [key]: snapshot[key] }; },
          async set(value) { Object.assign(snapshot, value); },
        },
      },
    },
    MutationObserver: class {
      constructor(callback) { listeners.push(callback); }
      observe() {}
    },
    setTimeout(callback) { callback(); return 1; },
    addEventListener() {},
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  vm.runInNewContext(tokenSource, sandbox);
  await new Promise((resolve) => setImmediate(resolve));

  const saved = snapshot["gmgnFomoHolderTotals.v1"]?.records?.[
    "bsc:0x1111111111111111111111111111111111111111"
  ];
  assert.equal(listeners.length, 1);
  assert.equal(saved.holderCount, 494);
  assert.equal(saved.chain, "bsc");
  assert.equal(saved.address, "0x1111111111111111111111111111111111111111");
  assert.equal(Object.hasOwn(saved, "holders"), false);
});
