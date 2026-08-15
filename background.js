import { getChain } from "./lib/chains.js";
import { loadWatchlist, STORAGE_KEY } from "./lib/settings.js";
import { queryEvmHoldings, querySolanaHoldings } from "./lib/holdings.js";

const CACHE_TTL_MS = 12_000;
const CACHE_MAX = 200;
const cache = new Map();
const inFlight = new Map();

function cacheKey(chain, token, wallets) {
  return `${chain}:${token}:${wallets.map((wallet) => `${wallet.id}:${wallet.address}`).join("|")}`;
}

function putCache(key, value) {
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

async function resolveHoldings(input) {
  const chain = getChain(input?.chain);
  if (!chain) throw new Error("暂不支持这条链");
  const token = String(input?.token || "");
  const wallets = (await loadWatchlist()).filter((wallet) => wallet.family === chain.family);
  if (!wallets.length) return { chain: chain.id, token, wallets: [], configured: false, checkedAt: Date.now() };

  const key = cacheKey(chain.id, token, wallets);
  const cached = cache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    const rows = chain.family === "solana"
      ? await querySolanaHoldings({ token, wallets, rpcUrls: chain.rpcUrls })
      : await queryEvmHoldings({ token, wallets, rpcUrls: chain.rpcUrls });
    const value = { chain: chain.id, token, wallets: rows, configured: true, checkedAt: Date.now() };
    putCache(key, value);
    return value;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "holdings.resolve") return false;
  resolveHoldings(message.payload)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || "查询失败" }));
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) cache.clear();
});

