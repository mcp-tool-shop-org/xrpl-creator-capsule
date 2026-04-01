<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/Landing_Page-live-brightgreen" alt="Landing Page" /></a>
</p>

Sistema di pubblicazione gestito direttamente dagli autori sulla blockchain XRP Ledger. Permette di pubblicare opere, venderle direttamente, sbloccare vantaggi per i collezionisti e gestire le entrate, il tutto supportato da una solida base di dati immutabile che sopravvive anche alla disattivazione dell'interfaccia utente.

## Funzionalità

XRPL Creator Capsule utilizza la blockchain XRP Ledger come una piattaforma di controllo affidabile per la proprietà, i pagamenti, l'accesso e la persistenza delle opere creative. Non è un marketplace, ma l'infrastruttura che rende i marketplace opzionali.

Una "capsula" per creatori raggruppa:

- **Intento del Creatore:** Un file di pubblicazione firmato con un'identità deterministica (ID del manifest in formato SHA-256).
- **Veridicità della Creazione:** Edizioni NFT create sulla blockchain XRP Ledger con ricevute di emissione a prova di manomissione.
- **Veridicità dell'Accesso:** Vantaggi sbloccati in base alla proprietà, verificati tramite controlli on-chain.
- **Veridicità della Persistenza:** Pacchetti di ripristino che ricostruiscono l'intera pubblicazione anche senza l'applicazione originale.
- **Veridicità della Governance:** Gestione delle entrate tramite una catena di approvazioni verificabile (policy → proposta → decisione → esecuzione).

Ogni elemento è contrassegnato con un hash e collegato ad altri elementi. Ogni affermazione può essere verificata rispetto alla blockchain.

## Architettura

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

Monorepo con 5 spazi di lavoro npm. Utilizza TypeScript, Vitest e Node 22+.

## Guida rapida

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
npm run build
bash verify.sh
```

## Comandi CLI

| Comando | Scopo |
|---------|---------|
| `init-wallets` | Genera e configura una coppia di wallet per l'emittente e l'operatore. |
| `configure-minter` | Imposta l'operatore come emittente autorizzato sull'account dell'emittente. |
| `create-release` | Crea una pubblicazione a partire da un file di manifest. |
| `validate` | Valida un manifest rispetto allo schema. |
| `resolve` | Verifica che i riferimenti nel manifest siano strutturalmente validi. |
| `mint-release` | Crea edizioni NFT ed emette una ricevuta di emissione. |
| `verify-release` | Confronta il manifest e la ricevuta con lo stato della blockchain. |
| `create-access-policy` | Genera una policy di accesso a partire dal manifest e dalla ricevuta. |
| `grant-access` | Valuta una richiesta di accesso ed emette una ricevuta di concessione. |
| `recover-release` | Ricostruisce una pubblicazione a partire dagli elementi e dallo stato della blockchain. |
| `create-governance-policy` | Crea una policy di governance per il tesoro di una pubblicazione. |
| `propose-payout` | Crea una proposta di pagamento in base a una policy di governance. |
| `decide-payout` | Raccoglie le approvazioni ed emette una ricevuta di decisione. |
| `execute-payout` | Registra l'esecuzione del pagamento e verifica la catena di hash. |
| `verify-payout` | Verifica tutti e 4 gli elementi di governance e le loro relazioni. |

## Fasi di verifica

| Fase | Cosa viene verificato | Test |
|-------|---------------|-------|
| A — Intento del Creatore | L'identità del manifest è deterministica e a prova di manomissione. | 27 |
| B — Veridicità della Creazione | Gli NFT sulla blockchain XRP Ledger corrispondono esattamente al manifest (test in esecuzione sulla rete di prova). | 36 |
| C — Veridicità dell'Accesso | La proprietà sblocca un accesso reale al di fuori della piattaforma. | 34 |
| E — Veridicità della Persistenza | La pubblicazione sopravvive alla disattivazione dell'interfaccia utente (test di "morte" superato). | 28 |
| D — Veridicità della Governance | Gestione delle entrate tramite una catena di approvazioni verificabile. | 67 |
| **Total** | | **240** |

## Modello di fiducia

**Cosa questo sistema tocca:**
- File JSON locali (manifest, ricevute, policy, pacchetti)
- Blockchain XRP tramite WebSocket (`wss://`) per la creazione, la verifica e i controlli di proprietà.
- Frasi di accesso ai wallet memorizzate in `wallets.json` (ignorati da git, mai committati).

**Cosa questo sistema NON tocca:**
- Nessuna API esterna oltre ai nodi della blockchain XRP.
- Nessun database, storage cloud o servizi di terze parti.
- Nessuna analisi, tracciamento o telemetria degli utenti.

**Confini di sicurezza:**
- Le scritture sulla mainnet richiedono l'uso esplicito di `--network mainnet --allow-mainnet-write`.
- Le credenziali del wallet rimangono locali e vengono trasmesse solo alla blockchain XRP per la firma delle transazioni.
- Tutti gli hash utilizzano SHA-256 con una canonicalizzazione deterministica `sortKeysDeep()`.
- Ogni elemento può essere verificato indipendentemente rispetto alla blockchain.
- La versione della libreria `xrpl` è fissata alla versione 4.2.5 (dopo un avviso sulla catena di fornitura npm).
- Nessuna telemetria viene raccolta o trasmessa.

## Verifica

```bash
bash verify.sh
```

Esegue il controllo dei tipi TypeScript e l'intera suite di test composta da 240 test.

## Stato

**Fase 1, MVP: completata.** La tesi fondamentale del prodotto, ovvero XRPL come piano di controllo affidabile per il rilascio di contenuti creati, è stata dimostrata in tutte e cinque le fasi con artefatti reali sulla Testnet.

**In attesa:** Dimostrazione pratica di Xaman (l'architettura dell'adattatore è stata implementata, in attesa di credenziali esterne). Questa è una fase di finalizzazione, non una nuova fase di sviluppo.

## Licenza

MIT

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
