import test from "node:test";
import assert from "node:assert/strict";

test("background service worker and all module imports evaluate cleanly", async () => {
  const listeners = { messages: [], storage: [] };
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener(listener) { listeners.messages.push(listener); } }
    },
    storage: {
      local: {
        async get() { return {}; },
        async set() {}
      },
      onChanged: { addListener(listener) { listeners.storage.push(listener); } }
    }
  };

  try {
    await import(`../background.js?registration-test=${Date.now()}`);
    assert.equal(listeners.messages.length, 1);
    assert.equal(listeners.storage.length, 1);
  } finally {
    delete globalThis.chrome;
  }
});
