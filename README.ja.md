<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

XRP Ledger上のクリエイターが所有するリリースシステム。作品を公開し、直接販売し、コレクターの特典を引き出し、収益を管理 — これらすべては、永続的なオンチェーン証明によって支えられています。

> **テストネット優先リリース。** このリリースバージョンはテストネット製品です。エンジンアーキテクチャは、テストネットとメインネットの両方をサポートしますが、すべての信頼性に関する検証はテストネットでのみ行われています。メインネットへの移行は慎重に進められ、意図的なプロモーションとなります — デフォルトではありません。

## 使用方法

### デスクトップアプリ（クリエイター向けに推奨）

[GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/latest)からWindowsインストーラーをダウンロードし、[初心者ガイド](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/)に従ってください。

**スタジオモード**では、6つのステップで構成されるガイダンスに沿って操作を進めます。

1. リリースを記述します（タイトル、アーティスト、エディション数、ファイル）。
2. コレクターの特典を設定します（ボーナストラック、ステム、高解像度の画像）。
3. 利用規約と安全性を確認します。
4. XRPLテストネットに公開します。
5. コレクターがアクセスできることをテストします。
6. リカバリーバンドルを生成します。

[Node.js 22+](https://nodejs.org/)が必要です（将来のリリースでバンドルされたランタイムを提供予定）。

### CLI（開発者およびインテグレーター向け）

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # full test suite (700+ tests), zero network calls
```

完全なリリースライフサイクルをカバーする15個のコマンド。

| コマンド | 目的 |
|---------|---------|
| `init-wallets` | 発行者とオペレーターのウォレットペアを生成し、資金を投入します。 |
| `configure-minter` | オペレーターを発行者のアカウントで承認されたミント担当者に設定します。 |
| `create-release` | マニフェスト入力ファイルからリリースを作成します。 |
| `validate` | リリースマニフェストをスキーマに対して検証します。 |
| `resolve` | マニフェストのポインタが構造的に有効であることを確認します。 |
| `mint-release` | NFTエディションをミントし、発行レシートを発行します。 |
| `verify-release` | マニフェストとレシートをチェーンの状態に対して照合します。 |
| `create-access-policy` | マニフェストとレシートからアクセスポリシーを生成します。 |
| `grant-access` | アクセスの要求を評価し、承認レシートを発行します。 |
| `recover-release` | アーティファクトとチェーンの状態からリリースを再構築します。 |
| `create-governance-policy` | リリーストレジャリーのガバナンスポリシーを作成します。 |
| `propose-payout` | ガバナンスポリシーに基づいて支払い提案を作成します。 |
| `decide-payout` | 承認を集め、決定レシートを発行します。 |
| `execute-payout` | 支払いの実行を記録し、ハッシュチェーンを検証します。 |
| `verify-payout` | 4つのガバナンスアーティファクトとその関係のすべてを検証します。 |

## 証明するもの

XRPL Creator Capsuleは、XRP Ledgerを所有権、支払い、アクセス、および持続可能性のための永続的な制御プレーンとして扱います。これはマーケットプレイスではなく、マーケットプレイスがオプションとなるインフラストラクチャです。

| フェーズ | 証明するもの |
|-------|---------------|
| A — クリエイターの意図 | マニフェストIDは決定論的であり、改ざんが可能です。 |
| B — ミントの真実 | XRPL上のNFTは、マニフェストと完全に一致します（ライブテストネット証明）。 |
| C — アクセスの真実 | 所有権により、実際のオフチェーンアクセスが可能になります。 |
| D — ガバナンスの真実 | 収益は監査可能な承認チェーンによって管理されます。 |
| E — 持続可能性の真実 | リリースはフロントエンドの停止後も存続します（耐久性テストに合格）。 |
| デスクトップランタイムの信頼性 | モード切り替え、再起動、中断、タイムアウト、タイミング。 |

このスイートは現在、エンジンパッケージ、CLI、およびデスクトップアプリ全体で**700以上のテスト**を実行します — `bash verify.sh` を実行すると、ライブカウントが表示され、ネットワークへのアクセスはありません。（正確な数値はスイートの拡張に伴い変動します。コマンドが真実の情報源です。）

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

5つのエンジンパッケージとデスクトップアプリを備えたモノリポ。TypeScript、Vitest、Tauri v2、Node 22+。

## ネットワークの状況

このシステムは完全なネットワーク認識機能を備えており、テストネットとメインネットは明確に区別され、設定可能なターゲットです。

| | テストネット | メインネット |
|-|---------|---------|
| **Default** | はい | No |
| **Trust-proven** | はい（ライブ証明、完全なスイート） | まだありません |
| **CLI guard** | 不要 | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | スタジオモードがデフォルト | デスクトップアプリでは公開されていません。 |

**このリリースをテストネットプレビューとして扱ってください。** アーキテクチャはテストネット専用ではありませんが、信頼性の証明はテストネットで検証されています。メインネットへの移行には、ライブのXaman署名と意図的なプロモーションが必要です — フラグの切り替えだけでは不十分です。

## 信頼モデル

**このシステムが扱うもの：**
- ローカルJSONファイル（マニフェスト、レシート、ポリシー、バンドル）
- XRPL（ミント、検証、およびホルダーチェック用）へのWebSocket接続（`wss://`）
- ウォレットのシードフレーズはローカルに保存されます（gitignoreされ、コミットされることはありません）（`wallets.json`）。

**このシステムが扱わないもの：**
- XRPLノード以外の外部API
- データベース、クラウドストレージ、またはサードパーティサービス
- ユーザー分析、トラッキング、またはテレメトリ

**セキュリティ境界：**
- メインネットへの書き込みには明示的な `--network mainnet --allow-mainnet-write` が必要です。
- ウォレットの認証情報はローカルに保持され、トランザクション署名のためにXRPLにのみ送信されます。
- すべてのハッシュは、決定論的 `sortKeysDeep()` カノニカル化されたSHA-256を使用します。
- すべてのアーティファクトは、レジャーに対して独立して検証できます。
- `xrpl` はバージョン4.2.5に固定されています（npmサプライチェーンに関する勧告後）。

## 既知の制限事項

- デスクトップアプリには**Node.jsが必要です**（バンドルされたランタイムは将来提供予定）。
- **Xaman QR署名はまだライブではありません** — ウォレット認証情報ファイルが必要です（シードベース、テストネットのみ）。
- **IPFSへのアップロードは保留中です** — ファイルポインタはローカルパスを使用し、実際のコンテンツアドレス指定ストレージは今後提供されます。
- **Windowsのみ対応** — 将来のRCでmacOSインストーラーを予定しています。

## 問題の報告

デスクトップアプリのタイトルバーにある「レポート」をクリックして、サポートバンドルをエクスポートし、[GitHub issue](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose)を開きます。

## ライセンス

MIT

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> によって作成されました。
