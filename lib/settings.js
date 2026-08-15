export const STORAGE_KEY = "gmgnWalletHoldings.watchlist.v1";
export const MAX_WALLETS = 50;

const EVM_ADDRESS = /^0x[a-f0-9]{40}$/i;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function parseWalletAddress(input) {
  const value = String(input || "").trim();
  if (EVM_ADDRESS.test(value)) return { family: "evm", address: value.toLowerCase() };
  if (SOLANA_ADDRESS.test(value)) return { family: "solana", address: value };
  return null;
}

export function normalizeWatchlist(input) {
  const output = [];
  const seen = new Set();
  for (const item of Array.isArray(input) ? input : []) {
    if (output.length >= MAX_WALLETS) break;
    const parsed = parseWalletAddress(item?.address);
    if (!parsed || seen.has(parsed.address)) continue;
    seen.add(parsed.address);
    output.push({
      id: String(item?.id || parsed.address).slice(0, 96),
      family: parsed.family,
      address: parsed.address,
      label: String(item?.label || "未命名地址").trim().slice(0, 40) || "未命名地址"
    });
  }
  return output;
}

export async function loadWatchlist(storage = chrome.storage.local) {
  const data = await storage.get(STORAGE_KEY);
  return normalizeWatchlist(data[STORAGE_KEY]);
}

export async function saveWatchlist(list, storage = chrome.storage.local) {
  const normalized = normalizeWatchlist(list);
  await storage.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

