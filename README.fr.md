<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Système de publication contrôlé par les créateurs sur le XRP Ledger. Publiez vos œuvres, vendez directement, offrez des avantages aux collectionneurs, gérez les revenus — tout est étayé par une preuve durable enregistrée en chaîne.

> **Première version pour Testnet.** Cette version est un produit destiné au Testnet. L’architecture du moteur prend en charge à la fois le Testnet et le Mainnet, mais toutes les preuves de confiance ont été validées uniquement sur le Testnet. Le passage au Mainnet se fait de manière contrôlée et délibérée, ce n’est pas l’option par défaut.

## Deux façons de l’utiliser

### Application de bureau (recommandée pour les créateurs)

Téléchargez le programme d’installation Windows à partir de [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/latest) et suivez le [Guide du débutant](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/).

Le **mode Studio** vous guide à travers un processus en 6 étapes :

1. Décrivez votre publication (titre, artiste, nombre d’exemplaires, fichiers)
2. Définissez les avantages pour les collectionneurs (morceaux bonus, pistes instrumentales, œuvres haute résolution)
3. Vérifiez les conditions et la sécurité
4. Publiez sur le XRPL Testnet
5. Testez l’accès des collectionneurs
6. Générez un ensemble de récupération

Nécessite [Node.js 22+](https://nodejs.org/) (environnement d’exécution intégré dans une version ultérieure).

### CLI (pour les développeurs et intégrateurs)

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # full test suite (700+ tests), zero network calls
```

15 commandes couvrant l’ensemble du cycle de vie de la publication :

| Commande | Objectif |
|---------|---------|
| `init-wallets` | Générer et financer la paire portefeuille émetteur + opérateur |
| `configure-minter` | Définir l’opérateur comme frappeur autorisé sur le compte de l’émetteur |
| `create-release` | Créer une publication à partir d’un fichier manifeste |
| `validate` | Valider un manifeste de publication par rapport au schéma |
| `resolve` | Vérifier que les pointeurs du manifeste sont structurellement valides |
| `mint-release` | Frapper des NFT et émettre un reçu d’émission |
| `verify-release` | Réconcilier le manifeste + le reçu avec l’état de la chaîne |
| `create-access-policy` | Générer une politique d’accès à partir du manifeste + du reçu |
| `grant-access` | Évaluer la demande d’accès et émettre un reçu d’autorisation |
| `recover-release` | Reconstruire une publication à partir des artefacts + de l’état de la chaîne |
| `create-governance-policy` | Créer une politique de gouvernance pour la trésorerie d’une publication |
| `propose-payout` | Créer une proposition de paiement par rapport à une politique de gouvernance |
| `decide-payout` | Collecter les approbations et émettre un reçu de décision |
| `execute-payout` | Enregistrer l’exécution du paiement et vérifier la chaîne de hachage |
| `verify-payout` | Vérifier les 4 artefacts de gouvernance et leurs relations |

## Ce que cela prouve

XRPL Creator Capsule considère le XRP Ledger comme un plan de contrôle durable pour la propriété, le paiement, l’accès et la pérennité. Ce n’est pas une place de marché, c’est l’infrastructure qui rend les places de marché facultatives.

| Phase | Ce que cela prouve |
|-------|---------------|
| A — Intention du créateur | L’identité du manifeste est déterministe et inviolable |
| B — Vérité de la frappe | Les NFT sur XRPL correspondent exactement au manifeste (preuve en direct sur le Testnet) |
| C — Vérité de l’accès | La propriété débloque un accès réel hors chaîne |
| D — Vérité de la gouvernance | Les revenus sont gérés par le biais d’une chaîne d’approbation vérifiable |
| E — Vérité de la durabilité | La publication survit à la disparition du frontend (test de résistance réussi) |
| Confiance dans l’environnement d’exécution de bureau | Changement de mode, redémarrage, interruption, délai d’attente, synchronisation |

La suite exécute actuellement plus de **700 tests** sur les différents packages du moteur, la CLI et l’application de bureau. `bash verify.sh` exécute tous ces tests et affiche le nombre en direct, sans effectuer d’appels réseau. (Les chiffres exacts varient à mesure que la suite s’agrandit ; la commande est la source de vérité.)

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

Monorepositoire avec 5 packages du moteur + application de bureau. TypeScript, Vitest, Tauri v2, Node 22+.

## Posture réseau

Le système dispose d’une connaissance complète du réseau : le Testnet et le Mainnet sont des cibles distinctes et configurables.

| | Testnet | Mainnet |
|-|---------|---------|
| **Default** | Oui | No |
| **Trust-proven** | Oui (preuves en direct, suite complète) | Pas encore |
| **CLI guard** | Aucun nécessaire | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | Mode Studio par défaut | Non exposé dans l’application de bureau |

**Considérez cette version comme un aperçu pour le Testnet.** L’architecture n’est pas limitée au Testnet, mais la preuve de confiance est prouvée sur le Testnet. La préparation du Mainnet nécessite une signature Xaman en direct et une promotion délibérée, ce n’est pas simplement un changement de paramètre.

## Modèle de confiance

**Ce que touche ce système :**
- Fichiers JSON locaux (manifestes, reçus, politiques, ensembles)
- XRPL via WebSocket (`wss://`) pour la frappe, la vérification et les contrôles des détenteurs
- Phrases secrètes du portefeuille stockées localement dans `wallets.json` (ignorées par Git, jamais validées)

**Ce que ce système ne touche PAS :**
- Aucune API externe autre que les nœuds XRPL
- Aucune base de données, aucun stockage cloud ou service tiers
- Aucune analyse d’utilisateur, aucun suivi ni aucune télémétrie

**Limites de sécurité :**
- Les écritures sur le Mainnet nécessitent une autorisation explicite `--network mainnet --allow-mainnet-write`
- Les informations d’identification du portefeuille restent locales — transmises uniquement à XRPL pour la signature des transactions
- Tous les hachages utilisent SHA-256 sur une canonisation déterministe `sortKeysDeep()`
- Chaque artefact est vérifiable indépendamment par rapport au registre
- `xrpl` fixé à la version exacte 4.2.5 (suite aux recommandations concernant la chaîne d’approvisionnement npm)

## Limitations connues

- **Node.js requis** pour l’application de bureau (environnement d’exécution intégré dans une version ultérieure)
- **La signature QR Xaman n’est pas encore active** — un fichier d’informations d’identification du portefeuille est requis (basé sur la phrase secrète, uniquement pour le testnet)
- **Le chargement IPFS en attente** — les pointeurs de fichiers utilisent des chemins locaux, un stockage réel basé sur le contenu sera disponible ultérieurement
- **Uniquement pour Windows** — un programme d’installation macOS est prévu pour une future version RC

## Signaler les problèmes

Cliquez sur **Signaler** dans la barre de titre de l’application de bureau pour exporter un ensemble de support, puis ouvrez un [ticket GitHub](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

## Licence

MIT

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
