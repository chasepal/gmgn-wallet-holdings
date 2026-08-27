import assert from "node:assert/strict";
import test from "node:test";

import { createFomoSessionBridge } from "../lib/fomo-session.js";

const subject = {
  chain: "bsc",
  address: "0x1111111111111111111111111111111111111111",
};

function trustedRequest(value = "Bearer abcdefghijklmnopqrstuvwxyz") {
  return {
    tabId: 7,
    url: "https://prod-api.fomo.family/hodlers/top?tokens=%5B%5D",
    initiator: "https://fomo.family",
    requestHeaders: [{ name: "Authorization", value }],
  };
}

test("automatic FOMO holder sync captures a trusted session and returns only the exact aggregate", async () => {
  let listener = null;
  let calls = 0;
  const bridge = createFomoSessionBridge({
    chromeApi: {
      webRequest: {
        onBeforeSendHeaders: {
          addListener(callback, filter, extra) {
            listener = callback;
            assert.deepEqual(filter, { urls: ["https://prod-api.fomo.family/*"] });
            assert.deepEqual(extra, ["requestHeaders", "extraHeaders"]);
          },
          removeListener() {},
        },
      },
    },
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.match(url, /^https:\/\/prod-api\.fomo\.family\/hodlers\/top\?tokens=/);
      assert.match(options.headers.authorization, /^Bearer /);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            responseObject: [{
              networkId: 56,
              tokenAddress: subject.address,
              totalHolders: 494,
              topHolders: [{ address: "private-wallet", balance: 10 }],
            }],
          };
        },
      };
    },
    setTimer: () => 1,
    clearTimer() {},
  });

  assert.equal(bridge.install(), true);
  listener(trustedRequest());

  const first = await bridge.resolve({ subjects: [subject] });
  const second = await bridge.resolve({ subjects: [subject] });

  assert.equal(calls, 1);
  assert.equal(first.records[0].holderCount, 494);
  assert.equal(second.records[0].holderCount, 494);
  assert.equal(first.records[0].chain, "bsc");
  assert.equal(first.records[0].address, subject.address);
  assert.doesNotMatch(JSON.stringify(first), /Bearer|private-wallet|topHolders|balance/);
});

test("automatic FOMO holder sync rejects untrusted sessions and clears expired sessions", async () => {
  let status = 200;
  const bridge = createFomoSessionBridge({
    fetchImpl: async () => ({
      ok: status === 200,
      status,
      async json() { return { responseObject: [] }; },
    }),
    setTimer: () => 1,
    clearTimer() {},
  });

  bridge.captureRequest({
    ...trustedRequest(),
    initiator: "https://evil.example",
  });
  await assert.rejects(
    bridge.resolve({ subjects: [subject] }),
    (error) => error.code === "FOMO_SESSION_REQUIRED",
  );

  bridge.captureRequest(trustedRequest());
  status = 401;
  await assert.rejects(
    bridge.resolve({ subjects: [subject] }),
    (error) => error.code === "FOMO_SESSION_EXPIRED",
  );
  assert.equal(bridge.status().state, "session-required");
});
