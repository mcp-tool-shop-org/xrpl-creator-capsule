<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases"><img src="https://img.shields.io/badge/release-v1.1.0-brightgreen" alt="v1.1.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/handbook-live-brightgreen" alt="Handbook" /></a>
</p>

创作者拥有的 XRP Ledger 发布系统。发布作品、直接销售、解锁收藏者权益、管理收益——所有这些都以持久的链上证明为后盾。

> **首先在测试网上发布。** 此版本是一个测试网产品。该引擎架构同时支持测试网和主网，但所有信任证明仅已在测试网上验证。主网是一个经过谨慎考虑的推广——而不是默认设置。

## 两种使用方式

### 桌面应用程序（推荐给创作者）

从 [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/latest) 下载 Windows 安装程序，并按照[初学者指南](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/) 进行操作。

**工作室模式** 会引导您完成一个六步流程：

1. 描述您的发布内容（标题、艺术家、版本数量、文件）
2. 设置收藏者权益（附加曲目、音轨、高分辨率艺术作品）
3. 查看条款和安全措施
4. 发布到 XRPL 测试网
5. 测试收藏者的访问权限
6. 生成恢复包

需要 [Node.js 22+](https://nodejs.org/)（未来版本将提供捆绑的运行时环境）。

### CLI（面向开发人员和集成者）

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # full test suite (700+ tests), zero network calls
```

15 个命令涵盖完整的发布生命周期：

| 命令 | 目的 |
|---------|---------|
| `init-wallets` | 生成并资助发行者 + 操作员钱包对 |
| `configure-minter` | 将操作员设置为发行者帐户中授权的铸造者 |
| `create-release` | 从清单输入文件创建发布内容 |
| `validate` | 根据模式验证发布清单 |
| `resolve` | 检查清单指针在结构上是否有效 |
| `mint-release` | 铸造 NFT 版本并发出发行收据 |
| `verify-release` | 将清单 + 收据与链状态进行对账 |
| `create-access-policy` | 从清单 + 收据生成访问策略 |
| `grant-access` | 评估访问请求并发出授权收据 |
| `recover-release` | 从工件 + 链状态重建发布内容 |
| `create-governance-policy` | 为发布资金库创建治理策略 |
| `propose-payout` | 根据治理策略创建支付提案 |
| `decide-payout` | 收集批准并发出决策收据 |
| `execute-payout` | 记录支付执行情况并验证哈希链 |
| `verify-payout` | 验证所有 4 个治理工件及其关系 |

## 它证明了什么

XRPL Creator Capsule 将 XRP Ledger 视为用于控制所有权、付款、访问和生存能力的可持续控制平面。它不是一个市场——它是使市场成为可选方案的基础设施。

| 阶段 | 它证明了什么 |
|-------|---------------|
| A — 创作者意图 | 清单身份是确定性的且防篡改的 |
| B — 铸造真相 | XRPL 上的 NFT 与清单完全匹配（实时测试网证明） |
| C — 访问真相 | 所有权解锁真实的链下访问权限 |
| D — 治理真相 | 通过可审核的批准链进行收益管理 |
| E — 可持续性真相 | 发布内容可在前端失效后仍然存在（已通过生存能力测试） |
| 桌面运行时信任 | 模式切换、重启、中断、超时、计时 |

该套件目前在引擎包、CLI 和桌面应用程序中运行 **700 多个测试**——`bash verify.sh` 将运行所有内容并打印实时计数，且不进行任何网络调用。（确切数字会随着套件的增长而变化；该命令是事实来源。）

## 架构

```
app/              Desktop app (Tauri v2 + React)
  src/            Studio Mode + Advanced Mode UI
  src-tauri/      Rust backend (file I/O, bridge dispatch)
  bridge-worker   Engine bridge (stdin/stdout JSON-RPC)
packages/
  core/           Canonical contracts, schemas, validation, hashing
  xrpl/           XRPL client (connect, mint, verify, holder checks)
  storage/        Content store + delivery provider interfaces
  xaman/          Wallet-mediated signing via Xaman
  cli/            15 CLI commands
artifacts/        Live Testnet proof artifacts
site/             Handbook (Astro Starlight)
```

包含 5 个引擎包 + 桌面应用程序的单仓库。TypeScript、Vitest、Tauri v2、Node 22+。

## 网络状态

该系统具有完整的网络感知能力——测试网和主网是不同的可配置目标。

| | 测试网 | 主网 |
|-|---------|---------|
| **Default** | 是 | No |
| **Trust-proven** | 是（实时证明，完整套件） | 尚未 |
| **CLI guard** | 不需要 | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | 工作室模式默认设置 | 未在桌面应用程序中公开 |

**将此版本视为测试网预览。** 架构并非仅限于测试网，但信任证明已在测试网上验证。主网的准备需要实时 Xaman 签名和有意的推广——而不是简单地切换标志。

## 信任模型

**What this system touches:**
- Local JSON files (manifests, receipts, policies, bundles)
- XRPL via WebSocket (`wss://`) for minting, verification, and holder checks
- Wallet seed phrases stored in local `wallets.json` (gitignored, never committed)

**此系统不涉及的内容：**
- 除了 XRPL 节点之外没有外部 API
- 没有数据库、云存储或第三方服务
- 没有用户分析、跟踪或遥测

**安全边界：**
- 主网写入需要明确的 `--network mainnet --allow-mainnet-write`
- 钱包凭据保留在本地——仅传输到 XRPL 以进行交易签名
- 所有哈希都使用 SHA-256 对确定性 `sortKeysDeep()` 正则化后的内容进行计算
- 可以独立地将每个工件与账本进行验证
- `xrpl` 固定为确切版本 4.2.5（发布 npm 供应链咨询后）

## 已知限制

- **桌面应用程序需要 Node.js**（未来版本将提供捆绑的运行时环境）
- **Xaman QR 签名尚未启用**——需要钱包凭据文件（基于种子，仅限测试网）
- **IPFS 上传待定**——文件指针使用本地路径，真正的内容寻址存储即将推出
- **仅支持 Windows**——未来 RC 版本计划提供 macOS 安装程序

## 报告问题

单击桌面标题栏中的“报告”以导出支持包，然后打开 [GitHub issue](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose)。

## 许可证

MIT

---

由 MCP 工具商店 (<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>) 创建。
