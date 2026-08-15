# Changelog

## 1.0.1

- 修复发布 ZIP 遗漏后台依赖模块，导致 Chrome 报 `Service worker registration failed. Status code: 3`。
- 新增发布包完整性检查：后台脚本及其三个依赖缺一不可，缺失时禁止生成安装包。

## 1.0.0

- 独立地址持仓检查功能。
- 支持 EVM 多链和 Solana。
- 显示持有状态、数量、总供应占比。
- 本地地址备注管理、12 秒短缓存和单一页面观察器。
- 补充最小权限、RPC 数据流、隐私风险与准确性边界说明。
