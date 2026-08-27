# GMGN 持仓观察

一个功能单一、可分享、不需要私人 API 的 Chrome 扩展。

> 只读取公开链上数据与 FOMO 公开聚合数据。插件不会、也没有能力读取私钥、助记词、GMGN 登录态或交易账户。

## 功能

- 在插件弹窗中添加公开 EVM 或 Solana 钱包地址和备注。
- 进入 GMGN 代币页后，右上角立即显示这些地址是否持有当前代币。
- 持仓按钮可拖动到任意位置，并在本机记住上次位置。
- 有持仓时显示代币数量和占总供应量比例；点击标签查看全部地址。
- 正常登录 FOMO 后，自动读取明确的 `Holders (N)` 聚合人数，并在 GMGN 持仓面板显示 FOMO 持仓总数。
- 支持 GMGN 的 BSC、Robinhood、XLayer、Ethereum、Base、Arbitrum、Optimism、Polygon、Avalanche、Blast、Stable、Solana 页面。
- 地址只保存在本机 `chrome.storage.local`；查询直接发送到对应公链的公开 RPC。

## 安装

1. 下载 Release 里的 `gmgn-wallet-holdings-v*.zip` 资产并**完整解压**；不要只复制 `manifest.json`。
2. 打开 `chrome://extensions/`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择解压后的文件夹。
5. 点击插件图标，添加钱包地址和备注。

升级后如果错误页仍保留旧错误，请先删除旧扩展、加载新目录，再点“全部清除”。

## 权限说明

| 权限 | 用途 | 不会做什么 |
|---|---|---|
| `storage` | 将用户主动填写的公开钱包地址和备注保存在浏览器本地 | 不读取网站 Cookie、密码、私钥或其他扩展的数据 |
| `webRequest` | 仅观察可信 FOMO 页面发往 FOMO 聚合接口的短期 `Authorization`，用于自动同步 | 不改写请求，不把凭证写入磁盘或发送给开发者 |
| GMGN 内容脚本范围 | 只在 `https://gmgn.ai/*` 与 `https://*.gmgn.ai/*` 显示持仓结果 | 不注入其他网站，没有 `<all_urls>` 权限 |
| FOMO 内容脚本范围 | 只在 `https://fomo.family/tokens/*` 读取可见的 `Holders (N)` 聚合标签 | 不读取 FOMO 登录态、用户列表或钱包数据 |
| 列出的公链 RPC 域名 | 调用 ERC-20 `balanceOf/totalSupply/decimals` 或 Solana Token RPC | 不签名、不授权、不发交易，不调用用户钱包 |

插件**没有**申请 `tabs`、`cookies`、`history`、`clipboardWrite`、`scripting` 或 `<all_urls>`。

完整列表见 [权限与风险](SECURITY.md)。

## 边界

- 只判断当前公开链上余额，不追踪跨链归属、关联钱包或交易所内部余额。
- 数量与占比来自链上实时查询；公开 RPC 繁忙时可能短暂失败，重新进入页面即可重试。
- FOMO 持仓总数默认由后台自动同步；首次使用只需正常登录 FOMO 一次，无需从 GMGN 面板手动打开对应代币页。短期会话只保存在内存中，过期后需重新登录 FOMO。
- FOMO 链映射目前覆盖 BSC、Ethereum、Base、Robinhood、Solana；XLayer、Arbitrum 等其他已支持的 GMGN 链仍可正常查询钱包持仓，但不显示 FOMO 总数。
- FOMO 只读取页面明确的 `Holders (N)` 聚合标签，不读取持仓用户列表；数据按链、完整 CA 和观测时间保存在本机。
- 本插件不包含价格、费用、评分、交易或自动打开 X 等功能。

## 主要风险

- 查询会把“公开钱包地址 + 当前代币地址”发送给清单中对应的第三方公共 RPC；RPC 服务商通常也能看到访问 IP。介意这种关联时请勿使用，或自行替换为可信 RPC。
- 公共 RPC 可能限流、中断、返回过期或错误结果；界面会显示查询失败，但不能把本插件当成唯一投资依据。
- 恶意或非标准代币合约可能让 `balanceOf`、`totalSupply` 返回误导结果；交易所内部余额、跨链映射和关联钱包不在判断范围内。
- FOMO 页面显示的聚合人数可能暂时未加载、被缩写或过期；缩写会标记为“约”，缺少括号聚合标签时不会拿页面上的其他持有人数字代替。
- 浏览器本地存储不是加密保险箱。虽然这里只保存公开地址与备注，仍不建议在备注中填写真实姓名、联系方式或其他敏感信息。
