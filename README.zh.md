<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases"><img src="https://img.shields.io/badge/release-v1.0.0-brightgreen" alt="v1.0.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/handbook-live-brightgreen" alt="Handbook" /></a>
</p>

在XRP账本上，提供创作者自主的发布系统。发行作品，直接销售，解锁收藏者权益，管理收益——所有这些都由可靠的链上证明支持。

> **预览版发布。** v1.0.0 是一个测试网预览产品。引擎架构支持测试网和主网，但所有信任证明都仅在测试网中进行验证。主网是一个谨慎且经过深思熟虑的路径，而不是默认选项。

## 两种使用方法

### 桌面应用程序（推荐给创作者）

从 [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/latest) 下载 Windows 安装程序，并按照 [新手指南](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/) 进行操作。

**工作室模式** 将引导您完成一个由 6 个步骤组成的流程：

1. 描述您的发布内容（标题、艺术家、版本数量、文件）
2. 设置收藏者权益（附加内容、母带文件、高清艺术品）
3. 审查条款和安全信息
4. 发布到 XRPL 测试网
5. 测试收藏者访问权限
6. 生成恢复包

需要 [Node.js 22+](https://nodejs.org/)（未来版本将包含捆绑的运行时环境）。

### 命令行界面 (CLI)（适用于开发人员和集成商）

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # 265 tests, zero network calls
```

包含 15 个命令，涵盖完整的发布生命周期：

| 命令 | 用途 |
|---------|---------|
| `init-wallets` | 生成并配置发行方 + 运营商钱包对 |
| `configure-minter` | 将运营商设置为发行方账户的授权铸币方 |
| `create-release` | 从清单输入文件创建发布内容 |
| `validate` | 验证发布清单是否符合 schema |
| `resolve` | 检查清单指针的结构是否有效 |
| `mint-release` | 铸造 NFT 版本并发出发行凭证 |
| `verify-release` | 将清单 + 凭证与链状态进行比对 |
| `create-access-policy` | 从清单 + 凭证生成访问策略 |
| `grant-access` | 评估访问请求并发出授权凭证 |
| `recover-release` | 从文件和链状态重建发布内容 |
| `create-governance-policy` | 为发布资金池创建治理策略 |
| `propose-payout` | 针对治理策略创建支付提案 |
| `decide-payout` | 收集批准并发出决策凭证 |
| `execute-payout` | 记录支付执行并验证哈希链 |
| `verify-payout` | 验证所有 4 个治理文件及其关系 |

## 它证明了什么

XRPL Creator Capsule 将 XRP 账本视为所有权、支付、访问和生存能力的可靠控制平面。它不是一个市场——它是一种基础设施，可以使市场成为可选的。

| 阶段 | 它证明了什么 | 测试 |
|-------|---------------|-------|
| A — 创作者意图 | 清单身份是确定性的且防篡改的 | 27 |
| B — 铸造真实性 | XRPL 上的 NFT 与清单完全匹配（测试网的实时证明） | 36 |
| C — 访问真实性 | 所有权解锁了真实的链下访问权限 | 34 |
| D — 治理真实性 | 收益通过可审计的批准链进行管理 | 67 |
| E — 可靠性 | 发布内容在前端失效时仍然存在（已通过前端失效测试） | 28 |
| 桌面运行时信任 | 模式切换、重启、中断、超时、时间 | 73 |
| **Total** | | **265** |

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

该系统具有完整的网络感知能力——测试网和主网是不同的、可配置的目标。

| | 测试网 | 主网 |
|-|---------|---------|
| **Default** | 是 | No |
| **Trust-proven** | 是（实时证明，265 个测试） | 否 |
| **CLI guard** | 不需要 | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | 工作室模式的默认设置 | v1.0.0 版本中未公开 |

**请将本次发布视为测试网的预览版本。** 架构并非仅适用于测试网，但信任证明已在测试网上得到验证。 要实现主网的可用性，需要进行实时的 Xaman 签名操作，以及有意识的推广——而不是简单的配置切换。

## 信任模型

**本系统涉及的内容：**
- 本地 JSON 文件（清单、收据、策略、包）
- 通过 WebSocket (`wss://`) 与 XRPL 进行交互，用于铸造、验证和持有人检查
- 钱包助记词存储在本地的 `wallets.json` 文件中（已忽略 Git 跟踪，绝不提交）

**本系统不涉及的内容：**
- 除了 XRPL 节点之外，没有其他外部 API
- 没有数据库、云存储或第三方服务
- 没有用户分析、跟踪或遥测

**安全边界：**
- 要写入主网数据，需要明确指定 `--network mainnet --allow-mainnet-write` 参数
- 钱包凭证仅保存在本地，仅传输到 XRPL 用于交易签名
- 所有哈希值均使用 SHA-256 算法，并采用确定性的 `sortKeysDeep()` 规范化方法
- 每个文件都可以独立地与账本进行验证
- `xrpl` 固定的版本为 4.2.5 (在 npm 供应链安全建议发布后)

## 已知限制

- **需要 Node.js** 才能运行桌面应用程序（已打包的运行时环境即将推出）
- **Xaman QR 码签名尚未启用** — 需要钱包凭证文件（基于助记词，仅适用于测试网）
- **IPFS 上传功能待定** — 文件指针使用本地路径，真正的基于内容寻址的存储即将推出
- **仅支持 Windows** — 计划在未来的 RC 版本中推出 macOS 安装程序

## 报告问题

点击桌面标题栏中的 **报告** 按钮，可以导出支持包，然后打开一个 [GitHub issue](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose)。

## 许可证

MIT

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
