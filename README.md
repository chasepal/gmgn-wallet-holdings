# GMGN 持仓观察

一个功能单一、可分享、不需要私人 API 的 Chrome 扩展。

## 功能

- 在插件弹窗中添加公开 EVM 或 Solana 钱包地址和备注。
- 进入 GMGN 代币页后，右上角立即显示这些地址是否持有当前代币。
- 有持仓时显示代币数量和占总供应量比例；点击标签查看全部地址。
- 支持 GMGN 的 BSC、Robinhood、XLayer、Ethereum、Base、Arbitrum、Optimism、Polygon、Avalanche、Blast、Stable、Solana 页面。
- 地址只保存在本机 `chrome.storage.local`；查询直接发送到对应公链的公开 RPC。

## 安装

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目目录。
5. 点击插件图标，添加钱包地址和备注。

## 边界

- 只判断当前公开链上余额，不追踪跨链归属、关联钱包或交易所内部余额。
- 数量与占比来自链上实时查询；公开 RPC 繁忙时可能短暂失败，重新进入页面即可重试。
- 本插件不包含价格、费用、评分、交易或自动打开 X 等功能。

