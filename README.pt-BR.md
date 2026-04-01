<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/xrpl-creator-capsule/readme.png" width="400" alt="XRPL Creator Capsule" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions"><img src="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases"><img src="https://img.shields.io/badge/preview-v1.0.0--rc.2-orange" alt="Preview RC.2" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/"><img src="https://img.shields.io/badge/handbook-live-brightgreen" alt="Handbook" /></a>
</p>

Sistema de lançamento de conteúdo de propriedade do criador na carteira XRP Ledger. Crie trabalhos, venda diretamente, desbloqueie benefícios para colecionadores, gerencie a receita – tudo com provas duradouras na blockchain.

> **Versão de pré-lançamento.** A RC.2 é um produto de visualização para a rede de testes (Testnet). A arquitetura do sistema suporta tanto a rede de testes quanto a rede principal (Mainnet), mas todas as provas de confiança foram validadas apenas na rede de testes. A rede principal é um caminho cuidadosamente planejado – não é o padrão.

## Duas maneiras de usar:

### Aplicativo para desktop (recomendado para criadores)

Baixe o instalador para Windows em [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/tag/v1.0.0-rc.2) e siga o [Guia para Iniciantes](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/).

O **Modo Studio** guia você por um fluxo de 6 etapas:

1. Descreva seu lançamento (título, artista, tamanho da edição, arquivos)
2. Defina os benefícios para colecionadores (faixas bônus, stems, arte em alta resolução)
3. Revise os termos e a segurança
4. Publique na rede de testes XRPL
5. Teste o acesso para colecionadores
6. Gere um pacote de recuperação

Requer [Node.js 22+](https://nodejs.org/) (o ambiente de execução integrado será lançado em uma versão futura).

### CLI (para desenvolvedores e integradores)

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # 265 tests, zero network calls
```

15 comandos que abrangem todo o ciclo de vida do lançamento:

| Comando | Propósito |
|---------|---------|
| `init-wallets` | Gera e configura um par de carteiras para o emissor e o operador. |
| `configure-minter` | Define o operador como emissor autorizado na conta do emissor. |
| `create-release` | Cria uma publicação a partir de um arquivo de manifesto. |
| `validate` | Valida um manifesto de publicação em relação ao esquema. |
| `resolve` | Verifica se os ponteiros do manifesto são estruturalmente válidos. |
| `mint-release` | Cria edições de NFTs e emite um recibo de emissão. |
| `verify-release` | Sincroniza o manifesto com o recibo em relação ao estado da blockchain. |
| `create-access-policy` | Gera uma política de acesso a partir do manifesto e do recibo. |
| `grant-access` | Avalia uma solicitação de acesso e emite um recibo de concessão. |
| `recover-release` | Reconstrói uma publicação a partir de arquivos e do estado da blockchain. |
| `create-governance-policy` | Cria uma política de governança para o tesouro de uma publicação. |
| `propose-payout` | Cria uma proposta de pagamento em relação a uma política de governança. |
| `decide-payout` | Coleta aprovações e emite um recibo de decisão. |
| `execute-payout` | Registra a execução do pagamento e verifica a cadeia de hash. |
| `verify-payout` | Verifica todos os 4 artefatos de governança e seus relacionamentos. |

## O que é comprovado

O XRPL Creator Capsule trata a Ledger XRP como uma plataforma de controle duradoura para propriedade, pagamento, acesso e persistência em relação a trabalhos criativos. Não é um mercado – é a infraestrutura que torna os mercados opcionais.

| Fase | O que é comprovado | Testes |
|-------|---------------|-------|
| A — Intenção do Criador | A identidade do manifesto é determinística e inviolável. | 27 |
| B — Veracidade da Criação | Os NFTs na XRPL correspondem exatamente ao manifesto (teste em rede de testes ativa). | 36 |
| C — Veracidade do Acesso | A propriedade desbloqueia acesso real fora da cadeia. | 34 |
| D — Veracidade da Governança | As receitas são gerenciadas por meio de uma cadeia de aprovação auditável. | 67 |
| E — Veracidade da Persistência | A publicação persiste mesmo após a desativação da interface (teste de falha concluído). | 28 |
| Confiança do ambiente de execução para desktop | Alternar modo, reiniciar, interrupção, tempo limite, temporização | 73 |
| **Total** | | **265** |

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

Monorepo com 5 pacotes de componentes + aplicativo para desktop. TypeScript, Vitest, Tauri v2, Node 22+.

## Configuração da rede

O sistema possui total consciência da rede – a rede de testes e a rede principal são alvos distintos e configuráveis.

| | Rede de testes | Rede principal |
|-|---------|---------|
| **Default** | Sim | No |
| **Trust-proven** | Sim (provas em funcionamento, 265 testes) | Ainda não |
| **CLI guard** | Nenhum necessário | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | Padrão do Modo Studio | Não disponível na RC.2 |

**Considere esta versão como uma visualização da rede de testes.** A arquitetura não é exclusiva da rede de testes, mas a prova de confiança foi validada na rede de testes. A compatibilidade com a rede principal requer assinaturas Xaman em funcionamento e promoção deliberada – não uma simples ativação.

## Modelo de confiança

**O que este sistema acessa:**
- Arquivos JSON locais (manifestos, recibos, políticas, pacotes)
- XRPL via WebSocket (`wss://`) para criação, verificação e verificações de detentores.
- Frases de recuperação de carteiras armazenadas em `wallets.json` local (ignoradas no Git, nunca commitadas).

**O que este sistema NÃO acessa:**
- Nenhuma API externa além dos nós da XRPL.
- Nenhum banco de dados, armazenamento em nuvem ou serviço de terceiros.
- Nenhuma análise de usuário, rastreamento ou telemetria.

**Limites de segurança:**
- As operações na rede principal requerem a opção `--network mainnet --allow-mainnet-write` explícita.
- As credenciais da carteira permanecem locais e são transmitidas apenas para a XRPL para assinatura de transações.
- Todas as hashes usam SHA-256 sobre a normalização canônica determinística `sortKeysDeep()`.
- Cada artefato pode ser verificado independentemente em relação ao ledger.
- A versão do `xrpl` está fixada na versão 4.2.5 (após o alerta da cadeia de suprimentos npm).
- Nenhuma telemetria é coletada ou enviada.

## Limitações conhecidas

- **Node.js é necessário** para o aplicativo para desktop (o ambiente de execução integrado será lançado em breve)
- **A assinatura QR Xaman ainda não está disponível** – é necessário um arquivo de credenciais da carteira (baseado em seed, apenas para a rede de testes)
- **O upload para o IPFS está pendente** – os ponteiros de arquivo usam caminhos locais, o armazenamento com endereçamento real de conteúdo será implementado em breve
- **Apenas para Windows** – o instalador para macOS está planejado para uma versão futura da RC

## Relatando problemas

Clique em **Reportar** na barra de título do aplicativo para desktop para exportar um pacote de suporte e, em seguida, abra um [problema no GitHub](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

## Licença

MIT

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
