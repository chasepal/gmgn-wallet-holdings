const CHAINS = [
  ["robinhood", ["robinhood", "rhc"], "evm", ["https://robinhood-rpc.publicnode.com", "https://rpc.mainnet.chain.robinhood.com"]],
  ["bsc", ["bsc", "bnb"], "evm", ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org"]],
  ["ethereum", ["eth", "ethereum"], "evm", ["https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com"]],
  ["base", ["base"], "evm", ["https://base-rpc.publicnode.com", "https://mainnet.base.org"]],
  ["xlayer", ["xlayer", "x-layer"], "evm", ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"]],
  ["arbitrum", ["arb", "arbitrum"], "evm", ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"]],
  ["optimism", ["op", "optimism"], "evm", ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io"]],
  ["polygon", ["polygon", "matic"], "evm", ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"]],
  ["avalanche", ["avax", "avalanche"], "evm", ["https://avalanche-c-chain-rpc.publicnode.com", "https://api.avax.network/ext/bc/C/rpc"]],
  ["blast", ["blast"], "evm", ["https://blast-rpc.publicnode.com", "https://rpc.blast.io"]],
  ["stable", ["stable", "stablechain"], "evm", ["https://rpc.stable.xyz"]],
  ["solana", ["sol", "solana"], "solana", ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"]]
].map(([id, aliases, family, rpcUrls]) => Object.freeze({ id, aliases, family, rpcUrls }));

const ALIASES = new Map(CHAINS.flatMap((chain) => chain.aliases.map((alias) => [alias, chain])));

export function getChain(value) {
  return ALIASES.get(String(value || "").toLowerCase()) || null;
}

export function parseGmgnTokenUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.hostname !== "gmgn.ai" && !url.hostname.endsWith(".gmgn.ai")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[1] !== "token") return null;
  const chain = getChain(parts[0]);
  if (!chain) return null;
  const token = parts[2];
  if (chain.family === "evm" && !/^0x[a-f0-9]{40}$/i.test(token)) return null;
  if (chain.family === "solana" && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)) return null;
  return { chain: chain.id, family: chain.family, token: chain.family === "evm" ? token.toLowerCase() : token };
}

export { CHAINS };

