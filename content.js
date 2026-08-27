(() => {
  const HOST_ID = "gmgn-wallet-holdings-root";
  const STORAGE_KEY = "gmgnWalletHoldings.watchlist.v1";
  const POSITION_KEY = "gmgnWalletHoldings.dockPosition.v1";
  const FOMO = globalThis.__GWH_FOMO_HOLDERS__;
  const FOMO_STORAGE_KEY = FOMO?.STORAGE_KEY || "gmgnFomoHolderTotals.v1";
  const FOMO_MESSAGE_TYPE = "fomo.holder.resolve";
  const API = globalThis.__GWH_TEST__?.runtime || globalThis.chrome?.runtime;
  const STORAGE = globalThis.__GWH_TEST__?.storage || globalThis.chrome?.storage;
  let currentRouteKey = "";
  let loadingRouteKey = "";
  let requestId = 0;
  let queued = false;
  let panelOpen = false;
  let latestData = null;
  let latestFomo = null;
  let dockPosition = null;
  let dragState = null;
  let suppressNextClick = false;

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
      :host{all:initial}.dock{position:fixed;right:20px;top:92px;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2937}.pill{appearance:none;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:12px;padding:9px 13px;font-size:14px;font-weight:700;box-shadow:0 5px 18px rgba(15,23,42,.12);cursor:grab;touch-action:none;user-select:none;white-space:nowrap}.pill:active{cursor:grabbing}.pill[data-state="yes"]{border-color:#34d399;color:#047857;background:#ecfdf5}.pill[data-state="no"]{color:#64748b;background:#f8fafc}.pill[data-state="error"]{border-color:#fca5a5;color:#b91c1c;background:#fff7f7}.panel{box-sizing:border-box;display:none;margin-top:8px;width:360px;max-height:420px;overflow:auto;border:1px solid #d8dee8;border-radius:14px;background:#fff;box-shadow:0 18px 48px rgba(15,23,42,.2);padding:10px}.panel.open{display:block}.dock.edge-right .panel{margin-left:calc(100% - 360px)}.dock.edge-bottom .panel{position:absolute;bottom:calc(100% + 8px);margin-top:0}.head{display:flex;justify-content:space-between;align-items:center;padding:3px 4px 9px;font-size:14px;font-weight:800}.close{border:0;background:transparent;color:#64748b;font-size:18px;cursor:pointer}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;padding:10px 8px;border-top:1px solid #edf0f4}.name{font-size:14px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.addr{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#7b8797}.value{text-align:right;font-size:13px;font-weight:750}.yes{color:#059669}.no{color:#94a3b8}.hint{padding:12px 8px;color:#64748b;font-size:13px;line-height:1.5}.time{padding:7px 8px 2px;border-top:1px solid #edf0f4;color:#94a3b8;font-size:11px;text-align:right}.fomo-total{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:4px 8px;margin:2px 0 8px;padding:10px 8px;border:1px solid #b9efd7;border-radius:10px;background:#f0fdf7}.fomo-total span{color:#047857;font-size:12px;font-weight:700}.fomo-total strong{color:#047857;font-size:15px}.fomo-total small{grid-column:1 / 2;color:#6b7280;font-size:11px}.fomo-total a{color:#047857;font-size:11px;text-decoration:none}.fomo-total a:hover{text-decoration:underline}.fomo-total.stale{border-color:#f0d59c;background:#fffbeb}.fomo-total.stale span,.fomo-total.stale strong,.fomo-total.stale a{color:#a16207}
      @media(prefers-color-scheme:dark){.dock{color:#e5e7eb}.pill{background:#171a1f;border-color:#3a4049;color:#e5e7eb;box-shadow:0 6px 22px rgba(0,0,0,.35)}.pill[data-state="yes"]{background:#10271f;color:#5ee0aa;border-color:#277a5c}.pill[data-state="no"]{background:#171a1f;color:#a8b0bd}.pill[data-state="error"]{background:#2b1719;color:#ff9898;border-color:#783d43}.panel{background:#171a1f;border-color:#343a43;box-shadow:0 20px 54px rgba(0,0,0,.55)}.row,.time{border-color:#2b3038}.addr,.hint,.close{color:#929baa}.no{color:#7c8796}.fomo-total{border-color:#277a5c;background:#10271f}.fomo-total span,.fomo-total strong,.fomo-total a{color:#5ee0aa}.fomo-total small{color:#929baa}.fomo-total.stale{border-color:#80651f;background:#2b2416}.fomo-total.stale span,.fomo-total.stale strong,.fomo-total.stale a{color:#f1c76e}}
    </style><div class="dock" hidden><button class="pill" type="button" title="拖动调整位置，点击展开">👁 查询持仓…</button><div class="panel"><div class="head"><span>关注地址持仓</span><button class="close" type="button" aria-label="关闭">×</button></div><div class="rows"></div></div></div>`;
    (document.documentElement || document).append(host);
    const pill = shadow.querySelector(".pill");
    pill.addEventListener("pointerdown", startDrag);
    pill.addEventListener("pointermove", moveDrag);
    pill.addEventListener("pointerup", finishDrag);
    pill.addEventListener("pointercancel", finishDrag);
    pill.addEventListener("click", (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        event.preventDefault();
        return;
      }
      setPanel(!panelOpen);
    });
    shadow.querySelector(".close").addEventListener("click", () => setPanel(false));
    return shadow;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function updatePanelDirection() {
    const dock = mount().querySelector(".dock");
    const rect = dock.querySelector(".pill").getBoundingClientRect();
    dock.classList.toggle("edge-right", rect.left + 360 > innerWidth - 8);
    dock.classList.toggle("edge-bottom", rect.top + rect.height + 438 > innerHeight - 8);
  }

  function applyDockPosition(position) {
    const dock = mount().querySelector(".dock");
    const pill = dock.querySelector(".pill");
    const x = clamp(Number(position?.x) || 8, 8, innerWidth - (pill.offsetWidth || 140) - 8);
    const y = clamp(Number(position?.y) || 8, 8, innerHeight - (pill.offsetHeight || 40) - 8);
    dockPosition = { x: Math.round(x), y: Math.round(y) };
    dock.style.left = `${dockPosition.x}px`;
    dock.style.top = `${dockPosition.y}px`;
    dock.style.right = "auto";
    updatePanelDirection();
  }

  async function restoreDockPosition() {
    if (!STORAGE?.local?.get) return;
    try {
      const data = await STORAGE.local.get(POSITION_KEY);
      if (data?.[POSITION_KEY]) requestAnimationFrame(() => applyDockPosition(data[POSITION_KEY]));
    } catch {}
  }

  function persistDockPosition() {
    if (!dockPosition || !STORAGE?.local?.set) return;
    Promise.resolve(STORAGE.local.set({ [POSITION_KEY]: dockPosition })).catch(() => {});
  }

  function startDrag(event) {
    if (event.isPrimary === false || event.button !== 0) return;
    const dock = mount().querySelector(".dock");
    const rect = dock.getBoundingClientRect();
    dragState = { pointerId: event.pointerId, originX: event.clientX, originY: event.clientY, x: rect.left, y: rect.top, moved: false };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {}
  }

  function moveDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.originX;
    const dy = event.clientY - dragState.originY;
    if (!dragState.moved && Math.hypot(dx, dy) < 5) return;
    dragState.moved = true;
    applyDockPosition({ x: dragState.x + dx, y: dragState.y + dy });
    event.preventDefault();
  }

  function finishDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (dragState.moved) {
      suppressNextClick = true;
      persistDockPosition();
    }
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    dragState = null;
  }

  function setPanel(open) {
    panelOpen = Boolean(open);
    const shadow = mount();
    shadow.querySelector(".panel").classList.toggle("open", panelOpen);
    updatePanelDirection();
  }

  function shortAddress(address) {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }

  function compactAmount(input) {
    const value = Number(input);
    if (!Number.isFinite(value)) return input;
    return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  }

  function formatFomoCount(input) {
    const value = Number(input);
    return Number.isFinite(value) ? value.toLocaleString("zh-CN") : "—";
  }

  function fomoTotalMarkup(route) {
    const url = FOMO?.fomoTokenUrl?.(route);
    if (!url) return "";
    const record = latestFomo;
    if (!record) {
      return `<div class="fomo-total"><span>FOMO 持仓总数</span><strong>自动同步中</strong><small>需先正常登录 FOMO 一次</small></div>`;
    }
    const age = Math.max(0, Date.now() - Number(record.observedAt || 0));
    const stale = age > Number(FOMO.STALE_MS || 24 * 60 * 60 * 1_000);
    const prefix = record.approximate ? "约 " : "";
    return `<div class="fomo-total${stale ? " stale" : ""}"><span>FOMO 持仓总数</span><strong>${prefix}${formatFomoCount(record.holderCount)}</strong><small>${stale ? "缓存较旧，自动更新中" : "来自 FOMO Holders 自动同步"}</small></div>`;
  }

  function fomoPillSuffix() {
    if (!latestFomo) return "";
    return ` · FOMO ${latestFomo.approximate ? "约 " : ""}${formatFomoCount(latestFomo.holderCount)}`;
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
      rows.innerHTML = `${fomoTotalMarkup(parseRoute())}<div class="hint">${escapeHtml(error)}。点击插件图标可检查地址设置。</div>`;
      return;
    }
    if (!data?.configured) {
      pill.dataset.state = "no";
      pill.textContent = "👁 请先添加关注地址";
      rows.innerHTML = `${fomoTotalMarkup(parseRoute())}<div class="hint">点击浏览器工具栏里的插件图标，添加公开钱包地址和备注。</div>`;
      return;
    }
    const holders = data.wallets.filter((wallet) => wallet.hasBalance);
    if (!holders.length) {
      pill.dataset.state = "no";
      pill.textContent = `👁 ${data.wallets.length} 个地址 · 无持仓${fomoPillSuffix()}`;
    } else if (holders.length === 1) {
      const wallet = holders[0];
      pill.dataset.state = "yes";
      pill.textContent = `👁 ${wallet.label} · ${compactAmount(wallet.amount)} · ${wallet.percentage}%${fomoPillSuffix()}`;
    } else {
      pill.dataset.state = "yes";
      pill.textContent = `👁 ${holders.length}/${data.wallets.length} 个地址持仓${fomoPillSuffix()}`;
    }
    rows.innerHTML = fomoTotalMarkup(data) + data.wallets.map((wallet) => `<div class="row"><div><div class="name ${wallet.hasBalance ? "yes" : "no"}">${escapeHtml(wallet.label)}</div><div class="addr">${escapeHtml(shortAddress(wallet.address))}</div></div><div class="value ${wallet.hasBalance ? "yes" : "no"}">${wallet.hasBalance ? `${escapeHtml(compactAmount(wallet.amount))}<br>${escapeHtml(wallet.percentage)}%` : "无持仓"}</div></div>`).join("") + `<div class="time">刚刚从链上读取</div>`;
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
    const routeChanged = currentRouteKey !== route.key;
    currentRouteKey = route.key;
    if (routeChanged) {
      latestData = null;
      latestFomo = null;
    }
    loadingRouteKey = route.key;
    const ownRequest = ++requestId;
    shadow.querySelector(".pill").removeAttribute("data-state");
    shadow.querySelector(".pill").textContent = "👁 查询持仓…";
    try {
      if (!API?.sendMessage) throw new Error("扩展需要重新加载");
      const [response, fomo] = await Promise.all([
        API.sendMessage({ type: "holdings.resolve", payload: route }),
        syncFomoTotal(route),
      ]);
      if (ownRequest !== requestId || currentRouteKey !== route.key) return;
      if (!response?.ok) throw new Error(response?.error || "查询失败");
      latestFomo = fomo;
      render(response.data);
    } catch (error) {
      if (ownRequest === requestId) render(null, error?.message || "查询失败");
    } finally {
      if (loadingRouteKey === route.key) loadingRouteKey = "";
    }
  }

  async function readFomoTotal(route) {
    if (!FOMO?.readStored || !STORAGE?.local) return null;
    try {
      return await FOMO.readStored(route, { storage: STORAGE.local });
    } catch {
      return null;
    }
  }

  async function syncFomoTotal(route) {
    const cached = await readFomoTotal(route);
    if (!API?.sendMessage || !FOMO?.writeStored || !STORAGE?.local) return cached;
    try {
      const response = await API.sendMessage({
        type: FOMO_MESSAGE_TYPE,
        payload: { chain: route.chain, address: route.token },
      });
      if (!response?.ok) return cached;
      const record = response.data?.records?.find?.((candidate) =>
        candidate?.chain === route.chain &&
        String(candidate?.address || "").toLowerCase() === String(route.token || "").toLowerCase(),
      );
      if (!record) return cached;
      await FOMO.writeStored(record, { storage: STORAGE.local });
      return record;
    } catch {
      return cached;
    }
  }

  async function refreshFomoTotal() {
    const route = parseRoute();
    if (!route || currentRouteKey !== route.key || !latestData) return;
    latestFomo = await readFomoTotal(route);
    if (currentRouteKey === route.key) render(latestData);
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
    restoreDockPosition();
    schedule();
    const observer = new MutationObserver(() => schedule());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    addEventListener("popstate", () => schedule(true), { passive: true });
    addEventListener("hashchange", () => schedule(true), { passive: true });
    if (globalThis.navigation?.addEventListener) navigation.addEventListener("navigate", () => schedule(true));
    addEventListener("focus", () => refreshFomoTotal(), { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshFomoTotal();
    });
    addEventListener("resize", () => {
      if (dockPosition) applyDockPosition(dockPosition);
    }, { passive: true });
    STORAGE?.onChanged?.addListener?.((changes, area) => {
      if (area !== "local") return;
      if (changes[STORAGE_KEY]) schedule(true);
      if (changes[FOMO_STORAGE_KEY]) refreshFomoTotal();
    });
  }

  if (document.documentElement) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();
