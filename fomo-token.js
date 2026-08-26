(() => {
  const holders = globalThis.__GWH_FOMO_HOLDERS__;
  if (!holders) return;

  let activeKey = "";
  let lastCount = null;
  let timer = null;

  function schedule() {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      sync();
    }, 180);
  }

  async function sync() {
    const subject = holders.parseFomoTokenUrl(location.href);
    if (!subject) return;
    const key = `${subject.chain}:${subject.address}`;
    if (key !== activeKey) {
      activeKey = key;
      lastCount = null;
    }
    const result = holders.readFomoHolderCount(document);
    if (!result || result.count === lastCount) return;
    lastCount = result.count;
    await holders.writeStored({
      chain: subject.chain,
      address: subject.address,
      holderCount: result.count,
      approximate: result.approximate,
      display: result.display,
      observedAt: Date.now(),
    });
  }

  function start() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    schedule();
    addEventListener("popstate", schedule, { passive: true });
    addEventListener("hashchange", schedule, { passive: true });
    addEventListener("focus", schedule, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) schedule();
    });
  }

  if (document.documentElement) start();
  else addEventListener("DOMContentLoaded", start, { once: true });
})();
