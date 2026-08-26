<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

Sistema de lançamento com propriedade do criador no XRP Ledger. Publique trabalhos, venda diretamente, desbloqueie benefícios para colecionadores, gerencie receitas — tudo respaldado por evidências duradouras na cadeia.

> **Lançamento inicial na Testnet.** Esta versão é um produto da Testnet. A arquitetura do motor suporta tanto a Testnet quanto a Mainnet, mas todas as provas de confiança foram validadas apenas na Testnet. A Mainnet é uma promoção planejada e controlada — não é o padrão.

## Duas maneiras de usá-lo

### Aplicativo para desktop (recomendado para criadores)

Baixe o instalador do Windows em [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/latest) e siga o [Guia para Iniciantes](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/).

O **Modo Studio** guia você por um fluxo de 6 etapas:

1. Descreva seu lançamento (título, artista, tamanho da edição, arquivos)
2. Defina os benefícios para colecionadores (faixas bônus, stems, arte em alta resolução)
3. Revise os termos e a segurança
4. Publique na XRPL Testnet
5. Teste o acesso do colecionador
6. Gere um pacote de recuperação

Requer [Node.js 22+](https://nodejs.org/) (ambiente de execução incluído em uma versão futura).

### CLI (para desenvolvedores e integradores)

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # full test suite (700+ tests), zero network calls
```

15 comandos que abrangem todo o ciclo de vida do lançamento:

| Comando | Finalidade |
|---------|---------|
| `init-wallets` | Gere e financie o par de carteiras emissor + operador |
| `configure-minter` | Defina o operador como um emissor autorizado na conta do emissor |
| `create-release` | Crie um lançamento a partir de um arquivo de manifesto |
| `validate` | Valide um Manifesto de Lançamento em relação ao esquema |
| `resolve` | Verifique se os ponteiros do manifesto são estruturalmente válidos |
| `mint-release` | Crie edições NFT e emita o comprovante de emissão |
| `verify-release` | Reconcilie o manifesto + comprovante com o estado da cadeia |
| `create-access-policy` | Gere uma política de acesso a partir do manifesto + comprovante |
| `grant-access` | Avalie a solicitação de acesso e emita um comprovante de concessão |
| `recover-release` | Reconstrua um lançamento a partir de artefatos + estado da cadeia |
| `create-governance-policy` | Crie uma política de governança para o tesouro do lançamento |
| `propose-payout` | Crie uma proposta de pagamento em relação a uma política de governança |
| `decide-payout` | Colete aprovações e emita um comprovante de decisão |
| `execute-payout` | Registre a execução do pagamento e verifique a cadeia de hash |
| `verify-payout` | Verifique todos os 4 artefatos de governança e seus relacionamentos |

## O que isso comprova

O XRPL Creator Capsule trata o XRP Ledger como um plano de controle duradouro para propriedade, pagamento, acesso e sobrevivência. Não é um mercado — é a infraestrutura que torna os mercados opcionais.

| Fase | O que isso comprova |
|-------|---------------|
| A — Intenção do Criador | A identidade do manifesto é determinística e à prova de adulteração |
| B — Verdade da Emissão | NFTs na XRPL correspondem exatamente ao manifesto (prova ativa na Testnet) |
| C — Verdade do Acesso | A propriedade desbloqueia o acesso real fora da cadeia |
| D — Verdade da Governança | As receitas são gerenciadas por meio de uma cadeia de aprovação auditável |
| E — Verdade da Durabilidade | O lançamento sobrevive à morte do frontend (teste de resistência aprovado) |
| Confiança no Ambiente de Execução para Desktop | Alternância de modo, reinicialização, interrupção, tempo limite, temporização |

Atualmente, a suíte executa **mais de 700 testes** em todos os pacotes do motor, CLI e aplicativo para desktop — `bash verify.sh` executa tudo isso e imprime a contagem ao vivo, sem chamadas de rede. (Os números exatos variam à medida que a suíte cresce; o comando é a fonte da verdade.)

## Arquitetura

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

Monorepos com 5 pacotes do motor + aplicativo para desktop. TypeScript, Vitest, Tauri v2, Node 22+.

## Postura de rede

O sistema tem total conhecimento da rede — Testnet e Mainnet são alvos distintos e configuráveis.

| | Testnet | Mainnet |
|-|---------|---------|
| **Default** | Sim | No |
| **Trust-proven** | Sim (provas ao vivo, suíte completa) | Ainda não |
| **CLI guard** | Nenhuma necessária | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | Padrão do Modo Studio | Não exposto no aplicativo para desktop |

**Considere esta versão como uma prévia da Testnet.** A arquitetura não é exclusiva da Testnet, mas a prova de confiança foi comprovada na Testnet. A prontidão para a Mainnet requer assinaturas Xaman ao vivo e promoção deliberada — não apenas alterar uma configuração.

## Modelo de Confiança

**O que este sistema afeta:**
- Arquivos JSON locais (manifestos, comprovantes, políticas, pacotes)
- XRPL via WebSocket (`wss://`) para emissão, verificação e verificações de detentores
- Frases-semente da carteira armazenadas localmente em `wallets.json` (ignoradas pelo Git, nunca confirmadas)

**O que este sistema NÃO afeta:**
- Nenhuma API externa além dos nós XRPL
- Nenhum banco de dados, armazenamento em nuvem ou serviços de terceiros
- Nenhuma análise de usuário, rastreamento ou telemetria

**Limites de segurança:**
- As gravações na Mainnet exigem `--network mainnet --allow-mainnet-write` explícito
- As credenciais da carteira permanecem locais — transmitidas apenas para o XRPL para assinatura de transações
- Todos os hashes usam SHA-256 sobre a canonização determinística em `sortKeysDeep()`
- Cada artefato é verificável independentemente em relação ao livro-razão
- `xrpl` fixado na versão exata 4.2.5 (após o aviso da cadeia de suprimentos do npm)

## Limitações conhecidas

- **Node.js necessário** para o aplicativo para desktop (ambiente de execução incluído em uma versão futura)
- **Assinatura QR Xaman ainda não ativa** — arquivo de credenciais da carteira necessário (baseado em semente, apenas Testnet)
- **Upload do IPFS pendente** — os ponteiros de arquivos usam caminhos locais, o armazenamento real com endereçamento de conteúdo será implementado posteriormente
- **Apenas Windows** — instalador macOS planejado para uma versão RC futura

## Relatando problemas

Clique em **Reportar** na barra de título do aplicativo para desktop para exportar um pacote de suporte e, em seguida, abra um [problema no GitHub](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

## Licença

MIT

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
