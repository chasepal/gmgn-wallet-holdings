# 权限、数据流与风险

## 最小权限

### `storage`

仅使用 `chrome.storage.local` 保存用户主动添加的：

- 公开钱包地址；
- 用户自定义备注；
- 地址类型（EVM 或 Solana）。

FOMO 聚合缓存只包含链、完整 CA、聚合人数和观测时间；短期 FOMO 会话不写入本地存储。

不保存私钥、助记词、API Key、GMGN Cookie 或交易凭证。

### GMGN 页面访问范围

内容脚本只允许运行于：

- `https://gmgn.ai/*`
- `https://*.gmgn.ai/*`

用途仅为识别当前链与代币地址，并渲染持仓标签。插件没有 `<all_urls>` 权限，也不会在 X、邮箱、交易所或其他网站运行。

另一个内容脚本只允许运行于 `https://fomo.family/tokens/*`，用途是读取当前 FOMO 代币页明确的 `Holders (N)` 聚合标签。后台只观察可信 FOMO 页面发往 `prod-api.fomo.family` 的短期 `Authorization`，用于 GMGN 页面自动同步，不读取 Cookie、持仓用户列表或钱包数据。

### FOMO 自动同步

`webRequest` 只匹配 `https://prod-api.fomo.family/*`，并且仅接受 `fomo.family` 页面发起的请求。凭证只保存在 Service Worker 内存中，限制为短时有效；不会写入 `chrome.storage.local`，不会出现在返回给页面的数据中，也不会发送给开发者服务器。

### 公共 RPC 域名访问范围

`host_permissions` 仅包含 `manifest.json` 中逐项列出的 BSC、Robinhood、XLayer、Ethereum、Base、Arbitrum、Optimism、Polygon、Avalanche、Blast、Stable 和 Solana 公共 RPC、FOMO 页面 `https://fomo.family/*`，以及 FOMO 聚合接口 `https://prod-api.fomo.family/*`。

查询内容：

- EVM：代币合约的 `balanceOf(address)`、`totalSupply()`、`decimals()`；
- Solana：`getTokenAccountsByOwner` 与 `getTokenSupply`。

全部是只读 RPC。代码不包含交易签名、授权、转账或钱包连接能力。

## 明确没有的权限

- 无 `tabs`：不能枚举或控制浏览器标签页；
- 无 `cookies`：不能读取 GMGN 或其他网站登录态；
- 无 `history`：不能读取浏览历史；
- `webRequest` 不是全局拦截：仅观察可信 FOMO 页面发往 FOMO 聚合接口的请求头，用于短期自动同步；不改写网络流量；
- 无 `scripting`：不能临时向任意页面注入代码；
- 无 `<all_urls>`：不能在所有网站运行；
- 无剪贴板权限：不能读取或静默改写剪贴板；
- 无钱包权限：不能访问浏览器钱包、私钥或发起交易。

## 数据流

```text
用户输入公开钱包地址与备注
        ↓
chrome.storage.local（仅本机浏览器扩展空间）
        ↓
打开 GMGN 代币页时读取链与 Token 地址
        ↓
公开钱包地址 + Token 地址 → 对应第三方公共 RPC
        ↓
余额、总供应量、精度 → 插件本地计算数量与占比 → 页面显示

FOMO 页面正常登录并发出可信聚合请求
        ↓
后台暂存短期 Authorization（仅内存）
        ↓
GMGN 代币页自动请求精确链 + 完整 CA 的 FOMO 聚合接口
        ↓
只保留 `totalHolders` 聚合人数
        ↓
链 + 完整 CA + 聚合人数 + 观测时间 → chrome.storage.local
        ↓
匹配的 GMGN 代币页显示 FOMO 持仓总数
```

没有开发者后端、用户账户、统计 SDK、广告 SDK或遥测上传。

## 风险与限制

### 1. RPC 隐私风险

公共钱包地址本身是公开数据，但一次 RPC 请求会把访问 IP、查询时间、钱包地址与代币地址关联起来。公共 RPC 服务商可能记录这些信息。介意时请不要使用，或审查代码后改用自有 RPC。

### 2. 准确性风险

- RPC 可能限流、离线、同步落后或返回错误结果；
- 非标准、代理、Rebase 或恶意代币合约可能返回误导性的 `balanceOf` / `totalSupply`；
- Solana Token Account 的冻结、委托等状态不等于可自由卖出的余额；
- 交易所内部余额、托管子账户、跨链映射和推断出的关联地址不可见；
- 占比仅为 `钱包链上余额 ÷ 代币报告的总供应量`，不是流通占比。

因此结果只适合快速辅助核对，不构成投资建议或资产证明。

### 3. 本地存储风险

`chrome.storage.local` 不是加密保险箱。此插件只要求公开地址，但备注可能暴露用户自行填写的身份关系。不要填写真实姓名、联系方式、密码、助记词、私钥或 API Key。

### 4. 第三方页面变化

GMGN 路由或页面结构改变后，标签可能暂时无法显示。插件使用固定浮层和单个 DOM 观察器降低冲突，但无法保证与未来所有页面版本兼容。

## 安全审计建议

发布包是纯前端源代码，不含压缩或混淆文件。安装前可以重点审查：

- `manifest.json`：权限与允许访问的域名；
- `background.js`、`lib/holdings.js`：RPC 请求内容；
- `content.js`：页面读取与显示逻辑；
- `fomo-token.js`、`lib/fomo-holders.js`：FOMO 聚合人数读取与本地缓存逻辑；
- `lib/fomo-session.js`：FOMO 短期会话捕获、精确 CA 请求与聚合响应归一化；
- `popup.js`、`lib/settings.js`：本地地址存储逻辑。

安全问题请通过 GitHub Issues 报告；请勿在 Issue 中粘贴任何私钥、助记词或敏感身份信息。
