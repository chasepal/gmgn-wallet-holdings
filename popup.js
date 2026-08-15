import { loadWatchlist, saveWatchlist, parseWalletAddress, MAX_WALLETS } from "./lib/settings.js";

const form = document.querySelector("#form");
const labelInput = document.querySelector("#label");
const addressInput = document.querySelector("#address");
const error = document.querySelector("#error");
const listNode = document.querySelector("#list");
const empty = document.querySelector("#empty");
const count = document.querySelector("#count");
let watchlist = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function render() {
  count.textContent = `${watchlist.length}/${MAX_WALLETS}`;
  empty.hidden = watchlist.length > 0;
  listNode.innerHTML = watchlist.map((wallet) => `<div class="item" data-id="${escapeHtml(wallet.id)}"><strong>${escapeHtml(wallet.label)}<span class="family">${wallet.family === "evm" ? "EVM" : "SOL"}</span></strong><code title="${escapeHtml(wallet.address)}">${escapeHtml(wallet.address)}</code><button class="remove" type="button">删除</button></div>`).join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  const parsed = parseWalletAddress(addressInput.value);
  if (!parsed) {
    error.textContent = "请输入有效的 EVM 或 Solana 钱包地址";
    return;
  }
  if (watchlist.some((item) => item.address === parsed.address)) {
    error.textContent = "这个地址已经添加";
    return;
  }
  if (watchlist.length >= MAX_WALLETS) {
    error.textContent = `最多添加 ${MAX_WALLETS} 个地址`;
    return;
  }
  watchlist = await saveWatchlist([...watchlist, {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    label: labelInput.value,
    address: parsed.address,
    family: parsed.family
  }]);
  form.reset();
  labelInput.focus();
  render();
});

listNode.addEventListener("click", async (event) => {
  const button = event.target.closest(".remove");
  if (!button) return;
  const id = button.closest(".item")?.dataset.id;
  watchlist = await saveWatchlist(watchlist.filter((item) => item.id !== id));
  render();
});

watchlist = await loadWatchlist();
render();

