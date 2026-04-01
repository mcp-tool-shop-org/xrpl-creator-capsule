<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Système de publication de contenu détenu par les créateurs sur la blockchain XRP Ledger. Permet de créer des œuvres, de les vendre directement, d'offrir des avantages aux collectionneurs et de gérer les revenus, le tout grâce à une preuve immuable enregistrée sur la blockchain.

> **Version préliminaire.** v1.0.0 est une version de test pour le réseau de test. L'architecture du système prend en charge à la fois le réseau de test et le réseau principal, mais toutes les preuves de confiance ont été validées uniquement sur le réseau de test. Le réseau principal est un chemin sécurisé et réfléchi, et n'est pas la configuration par défaut.

## Deux façons de l'utiliser :

### Application de bureau (recommandée pour les créateurs)

Téléchargez le programme d'installation pour Windows depuis [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/latest) et suivez le [Guide pour débutants](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/).

Le **mode Studio** vous guide à travers un processus en 6 étapes :

1. Décrivez votre publication (titre, artiste, nombre d'exemplaires, fichiers)
2. Définissez les avantages pour les collectionneurs (morceaux bonus, pistes séparées, illustrations haute résolution)
3. Consultez les conditions générales et les informations de sécurité
4. Publiez sur le réseau de test XRPL
5. Testez l'accès des collectionneurs
6. Générez un ensemble de récupération

Nécessite [Node.js 22+](https://nodejs.org/) (un environnement d'exécution intégré sera disponible dans une version ultérieure).

### Interface en ligne de commande (CLI) (pour les développeurs et les intégrateurs)

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # 265 tests, zero network calls
```

15 commandes couvrant l'ensemble du cycle de vie de la publication :

| Commande | Objectif |
|---------|---------|
| `init-wallets` | Générer et financer une paire de portefeuilles émetteur + opérateur. |
| `configure-minter` | Définir l'opérateur comme émetteur autorisé sur le compte de l'émetteur. |
| `create-release` | Créer une publication à partir d'un fichier manifeste. |
| `validate` | Valider un manifeste de publication par rapport au schéma. |
| `resolve` | Vérifier que les pointeurs du manifeste sont structurellement valides. |
| `mint-release` | Créer des éditions NFT et générer un reçu de création. |
| `verify-release` | Réconcilier le manifeste et le reçu avec l'état de la chaîne. |
| `create-access-policy` | Générer une politique d'accès à partir du manifeste et du reçu. |
| `grant-access` | Évaluer une demande d'accès et générer un reçu d'autorisation. |
| `recover-release` | Reconstruire une publication à partir d'artefacts et de l'état de la chaîne. |
| `create-governance-policy` | Créer une politique de gouvernance pour un coffre-fort de publication. |
| `propose-payout` | Créer une proposition de paiement selon une politique de gouvernance. |
| `decide-payout` | Collecter les approbations et générer un reçu de décision. |
| `execute-payout` | Enregistrer l'exécution du paiement et vérifier la chaîne de hachage. |
| `verify-payout` | Vérifier les 4 artefacts de gouvernance et leurs relations. |

## Ce que cela prouve

XRPL Creator Capsule considère le registre XRP comme une couche de contrôle durable pour la propriété, les paiements, l'accès et la pérennité des œuvres créatives. Ce n'est pas une place de marché ; c'est l'infrastructure qui rend les places de marché facultatives.

| Phase | Ce que cela prouve | Tests |
|-------|---------------|-------|
| A — Intention du créateur | L'identité du manifeste est déterministe et inviolable. | 27 |
| B — Vérité de la création | Les NFT sur XRPL correspondent exactement au manifeste (test en direct sur le réseau de test). | 36 |
| C — Vérité de l'accès | La propriété débloque un accès réel hors chaîne. | 34 |
| D — Vérité de la gouvernance | Les revenus sont gérés par une chaîne d'approbation vérifiable. | 67 |
| E — Vérité de la durabilité | La publication survit à la disparition de l'interface utilisateur (test de "mort" réussi). | 28 |
| Confiance du runtime de bureau | Changement de mode, redémarrage, interruption, délai d'attente, synchronisation | 73 |
| **Total** | | **265** |

## Architecture

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

Monorepo avec 5 packages de base + application de bureau. TypeScript, Vitest, Tauri v2, Node 22+.

## Configuration du réseau

Le système est pleinement conscient du réseau : le réseau de test et le réseau principal sont des cibles distinctes et configurables.

| | Réseau de test | Réseau principal |
|-|---------|---------|
| **Default** | Oui | No |
| **Trust-proven** | Oui (preuves actives, 265 tests) | Non encore |
| **CLI guard** | Aucun requis | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | Configuration par défaut du mode Studio | Non disponible dans v1.0.0 |

**Considérez cette version comme une version préliminaire pour le réseau de test.** L'architecture n'est pas limitée au réseau de test, mais la preuve de confiance a été validée sur le réseau de test. La compatibilité avec le réseau principal nécessite une signature Xaman active et une promotion délibérée, et non un simple paramètre.

## Modèle de confiance

**Ce que ce système touche :**
- Fichiers JSON locaux (manifestes, reçus, politiques, paquets)
- XRPL via WebSocket (`wss://`) pour la création, la vérification et les contrôles de détenteurs.
- Phrases de portefeuille stockées dans `wallets.json` (ignorées par Git, jamais commitées).

**Ce que ce système NE touche PAS :**
- Aucune API externe autre que les nœuds XRPL.
- Aucune base de données, stockage cloud ou service tiers.
- Aucune analyse, suivi ou télémétrie utilisateur.

**Frontières de sécurité :**
- Les écritures sur le réseau principal nécessitent une option `--network mainnet --allow-mainnet-write` explicite.
- Les informations d'identification du portefeuille restent locales et ne sont transmises qu'à XRPL pour la signature des transactions.
- Tous les hachages utilisent SHA-256 sur une canonisation déterministe `sortKeysDeep()`.
- Chaque artefact peut être vérifié indépendamment par rapport au registre.
- `xrpl` est verrouillé à la version exacte 4.2.5 (suite à un avis de chaîne d'approvisionnement npm).
- Aucune télémétrie n'est collectée ou envoyée.

## Limitations connues

- **Node.js est requis** pour l'application de bureau (un environnement d'exécution intégré est prévu).
- **La signature QR Xaman n'est pas encore active** — un fichier d'informations d'identification du portefeuille est requis (basé sur une clé secrète, uniquement pour le réseau de test).
- **Le téléchargement IPFS est en attente** — les pointeurs de fichiers utilisent des chemins locaux, le stockage réel basé sur le contenu arrivera plus tard.
- **Uniquement pour Windows** — un programme d'installation pour macOS est prévu pour une version ultérieure de RC.

## Signaler les problèmes

Cliquez sur **Signaler** dans la barre de titre de l'application de bureau pour exporter un ensemble de données de diagnostic, puis ouvrez un [billet GitHub](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

## Licence

MIT

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
