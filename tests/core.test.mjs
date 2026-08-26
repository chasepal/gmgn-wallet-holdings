import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { encodeBalanceOf, percentageOf, unitsToDecimal } from "../lib/holdings.js";
import { parseGmgnTokenUrl } from "../lib/chains.js";
import { normalizeWatchlist, parseWalletAddress } from "../lib/settings.js";

test("encodes ERC-20 balanceOf without external ABI library", () => {
  assert.equal(encodeBalanceOf("0x000000000000000000000000000000000000dEaD"), `0x70a08231${"dead".padStart(64, "0")}`);
});

test("formats on-chain values and supply percentage", () => {
  assert.equal(unitsToDecimal("1234500000000000000", 18), "1.2345");
  assert.equal(percentageOf(25n, 1000n), "2.5");
});

test("recognizes supported GMGN EVM and Solana token routes", () => {
  assert.deepEqual(parseGmgnTokenUrl("https://gmgn.ai/bsc/token/0x1111111111111111111111111111111111111111?min=1"), {
    chain: "bsc", family: "evm", token: "0x1111111111111111111111111111111111111111"
  });
  assert.equal(parseGmgnTokenUrl("https://example.com/bsc/token/0x1111111111111111111111111111111111111111"), null);
});

test("normalizes, deduplicates and labels public wallet addresses", () => {
  const list = normalizeWatchlist([
    { address: "0x000000000000000000000000000000000000dEaD", label: "测试" },
    { address: "0x000000000000000000000000000000000000dead", label: "重复" }
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].address, "0x000000000000000000000000000000000000dead");
  assert.equal(parseWalletAddress("bad"), null);
});

test("manifest uses minimal permissions and scoped GMGN content scripts", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.content_scripts[0].matches.includes("<all_urls>"), false);
  assert.equal(manifest.host_permissions.some((value) => value.includes("gmgn.ai")), false);
  assert.equal(manifest.host_permissions.includes("https://fomo.family/*"), true);
  assert.deepEqual(manifest.content_scripts[1], {
    matches: ["https://fomo.family/tokens/*"],
    js: ["lib/fomo-holders.js", "fomo-token.js"],
    run_at: "document_idle",
  });
  assert.deepEqual(manifest.content_scripts[0].js, ["lib/fomo-holders.js", "content.js"]);
});

test("content runtime uses one observer and no polling", async () => {
  const source = await readFile(new URL("../content.js", import.meta.url), "utf8");
  assert.equal((source.match(/new MutationObserver/g) || []).length, 1);
  assert.equal(source.includes("setInterval("), false);
  assert.equal(source.includes("holdings.resolve"), true);
  assert.equal(source.includes("gmgnWalletHoldings.dockPosition.v1"), true);
  assert.equal(source.includes("pointerdown"), true);
  assert.equal(source.includes("setPointerCapture"), true);
  assert.equal(source.includes("FOMO 持仓总数"), true);
  assert.equal(source.includes("gmgnFomoHolderTotals.v1"), true);
});
