<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/Landing_Page-live-brightgreen" alt="Landing Page" /></a>
</p>

Système de publication géré par les créateurs sur le registre XRP. Publiez des œuvres, vendez-les directement, débloquez des avantages pour les collectionneurs, gérez les revenus, le tout soutenu par une vérité immuable enregistrée qui survit à la disparition de l'interface utilisateur.

## Ce que cela fait

XRPL Creator Capsule considère le registre XRP comme une couche de contrôle durable pour la propriété, les paiements, l'accès et la pérennité des œuvres créatives. Ce n'est pas une place de marché ; c'est l'infrastructure qui rend les places de marché facultatives.

Une capsule de créateur regroupe :

- **Intention du créateur** : Un manifeste de publication signé avec une identité déterministe (ID de manifeste SHA-256).
- **Vérité de la création** : Éditions NFT créées sur XRPL avec des reçus de création inviolables.
- **Vérité de l'accès** : Avantages liés à la propriété, vérifiés par des contrôles de détenteurs enregistrés.
- **Vérité de la durabilité** : Paquets de récupération qui reconstruisent la publication complète sans l'application d'origine.
- **Vérité de la gouvernance** : Les revenus sont gérés par une chaîne d'approbation vérifiable (politique → proposition → décision → exécution).

Chaque artefact est horodaté et référencé. Chaque affirmation peut être vérifiée par rapport au registre.

## Architecture

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

Monorepo avec 5 espaces de travail npm. TypeScript, Vitest, Node 22+.

## Démarrage rapide

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
npm run build
bash verify.sh
```

## Commandes CLI

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

## Phases vérifiées

| Phase | Ce que cela prouve | Tests |
|-------|---------------|-------|
| A — Intention du créateur | L'identité du manifeste est déterministe et inviolable. | 27 |
| B — Vérité de la création | Les NFT sur XRPL correspondent exactement au manifeste (test en direct sur le réseau de test). | 36 |
| C — Vérité de l'accès | La propriété débloque un accès réel hors chaîne. | 34 |
| E — Vérité de la durabilité | La publication survit à la disparition de l'interface utilisateur (test de "mort" réussi). | 28 |
| D — Vérité de la gouvernance | Les revenus sont gérés par une chaîne d'approbation vérifiable. | 67 |
| **Total** | | **240** |

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

## Vérification

```bash
bash verify.sh
```

Effectue la vérification des types TypeScript et l'ensemble complet des 240 tests.

## Statut

**Phase 1 MVP : terminée.** La proposition de base du produit — XRPL en tant que couche de contrôle durable pour les publications des créateurs — est validée dans les cinq phases, avec des artefacts de testnet en direct.

**En attente :** Démonstration en direct de Xaman (l'architecture de l'adaptateur est disponible, en attente des informations d'identification externes). Il s'agit d'une étape de finalisation, et non d'une nouvelle phase de développement.

## Licence

MIT

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
