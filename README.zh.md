<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/Landing_Page-live-brightgreen" alt="Landing Page" /></a>
</p>

基于XRP账本的创作者自主发布系统。发行作品，直接销售，解锁收藏者权益，管理收益——所有这些都由持久的链上数据支持，即使前端失效也能保证数据的完整性。

## 功能

XRPL Creator Capsule 将 XRP 账本视为一个持久的控制平面，用于管理创作作品的所有权、支付、访问和持久性。它不是一个市场，而是一个使市场成为可选的基础设施。

一个创作者胶囊包含以下内容：

- **创作者意图 (Creator Intent)**：带有确定性身份的签名发布清单（SHA-256 清单 ID）。
- **发行凭证 (Mint Truth)**：在 XRPL 上铸造的 NFT 版本，带有防篡改的发行凭证。
- **访问凭证 (Access Truth)**：通过链上持有人验证来解锁的权益。
- **持久性 (Durability Truth)**：用于在没有原始应用程序的情况下重建完整发布的恢复包。
- **治理 (Governance Truth)**：通过可审计的审批链管理收益（策略 → 提案 → 决策 → 执行）。

每个文件都带有哈希标记，并进行交叉引用。每个声明都可以与账本进行验证。

## 架构

```
packages/
  core/       Canonical contracts, schemas, validation, hashing
  xrpl/       XRPL client (connect, mint, verify, holder checks)
  storage/    Content store + delivery provider interfaces
  xaman/      Wallet-mediated signing via Xaman
  cli/        15 CLI commands for the full release lifecycle
artifacts/    Live Testnet proof artifacts
fixtures/     Sanitized fixtures for testing
```

单仓库，包含 5 个 npm 工作区。TypeScript, Vitest, Node 22+。

## 快速开始

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
npm run build
bash verify.sh
```

## 命令行

| 命令 | 用途 |
|---------|---------|
| `init-wallets` | 生成并配置发行者 + 操作员钱包对 |
| `configure-minter` | 将操作员设置为发行账户的授权铸造者 |
| `create-release` | 从清单输入文件创建发布 |
| `validate` | 验证发布清单是否符合 schema |
| `resolve` | 检查清单指针是否结构上有效 |
| `mint-release` | 铸造 NFT 版本并生成发行凭证 |
| `verify-release` | 将清单 + 凭证与链状态进行比对 |
| `create-access-policy` | 从清单 + 凭证生成访问策略 |
| `grant-access` | 评估访问请求并生成授权凭证 |
| `recover-release` | 从文件 + 链状态重建发布 |
| `create-governance-policy` | 为发布资金池创建治理策略 |
| `propose-payout` | 针对治理策略创建支付提案 |
| `decide-payout` | 收集审批并生成决策凭证 |
| `execute-payout` | 记录支付执行并验证哈希链 |
| `verify-payout` | 验证所有 4 个治理文件及其关系 |

## 已验证阶段

| 阶段 | 验证内容 | 测试 |
|-------|---------------|-------|
| A — 创作者意图 | 清单身份是确定性的，并且具有防篡改性。 | 27 |
| B — 发行凭证 | XRPL 上的 NFT 与清单完全匹配（测试网）。 | 36 |
| C — 访问凭证 | 所有权解锁了真实的链下访问权限。 | 34 |
| E — 持久性 | 发布可以存活前端失效（已通过前端失效测试）。 | 28 |
| D — 治理 | 收益通过可审计的审批链进行管理。 | 67 |
| **Total** | | **240** |

## 信任模型

**该系统涉及的内容：**
- 本地 JSON 文件（清单、凭证、策略、包）
- 通过 WebSocket (`wss://`) 连接 XRPL，用于铸造、验证和持有人检查。
- 钱包助记词存储在本地 `wallets.json` 文件中（已忽略 Git 提交，绝不提交）。

**该系统不涉及的内容：**
- 除了 XRPL 节点之外，没有其他外部 API。
- 没有数据库、云存储或第三方服务。
- 没有用户分析、跟踪或遥测。

**安全边界：**
- 主网写入需要明确的 `--network mainnet --allow-mainnet-write` 选项。
- 钱包凭证保持在本地，仅传输到 XRPL 进行交易签名。
- 所有哈希都使用 SHA-256，并采用确定性的 `sortKeysDeep()` 规范化方法。
- 每个文件都可以独立地与账本进行验证。
- `xrpl` 固定在精确版本 4.2.5（在 npm 供应链安全建议发布后）。
- 不会收集或发送任何遥测数据。

## 验证

```bash
bash verify.sh
```

运行 TypeScript 类型检查，以及完整的 240 个测试用例。

## 状态

**第一阶段 MVP：已完成。** 核心产品理念——将 XRPL 作为创作者发布的可靠控制层——已在所有五个阶段通过实际的 Testnet 成果得到验证。

**待定：** Xaman 实时验证（适配器架构已发布，等待外部凭证）。 这是一次收尾工作，不是一个新的构建阶段。

## 许可证

MIT

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
