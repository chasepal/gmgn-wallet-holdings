(() => {
  const STORAGE_KEY = "gmgnFomoHolderTotals.v1";
  const FRESH_MS = 15 * 60 * 1_000;
  const STALE_MS = 24 * 60 * 60 * 1_000;
  const MAX_RECORDS = 200;
  const EVM_ADDRESS = /^0x[a-f0-9]{40}$/i;
  const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const CHAIN_TO_FOMO = Object.freeze({
    bsc: "bnb",
    ethereum: "ethereum",
    base: "base",
    robinhood: "robinhood",
    solana: "solana",
  });
  const FOMO_TO_CHAIN = Object.freeze(
    Object.fromEntries(Object.entries(CHAIN_TO_FOMO).map(([chain, slug]) => [slug, chain])),
  );

  const api = Object.freeze({
    STORAGE_KEY,
    FRESH_MS,
    STALE_MS,
    fomoTokenUrl,
    parseFomoTokenUrl,
    parseCompactCount,
    readFomoHolderCount,
    readStored,
    writeStored,
  });
  globalThis.__GWH_FOMO_HOLDERS__ = api;

  function fomoTokenUrl(subject = {}) {
    const chain = String(subject.chain || "").trim().toLowerCase();
    const fomoChain = CHAIN_TO_FOMO[chain];
    const address = normalizeAddress(chain, subject.token || subject.address);
    return fomoChain && address
      ? `https://fomo.family/tokens/${fomoChain}/${encodeURIComponent(address)}`
      : null;
  }

  function parseFomoTokenUrl(value) {
    try {
      const url = new URL(String(value || ""));
      if (url.origin !== "https://fomo.family") return null;
      const match = url.pathname.match(/^\/tokens\/([^/]+)\/([^/?#]+)(?:\/|$)/i);
      if (!match) return null;
      const fomoChain = decodeURIComponent(match[1]).toLowerCase();
      const chain = FOMO_TO_CHAIN[fomoChain];
      const address = normalizeAddress(chain, decodeURIComponent(match[2]));
      return chain && address
        ? { chain, fomoChain, address, url: fomoTokenUrl({ chain, address }) }
        : null;
    } catch {
      return null;
    }
  }

  function parseCompactCount(value) {
    const text = String(value || "")
      .trim()
      .replace(/[,，\s]/g, "")
      .toUpperCase();
    const match = text.match(/^(\d+(?:\.\d+)?)(K|M|B|万|亿)?$/i);
    if (!match) return null;
    const number = Number(match[1]);
    if (!Number.isFinite(number) || number < 0) return null;
    const multiplier = {
      "": 1,
      K: 1_000,
      M: 1_000_000,
      B: 1_000_000_000,
      万: 10_000,
      亿: 100_000_000,
    }[match[2] || ""];
    if (!multiplier) return null;
    return Object.freeze({
      count: Math.round(number * multiplier),
      approximate: Boolean(match[2]),
      display: String(value || "").trim(),
    });
  }

  function readFomoHolderCount(root = globalThis.document) {
    if (!root) return null;
    try {
      const nodes = root.querySelectorAll?.('[role="tab"],button,[role="button"]') || [];
      const pattern = /^(?:Holders?|持有者|持有人)\s*[\(（]\s*([\d,.，]+(?:K|M|B|万|亿)?)\s*[\)）](?:\s|$)/i;
      for (const node of nodes) {
        if (node?.getAttribute?.("aria-hidden") === "true") continue;
        const text = cleanText(node?.textContent, 120);
        const parsed = parseCompactCount(text.match(pattern)?.[1]);
        if (parsed) return parsed;
      }
    } catch {}
    return null;
  }

  async function readStored(subject, { storage = globalThis.chrome?.storage?.local } = {}) {
    const url = fomoTokenUrl(subject);
    if (!url || !storage?.get) return null;
    try {
      const snapshot = await storage.get(STORAGE_KEY);
      return normalizeRecord(snapshot?.[STORAGE_KEY]?.records?.[subjectKey(subject)]) || null;
    } catch {
      return null;
    }
  }

  async function writeStored(record, { storage = globalThis.chrome?.storage?.local } = {}) {
    const normalized = normalizeRecord(record);
    if (!normalized || !storage?.get || !storage?.set) return false;
    try {
      const snapshot = await storage.get(STORAGE_KEY);
      const existing = snapshot?.[STORAGE_KEY]?.records || {};
      const entries = Object.entries({
        ...existing,
        [subjectKey(normalized)]: normalized,
      })
        .map(([key, value]) => [key, normalizeRecord(value)])
        .filter(([, value]) => value)
        .sort((left, right) => right[1].observedAt - left[1].observedAt)
        .slice(0, MAX_RECORDS);
      await storage.set({
        [STORAGE_KEY]: {
          schemaVersion: 1,
          records: Object.fromEntries(entries),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  function normalizeRecord(value = {}) {
    const chain = String(value.chain || "").trim().toLowerCase();
    const address = normalizeAddress(chain, value.address || value.token);
    const holderCount = Number(value.holderCount);
    const observedAt = Number(value.observedAt);
    const url = fomoTokenUrl({ chain, address });
    if (
      !url ||
      !Number.isFinite(holderCount) ||
      holderCount < 0 ||
      !Number.isFinite(observedAt) ||
      observedAt <= 0
    ) {
      return null;
    }
    return Object.freeze({
      schemaVersion: 1,
      chain,
      address,
      holderCount: Math.round(holderCount),
      approximate: Boolean(value.approximate),
      display: cleanText(value.display, 32) || String(Math.round(holderCount)),
      observedAt,
      url,
    });
  }

  function subjectKey(subject = {}) {
    const chain = String(subject.chain || "").trim().toLowerCase();
    const address = normalizeAddress(chain, subject.address || subject.token) || "";
    return `${chain}:${address}`;
  }

  function normalizeAddress(chain, value) {
    const address = String(value || "").trim();
    if (chain === "solana") return SOLANA_ADDRESS.test(address) ? address : null;
    return EVM_ADDRESS.test(address) ? address.toLowerCase() : null;
  }

  function cleanText(value, limit) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }
})();
