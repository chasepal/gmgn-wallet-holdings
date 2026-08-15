const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";
const DECIMALS_SELECTOR = "0x313ce567";
const BALANCE_OF_SELECTOR = "0x70a08231";

export function encodeBalanceOf(address) {
  const clean = String(address).toLowerCase().replace(/^0x/, "");
  if (!/^[a-f0-9]{40}$/.test(clean)) throw new Error("钱包地址无效");
  return `${BALANCE_OF_SELECTOR}${clean.padStart(64, "0")}`;
}

export function hexToBigInt(value) {
  if (typeof value !== "string" || !/^0x[a-f0-9]+$/i.test(value)) throw new Error("RPC 返回值无效");
  return BigInt(value);
}

export function unitsToDecimal(rawValue, decimalsValue) {
  const raw = BigInt(rawValue);
  const decimals = Math.max(0, Math.min(255, Number(decimalsValue) || 0));
  if (decimals === 0) return raw.toString();
  const digits = raw.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function percentageOf(balanceValue, totalValue) {
  const balance = BigInt(balanceValue);
  const total = BigInt(totalValue);
  if (total <= 0n || balance <= 0n) return "0";
  const scaled = (balance * 1000000n) / total;
  const whole = scaled / 10000n;
  const fraction = (scaled % 10000n).toString().padStart(4, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

async function postJson(url, payload, timeoutMs = 6500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function withRpcFallback(rpcUrls, task) {
  let lastError = null;
  for (const rpcUrl of rpcUrls) {
    try {
      return await task(rpcUrl);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("没有可用 RPC");
}

function makeResult(wallet, balance, totalSupply, decimals) {
  return {
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    hasBalance: balance > 0n,
    amount: unitsToDecimal(balance, decimals),
    percentage: percentageOf(balance, totalSupply)
  };
}

export async function queryEvmHoldings({ token, wallets, rpcUrls }) {
  const compatible = wallets.filter((wallet) => wallet.family === "evm");
  if (!compatible.length) return [];
  return withRpcFallback(rpcUrls, async (rpcUrl) => {
    const calls = [
      { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data: TOTAL_SUPPLY_SELECTOR }, "latest"] },
      { jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: token, data: DECIMALS_SELECTOR }, "latest"] },
      ...compatible.map((wallet, index) => ({
        jsonrpc: "2.0",
        id: 100 + index,
        method: "eth_call",
        params: [{ to: token, data: encodeBalanceOf(wallet.address) }, "latest"]
      }))
    ];
    const response = await postJson(rpcUrl, calls);
    if (!Array.isArray(response)) throw new Error("RPC 不支持批量查询");
    const byId = new Map(response.map((item) => [item.id, item]));
    const totalSupply = hexToBigInt(byId.get(1)?.result);
    const decimals = Number(hexToBigInt(byId.get(2)?.result));
    return compatible.map((wallet, index) => {
      const item = byId.get(100 + index);
      if (item?.error) throw new Error(item.error.message || "余额查询失败");
      return makeResult(wallet, hexToBigInt(item?.result), totalSupply, decimals);
    });
  });
}

export async function querySolanaHoldings({ token, wallets, rpcUrls }) {
  const compatible = wallets.filter((wallet) => wallet.family === "solana");
  if (!compatible.length) return [];
  return withRpcFallback(rpcUrls, async (rpcUrl) => {
    const calls = [
      { jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [token, { commitment: "confirmed" }] },
      ...compatible.map((wallet, index) => ({
        jsonrpc: "2.0",
        id: 100 + index,
        method: "getTokenAccountsByOwner",
        params: [wallet.address, { mint: token }, { encoding: "jsonParsed", commitment: "confirmed" }]
      }))
    ];
    const response = await postJson(rpcUrl, calls);
    if (!Array.isArray(response)) throw new Error("Solana RPC 不支持批量查询");
    const byId = new Map(response.map((item) => [item.id, item]));
    const supplyValue = byId.get(1)?.result?.value;
    const totalSupply = BigInt(supplyValue?.amount || "0");
    const decimals = Number(supplyValue?.decimals || 0);
    return compatible.map((wallet, index) => {
      const item = byId.get(100 + index);
      if (item?.error) throw new Error(item.error.message || "余额查询失败");
      const accounts = item?.result?.value || [];
      const balance = accounts.reduce((sum, account) => {
        const amount = account?.account?.data?.parsed?.info?.tokenAmount?.amount || "0";
        return sum + BigInt(amount);
      }, 0n);
      return makeResult(wallet, balance, totalSupply, decimals);
    });
  });
}

