(() => {
  const HOST_ID = "gmgn-wallet-holdings-root";
  const STORAGE_KEY = "gmgnWalletHoldings.watchlist.v1";
  const API = globalThis.__GWH_TEST__?.runtime || globalThis.chrome?.runtime;
  const STORAGE = globalThis.__GWH_TEST__?.storage || globalThis.chrome?.storage;
  let currentRouteKey = "";
  let loadingRouteKey = "";
  let requestId = 0;
  let queued = false;
  let panelOpen = false;
  let latestData = null;

  function parseRoute() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 3 || parts[1] !== "token") return null;
    const alias = parts[0].toLowerCase();
    const map = { bnb: "bsc", eth: "ethereum", arb: "arbitrum", op: "optimism", avax: "avalanche", sol: "solana", "x-layer": "xlayer" };
    const chain = map[alias] || alias;
    const token = parts[2];
    const evm = /^0x[a-f0-9]{40}$/i.test(token);
    const solana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token);
    if (!evm && !(chain === "solana" && solana)) return null;
    return { chain, token: evm ? token.toLowerCase() : token, key: `${chain}:${token.toLowerCase()}` };
  }

  function mount() {
    let host = document.getElementById(HOST_ID);
    if (host) return host.shadowRoot;
    host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host{all:initial}.dock{position:fixed;right:20px;top:92px;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2937}.pill{appearance:none;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:12px;padding:9px 13px;font-size:14px;font-weight:700;box-shadow:0 5px 18px rgba(15,23,42,.12);cursor:pointer;white-space:nowrap}.pill[data-state="yes"]{border-color:#34d399;color:#047857;background:#ecfdf5}.pill[data-state="no"]{color:#64748b;background:#f8fafc}.pill[data-state="error"]{border-color:#fca5a5;color:#b91c1c;background:#fff7f7}.panel{display:none;margin-top:8px;width:360px;max-height:420px;overflow:auto;border:1px solid #d8dee8;border-radius:14px;background:#fff;box-shadow:0 18px 48px rgba(15,23,42,.2);padding:10px}.panel.open{display:block}.head{display:flex;justify-content:space-between;align-items:center;padding:3px 4px 9px;font-size:14px;font-weight:800}.close{border:0;background:transparent;color:#64748b;font-size:18px;cursor:pointer}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;padding:10px 8px;border-top:1px solid #edf0f4}.name{font-size:14px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.addr{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#7b8797}.value{text-align:right;font-size:13px;font-weight:750}.yes{color:#059669}.no{color:#94a3b8}.hint{padding:12px 8px;color:#64748b;font-size:13px;line-height:1.5}.time{padding:7px 8px 2px;border-top:1px solid #edf0f4;color:#94a3b8;font-size:11px;text-align:right}
      @media(prefers-color-scheme:dark){.dock{color:#e5e7eb}.pill{background:#171a1f;border-color:#3a4049;color:#e5e7eb;box-shadow:0 6px 22px rgba(0,0,0,.35)}.pill[data-state="yes"]{background:#10271f;color:#5ee0aa;border-color:#277a5c}.pill[data-state="no"]{background:#171a1f;color:#a8b0bd}.pill[data-state="error"]{background:#2b1719;color:#ff9898;border-color:#783d43}.panel{background:#171a1f;border-color:#343a43;box-shadow:0 20px 54px rgba(0,0,0,.55)}.row,.time{border-color:#2b3038}.addr,.hint,.close{color:#929baa}.no{color:#7c8796}}
    </style><div class="dock" hidden><button class="pill" type="button">👁 查询持仓…</button><div class="panel"><div class="head"><span>关注地址持仓</span><button class="close" type="button" aria-label="关闭">×</button></div><div class="rows"></div></div></div>`;
    (document.documentElement || document).append(host);
    shadow.querySelector(".pill").addEventListener("click", () => setPanel(!panelOpen));
    shadow.querySelector(".close").addEventListener("click", () => setPanel(false));
    return shadow;
  }

  function setPanel(open) {
    panelOpen = Boolean(open);
    const shadow = mount();
    shadow.querySelector(".panel").classList.toggle("open", panelOpen);
  }

  function shortAddress(address) {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }

  function compactAmount(input) {
    const value = Number(input);
    if (!Number.isFinite(value)) return input;
    return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  }

  function render(data, error = "") {
    const shadow = mount();
    const dock = shadow.querySelector(".dock");
    const pill = shadow.querySelector(".pill");
    const rows = shadow.querySelector(".rows");
    dock.hidden = false;
    latestData = data;
    if (error) {
      pill.dataset.state = "error";
      pill.textContent = `👁 查询失败`;
      rows.innerHTML = `<div class="hint">${escapeHtml(error)}。点击插件图标可检查地址设置。</div>`;
      return;
    }
    if (!data?.configured) {
      pill.dataset.state = "no";
      pill.textContent = "👁 请先添加关注地址";
      rows.innerHTML = `<div class="hint">点击浏览器工具栏里的插件图标，添加公开钱包地址和备注。</div>`;
      return;
    }
    const holders = data.wallets.filter((wallet) => wallet.hasBalance);
    if (!holders.length) {
      pill.dataset.state = "no";
      pill.textContent = `👁 ${data.wallets.length} 个地址 · 无持仓`;
    } else if (holders.length === 1) {
      const wallet = holders[0];
      pill.dataset.state = "yes";
      pill.textContent = `👁 ${wallet.label} · ${compactAmount(wallet.amount)} · ${wallet.percentage}%`;
    } else {
      pill.dataset.state = "yes";
      pill.textContent = `👁 ${holders.length}/${data.wallets.length} 个地址持仓`;
    }
    rows.innerHTML = data.wallets.map((wallet) => `<div class="row"><div><div class="name ${wallet.hasBalance ? "yes" : "no"}">${escapeHtml(wallet.label)}</div><div class="addr">${escapeHtml(shortAddress(wallet.address))}</div></div><div class="value ${wallet.hasBalance ? "yes" : "no"}">${wallet.hasBalance ? `${escapeHtml(compactAmount(wallet.amount))}<br>${escapeHtml(wallet.percentage)}%` : "无持仓"}</div></div>`).join("") + `<div class="time">刚刚从链上读取</div>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  async function refresh(force = false) {
    const route = parseRoute();
    const shadow = mount();
    if (!route) {
      shadow.querySelector(".dock").hidden = true;
      currentRouteKey = "";
      return;
    }
    shadow.querySelector(".dock").hidden = false;
    if (!force && currentRouteKey === route.key && (latestData || loadingRouteKey === route.key)) return;
    currentRouteKey = route.key;
    loadingRouteKey = route.key;
    const ownRequest = ++requestId;
    shadow.querySelector(".pill").removeAttribute("data-state");
    shadow.querySelector(".pill").textContent = "👁 查询持仓…";
    try {
      if (!API?.sendMessage) throw new Error("扩展需要重新加载");
      const response = await API.sendMessage({ type: "holdings.resolve", payload: route });
      if (ownRequest !== requestId || currentRouteKey !== route.key) return;
      if (!response?.ok) throw new Error(response?.error || "查询失败");
      render(response.data);
    } catch (error) {
      if (ownRequest === requestId) render(null, error?.message || "查询失败");
    } finally {
      if (loadingRouteKey === route.key) loadingRouteKey = "";
    }
  }

  function schedule(force = false) {
    if (force) currentRouteKey = "";
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      refresh(force);
    });
  }

  function start() {
    mount();
    schedule();
    const observer = new MutationObserver(() => schedule());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    addEventListener("popstate", () => schedule(true), { passive: true });
    addEventListener("hashchange", () => schedule(true), { passive: true });
    if (globalThis.navigation?.addEventListener) navigation.addEventListener("navigate", () => schedule(true));
    STORAGE?.onChanged?.addListener?.((changes, area) => {
      if (area === "local" && changes[STORAGE_KEY]) schedule(true);
    });
  }

  if (document.documentElement) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();
