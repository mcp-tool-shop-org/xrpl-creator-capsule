<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/Landing_Page-live-brightgreen" alt="Landing Page" /></a>
</p>

XRP Ledger 上での、クリエイターが所有権を持つリリースシステム。作品を公開し、直接販売し、コレクター向けの特典を付与し、収益を管理します。これらはすべて、フロントエンドが停止しても存続する、信頼性の高いオンチェーンの情報によって支えられています。

## 機能

XRPL Creator Capsule は、XRP Ledger を、クリエイティブな作品の所有権、支払い、アクセス、および可用性を管理するための、堅牢な基盤として活用します。これはマーケットプレイスではなく、マーケットプレイスをオプションにするためのインフラストラクチャです。

クリエイターカプセルは、以下の要素を統合します。

- **クリエイターの意図 (Creator Intent)**：決定論的なID（SHA-256 マニフェストID）を持つ、署名されたリリースマニフェスト。
- **発行の真実 (Mint Truth)**：XRP Ledger 上で発行された NFT エディションと、改ざん防止機能を持つ発行レシート。
- **アクセスの真実 (Access Truth)**：オンチェーンのホルダーチェックによって検証される、所有権に基づく特典。
- **耐久性の真実 (Durability Truth)**：元のアプリケーションがなくても、完全なリリースを再構築できるリカバリーバンドル。
- **ガバナンスの真実 (Governance Truth)**：監査可能な承認チェーン（ポリシー → 提案 → 決定 → 実行）を通じて管理される収益。

すべてのデータはハッシュで識別され、相互参照されます。すべての情報は、Ledger に対して検証可能です。

## アーキテクチャ

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

モノレポで、5つの npm ワークスペースを使用。TypeScript、Vitest、Node 22 以降。

## クイックスタート

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
npm run build
bash verify.sh
```

## CLI コマンド

| コマンド | 目的 |
|---------|---------|
| `init-wallets` | 発行者とオペレーターのウォレットペアを生成し、資金を投入する。 |
| `configure-minter` | オペレーターを発行者アカウントで承認されたミント担当者として設定する。 |
| `create-release` | マニフェスト入力ファイルからリリースを作成する。 |
| `validate` | リリースマニフェストをスキーマに対して検証する。 |
| `resolve` | マニフェストのポインタが構造的に有効であることを確認する。 |
| `mint-release` | NFT エディションを発行し、発行レシートを送信する。 |
| `verify-release` | マニフェストとレシートをチェーンの状態と照合する。 |
| `create-access-policy` | マニフェストとレシートからアクセスポリシーを生成する。 |
| `grant-access` | アクセスリクエストを評価し、承認レシートを送信する。 |
| `recover-release` | アーティファクトとチェーンの状態からリリースを再構築する。 |
| `create-governance-policy` | リリース用のガバナンスポリシーを作成する。 |
| `propose-payout` | ガバナンスポリシーに対する支払い提案を作成する。 |
| `decide-payout` | 承認を集め、決定レシートを送信する。 |
| `execute-payout` | 支払い実行を記録し、ハッシュチェーンを検証する。 |
| `verify-payout` | すべてのガバナンスアーティファクトとその関係を検証する。 |

## 検証済みフェーズ

| フェーズ | 検証内容 | テスト |
|-------|---------------|-------|
| A — クリエイターの意図 | マニフェストのIDは決定論的で、改ざん防止機能がある。 | 27 |
| B — 発行の真実 | XRP Ledger 上の NFT は、マニフェストと完全に一致する（ライブテストネット）。 | 36 |
| C — アクセスの真実 | 所有権が、実際のオフチェーンアクセスを許可する。 | 34 |
| E — 耐久性の真実 | リリースは、フロントエンドが停止しても存続する（フロントエンド停止テストをクリア）。 | 28 |
| D — ガバナンスの真実 | 収益は、監査可能な承認チェーンを通じて管理される。 | 67 |
| **Total** | | **240** |

## 信頼モデル

**このシステムが扱うもの:**
- ローカルの JSON ファイル（マニフェスト、レシート、ポリシー、バンドル）
- XRP Ledger (WebSocket: `wss://`) を使用して、発行、検証、ホルダーチェックを行う。
- ローカルの `wallets.json` に保存されたウォレットのシードフレーズ（Git で無視され、コミットされない）。

**このシステムが扱わないもの:**
- XRP Ledger ノード以外の外部 API は使用しない。
- データベース、クラウドストレージ、またはサードパーティサービスは使用しない。
- ユーザー分析、トラッキング、またはテレメトリは収集しない。

**セキュリティ境界:**
- メインネットへの書き込みには、明示的な `--network mainnet --allow-mainnet-write` が必要。
- ウォレットの認証情報はローカルに保存され、トランザクションの署名のために XRP Ledger にのみ送信される。
- すべてのハッシュは、決定論的な `sortKeysDeep()` による正規化を行った SHA-256 を使用する。
- すべてのデータは、個別に Ledger に対して検証可能。
- `xrpl` は、バージョン 4.2.5 に固定されている（npm サプライチェーンに関する注意喚起の後）。
- テレメトリは収集または送信されない。

## 検証

```bash
bash verify.sh
```

TypeScriptの型チェックと、240個のテストスイートを実行します。

## ステータス

**フェーズ1：MVP（最小限の実行可能な製品）は完了しました。** XRPLをクリエイターのリリースに対する堅牢な制御基盤として活用するという主要なコンセプトが、5つのフェーズすべてで、実際のテストネットの成果物を通じて検証されました。

**保留中:** Xamanの動作確認（アダプターのアーキテクチャは実装済みで、外部認証情報を待機中）。これは最終的な確認であり、新しいビルドフェーズではありません。

## ライセンス

MIT

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>によってビルドされました。
