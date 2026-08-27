const API_ORIGIN = "https://prod-api.fomo.family";
const PAGE_ORIGIN = "https://fomo.family";
const HOLDER_PATH = "/hodlers/top";
const FRESH_TTL_MS = 15_000;
const RATE_LIMIT_COOLDOWN_MS = 30_000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const FALLBACK_SESSION_TTL_MS = 15 * 60_000;
const MAX_SESSION_TTL_MS = 2 * 60 * 60_000;
const MAX_CACHE_ENTRIES = 160;
const MAX_BATCH_SIZE = 24;
const REQUEST_TIMEOUT_MS = 3_000;
const EVM_ADDRESS = /^0x[a-f0-9]{40}$/i;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const FOMO_NETWORKS = Object.freeze({
  ethereum: 1,
  bsc: 56,
  robinhood: 4663,
  base: 8453,
  solana: 1_399_811_149,
});

export function createFomoSessionBridge({
  chromeApi = globalThis.chrome,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  enabled = true,
} = {}) {
  let active = enabled === true;
  let bearer = null;
  let expiresAt = 0;
  let rateLimitedUntil = 0;
  let installed = false;
  const cache = new Map();
  const inFlight = new Map();

  function install() {
    if (installed || !chromeApi?.webRequest?.onBeforeSendHeaders?.addListener) {
      return false;
    }
    chromeApi.webRequest.onBeforeSendHeaders.addListener(
      captureRequest,
      { urls: [`${API_ORIGIN}/*`] },
      ["requestHeaders", "extraHeaders"],
    );
    installed = true;
    return true;
  }

  function dispose() {
    if (installed) {
      chromeApi?.webRequest?.onBeforeSendHeaders?.removeListener?.(captureRequest);
    }
    installed = false;
    clearSession();
    rateLimitedUntil = 0;
    cache.clear();
    inFlight.clear();
  }

  function setEnabled(value) {
    active = value === true;
    if (!active) {
      clearSession();
      rateLimitedUntil = 0;
    }
  }

  function captureRequest(details = {}) {
    if (!active || Number(details.tabId) < 0 || !trustedPageOrigin(details)) return;
    let url;
    try {
      url = new URL(String(details.url || ""));
    } catch {
      return;
    }
    if (url.origin !== API_ORIGIN) return;
    const header = (details.requestHeaders || []).find(
      (entry) => String(entry?.name || "").toLowerCase() === "authorization",
    );
    const value = String(header?.value || "").trim();
    if (!/^Bearer\s+[^\s]{16,8192}$/i.test(value)) return;
    bearer = value;
    expiresAt = boundedExpiry(value, now());
  }

  function status() {
    expireSessionIfNeeded();
    return Object.freeze({
      enabled: active,
      state: bearer ? "ready" : active ? "session-required" : "disabled",
      expiresAt: bearer ? expiresAt : null,
    });
  }

  async function resolve({ subjects, signal } = {}) {
    const normalized = normalizeSubjects(subjects);
    if (!normalized.length) return Object.freeze({ status: "empty", records: [] });
    requireSession();

    const records = new Map();
    const missing = [];
    for (const subject of normalized) {
      const key = subjectKey(subject);
      const cached = cache.get(key);
      if (cached && now() - cached.observedAt < FRESH_TTL_MS) {
        touch(cache, key, cached);
        records.set(key, cached);
      } else {
        missing.push(subject);
      }
    }

    const pending = [];
    const fresh = [];
    for (const subject of missing) {
      const key = subjectKey(subject);
      const existing = inFlight.get(key);
      if (existing) pending.push(existing);
      else fresh.push(subject);
    }
    if (fresh.length) {
      const batch = startBatch(fresh, signal);
      pending.push(...fresh.map((subject) => inFlight.get(subjectKey(subject)) || batch));
    }
    if (pending.length) {
      for (const record of await Promise.all(pending)) {
        if (record) records.set(subjectKey(record), record);
      }
    }

    return Object.freeze({
      status: "available",
      records: Object.freeze(
        normalized
          .map((subject) => records.get(subjectKey(subject)))
          .filter(Boolean),
      ),
    });
  }

  function startBatch(subjects, signal) {
    const deferred = new Map();
    for (const subject of subjects) {
      const key = subjectKey(subject);
      let resolvePromise;
      let rejectPromise;
      const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      deferred.set(key, { resolve: resolvePromise, reject: rejectPromise });
      inFlight.set(key, promise);
    }
    const work = requestHolderBatch(subjects, signal);
    void work.then(
      (received) => {
        const byKey = new Map(received.map((record) => [subjectKey(record), record]));
        for (const subject of subjects) {
          const key = subjectKey(subject);
          const record = byKey.get(key) || null;
          if (record) {
            touch(cache, key, record);
            trim(cache, MAX_CACHE_ENTRIES);
          }
          deferred.get(key)?.resolve(record);
        }
      },
      (error) => {
        for (const item of deferred.values()) item.reject(error);
      },
    ).finally(() => {
      for (const subject of subjects) inFlight.delete(subjectKey(subject));
    });
    return work;
  }

  async function requestHolderBatch(subjects, signal) {
    const session = requireSession();
    const tokens = subjects.map((subject) => ({
      address: subject.address,
      networkId: FOMO_NETWORKS[subject.chain],
    }));
    const url = `${API_ORIGIN}${HOLDER_PATH}?tokens=${encodeURIComponent(JSON.stringify(tokens))}`;
    const response = await timedFetch(
      url,
      {
        method: "GET",
        headers: { accept: "application/json", authorization: session },
        credentials: "omit",
        cache: "no-store",
      },
      signal,
    );
    if (response.status === 401 || response.status === 403) {
      clearSession();
      throw bridgeError("FOMO_SESSION_EXPIRED", "FOMO 登录会话已过期");
    }
    if (response.status === 429) {
      rateLimitedUntil = retryAt(response, now());
      throw bridgeError("FOMO_RATE_LIMITED", "FOMO 请求过于频繁，请稍后再试");
    }
    if (!response.ok) {
      throw bridgeError("FOMO_REQUEST_FAILED", `FOMO 聚合读取失败（${response.status}）`);
    }
    const body = await response.json();
    const allowed = new Map(subjects.map((subject) => [subjectKey(subject), subject]));
    const received = new Map();
    const observedAt = now();
    for (const group of holderGroups(body)) {
      const record = projectGroup(group, observedAt);
      if (record && allowed.has(subjectKey(record))) {
        received.set(subjectKey(record), record);
      }
    }
    return [...received.values()];
  }

  function timedFetch(url, options, parentSignal) {
    if (typeof fetchImpl !== "function") {
      throw bridgeError("FOMO_FETCH_UNAVAILABLE", "FOMO 网络能力不可用");
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort(parentSignal?.reason || "cancelled");
    parentSignal?.addEventListener?.("abort", onAbort, { once: true });
    const timer = setTimer?.(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
    return Promise.resolve(fetchImpl(url, { ...options, signal: controller.signal }))
      .catch((error) => {
        if (controller.signal.aborted && !parentSignal?.aborted) {
          throw bridgeError("FOMO_TIMEOUT", "FOMO 聚合读取超时");
        }
        throw error;
      })
      .finally(() => {
        if (timer !== undefined && timer !== null) clearTimer?.(timer);
        parentSignal?.removeEventListener?.("abort", onAbort);
      });
  }

  function requireSession() {
    if (!active) throw bridgeError("FOMO_SESSION_DISABLED", "FOMO 自动同步已关闭");
    expireSessionIfNeeded();
    if (!bearer) {
      throw bridgeError("FOMO_SESSION_REQUIRED", "请先正常登录 FOMO，插件会自动同步聚合人数");
    }
    if (now() < rateLimitedUntil) {
      throw bridgeError("FOMO_RATE_LIMITED", "FOMO 正在安全限流冷却，稍后自动重试");
    }
    return bearer;
  }

  function expireSessionIfNeeded() {
    if (bearer && now() >= expiresAt) clearSession();
  }

  function clearSession() {
    bearer = null;
    expiresAt = 0;
  }

  return Object.freeze({
    install,
    dispose,
    setEnabled,
    captureRequest,
    status,
    resolve,
  });
}

function retryAt(response, observedAt) {
  const raw = response?.headers?.get?.("retry-after");
  const seconds = Number(raw);
  const headerDelay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : 0;
  const delay = Math.min(
    MAX_RATE_LIMIT_COOLDOWN_MS,
    Math.max(RATE_LIMIT_COOLDOWN_MS, headerDelay),
  );
  return observedAt + delay;
}

function trustedPageOrigin(details) {
  for (const value of [details.initiator, details.documentUrl]) {
    if (!value) continue;
    try {
      if (new URL(String(value)).origin === PAGE_ORIGIN) return true;
    } catch {}
  }
  return false;
}

function boundedExpiry(header, observedAt) {
  const token = String(header || "").replace(/^Bearer\s+/i, "");
  let stated = 0;
  try {
    const segment = token.split(".")[1];
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    stated = Number(JSON.parse(globalThis.atob(padded))?.exp) * 1_000;
  } catch {}
  const fallback = observedAt + FALLBACK_SESSION_TTL_MS;
  return Math.min(
    observedAt + MAX_SESSION_TTL_MS,
    Number.isFinite(stated) && stated > observedAt ? stated : fallback,
  );
}

function normalizeSubjects(value) {
  const result = [];
  const seen = new Set();
  for (const candidate of Array.isArray(value) ? value : []) {
    const chain = String(candidate?.chain || "").trim().toLowerCase();
    const address = normalizeAddress(chain, candidate?.address);
    const key = `${chain}:${address || ""}`;
    if (!FOMO_NETWORKS[chain] || !address || seen.has(key)) continue;
    seen.add(key);
    result.push(Object.freeze({ chain, address }));
    if (result.length >= MAX_BATCH_SIZE) break;
  }
  return result;
}

function normalizeAddress(chain, value) {
  const address = String(value || "").trim();
  if (chain === "solana") return SOLANA_ADDRESS.test(address) ? address : null;
  return EVM_ADDRESS.test(address) ? address.toLowerCase() : null;
}

function holderGroups(value, depth = 0) {
  if (!value || depth > 4) return [];
  if (Array.isArray(value)) {
    const direct = value.filter(
      (entry) => entry && typeof entry === "object" && "totalHolders" in entry,
    );
    if (direct.length) return direct;
    return value.flatMap((entry) => holderGroups(entry, depth + 1));
  }
  if (typeof value !== "object") return [];
  for (const key of ["responseObject", "data", "result", "groups"]) {
    const found = holderGroups(value[key], depth + 1);
    if (found.length) return found;
  }
  return [];
}

function projectGroup(group, observedAt) {
  const networkId = Number(group?.networkId ?? group?.token?.networkId);
  const chain = Object.keys(FOMO_NETWORKS).find(
    (candidate) => FOMO_NETWORKS[candidate] === networkId,
  );
  const address = normalizeAddress(
    chain,
    group?.tokenAddress ?? group?.address ?? group?.token?.address,
  );
  const holderCount = Number(group?.totalHolders);
  return chain && address && Number.isFinite(holderCount) && holderCount >= 0
    ? Object.freeze({
        status: "available",
        chain,
        address,
        holderCount: Math.round(holderCount),
        observedAt,
      })
    : null;
}

function subjectKey(subject) {
  return `${subject.chain}:${subject.address}`;
}

function touch(map, key, value) {
  map.delete(key);
  map.set(key, value);
}

function trim(map, maximum) {
  while (map.size > maximum) map.delete(map.keys().next().value);
}

function bridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
