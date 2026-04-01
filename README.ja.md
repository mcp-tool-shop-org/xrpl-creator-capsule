<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

XRP Ledger 上での、クリエイターが所有するコンテンツの公開システム。作品を公開し、直接販売したり、コレクター向けの特典を提供したり、収益を管理したりできます。これらはすべて、改ざんが困難なオンチェーンの証明によって支えられています。

> **プレビュー版リリース。** v1.0.0 は、テストネット用のプレビュー版製品です。このシステムのアーキテクチャは、テストネットとメインネットの両方に対応していますが、すべての信頼性の検証はテストネットでのみ行われています。メインネットは、慎重に検討された運用を行うためのものであり、デフォルトの設定ではありません。

## 利用方法が2つあります

### デスクトップアプリケーション（クリエイター向け推奨）

[GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/latest) からWindowsインストーラーをダウンロードし、[初心者向けガイド](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/)に従ってください。

**スタジオモード**では、6つのステップでガイドされたワークフローを提供します。

1. 公開するコンテンツについて説明します（タイトル、アーティスト名、エディション数、ファイル）。
2. コレクター向けの特典を設定します（ボーナストラック、ステム、高解像度画像など）。
3. 利用規約と安全に関する情報を確認します。
4. XRPLテストネットに公開します。
5. コレクターが特典にアクセスできるかテストします。
6. リカバリーバンドルを生成します。

[Node.js 22+](https://nodejs.org/) が必要です（将来のリリースで、バンドルされたランタイムが提供される予定です）。

### コマンドラインインターフェース（開発者および統合担当者向け）

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # 265 tests, zero network calls
```

公開ライフサイクル全体をカバーする15のコマンドがあります。

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

## 検証内容

XRPL Creator Capsule は、XRP Ledger を、クリエイティブな作品の所有権、支払い、アクセス、および可用性を管理するための、堅牢な基盤として活用します。これはマーケットプレイスではなく、マーケットプレイスをオプションにするためのインフラストラクチャです。

| フェーズ | 検証内容 | テスト |
|-------|---------------|-------|
| A — クリエイターの意図 | マニフェストのIDは決定論的で、改ざん防止機能がある。 | 27 |
| B — 発行の真実 | XRP Ledger 上の NFT は、マニフェストと完全に一致する（ライブテストネット）。 | 36 |
| C — アクセスの真実 | 所有権が、実際のオフチェーンアクセスを許可する。 | 34 |
| D — ガバナンスの真実 | 収益は、監査可能な承認チェーンを通じて管理される。 | 67 |
| E — 耐久性の真実 | リリースは、フロントエンドが停止しても存続する（フロントエンド停止テストをクリア）。 | 28 |
| デスクトップランタイムの信頼性 | モードの切り替え、再起動、中断、タイムアウト、タイミング | 73 |
| **Total** | | **265** |

## アーキテクチャ

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

5つのエンジンパッケージとデスクトップアプリケーションを含むモノレポ。TypeScript、Vitest、Tauri v2、Node 22+を使用しています。

## ネットワークの状態

このシステムは、ネットワークの状態を完全に認識しています。テストネットとメインネットは、それぞれ異なる、設定可能な環境です。

| | テストネット | メインネット |
|-|---------|---------|
| **Default** | はい | No |
| **Trust-proven** | はい（ライブ証明、265件のテストあり） | まだいいえ |
| **CLI guard** | 不要 | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | スタジオモードのデフォルト設定 | v1.0.0では公開されていません |

**このリリースは、テストネットのプレビュー版としてお考えください。** アーキテクチャはテストネット専用ではありませんが、信頼性の検証はテストネットで行われています。メインネットでの利用には、Xamanによる署名と、意図的なプロモーションが必要です。

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

## 既知の制限事項

- デスクトップアプリケーションには、[Node.js](https://nodejs.org/) が必要です（バンドルされたランタイムは、今後のリリースで提供予定）。
- **Xaman QRによる署名はまだ利用できません**。ウォレットの認証情報ファイルが必要です（シードベース、テストネットのみ）。
- **IPFSへのアップロードはまだ未対応**。ファイルポインタはローカルパスを使用しており、コンテンツアドレス指定によるストレージは今後の実装予定です。
- **Windowsのみ**。macOSのインストーラーは、今後のRCで提供予定です。

## 問題の報告

デスクトップのタイトルバーにある「報告」をクリックして、サポートバンドルをエクスポートし、[GitHub issue](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose) を開いてください。

## ライセンス

MIT

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>によってビルドされました。
