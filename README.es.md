<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Sistema de publicación propiedad del creador en el XRP Ledger. Publica obras, vende directamente, desbloquea beneficios para los coleccionistas, gestiona los ingresos; todo ello respaldado por pruebas duraderas en la cadena de bloques.

> **Lanzamiento inicial en Testnet.** Esta versión es un producto de Testnet. La arquitectura del motor admite tanto Testnet como Mainnet, pero todas las pruebas de confianza se han validado solo en Testnet. Mainnet es una promoción controlada y deliberada, no la opción predeterminada.

## Dos formas de usarlo

### Aplicación de escritorio (recomendada para creadores)

Descarga el instalador de Windows desde [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/latest) y sigue la [Guía para principiantes](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/).

**El modo Studio** te guía a través de un flujo guiado de 6 pasos:

1. Describe tu publicación (título, artista, tamaño de la edición, archivos)
2. Establece los beneficios para los coleccionistas (pistas adicionales, pistas instrumentales, arte en alta resolución)
3. Revisa los términos y las condiciones de seguridad
4. Publica en XRPL Testnet
5. Prueba el acceso del coleccionista
6. Genera un paquete de recuperación

Requiere [Node.js 22+](https://nodejs.org/) (el entorno de ejecución incluido estará disponible en una versión futura).

### CLI (para desarrolladores e integradores)

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # full test suite (700+ tests), zero network calls
```

15 comandos que cubren todo el ciclo de vida de la publicación:

| Comando | Propósito |
|---------|---------|
| `init-wallets` | Genera y financia el par de billeteras del emisor y del operador |
| `configure-minter` | Establece al operador como un acuñador autorizado en la cuenta del emisor |
| `create-release` | Crea una publicación a partir de un archivo de entrada de manifiesto |
| `validate` | Valida un manifiesto de publicación con respecto al esquema |
| `resolve` | Verifica que los punteros del manifiesto sean estructuralmente válidos |
| `mint-release` | Acuña ediciones NFT y emite el recibo de emisión |
| `verify-release` | Reconcilia el manifiesto y el recibo con el estado de la cadena |
| `create-access-policy` | Genera una política de acceso a partir del manifiesto y el recibo |
| `grant-access` | Evalúa la solicitud de acceso y emite un recibo de concesión |
| `recover-release` | Reconstruye una publicación a partir de artefactos y el estado de la cadena |
| `create-governance-policy` | Crea una política de gobernanza para la tesorería de una publicación |
| `propose-payout` | Crea una propuesta de pago con respecto a una política de gobernanza |
| `decide-payout` | Recopila las aprobaciones y emite un recibo de decisión |
| `execute-payout` | Registra la ejecución del pago y verifica la cadena hash |
| `verify-payout` | Verifica los 4 artefactos de gobernanza y sus relaciones |

## Lo que prueba

XRPL Creator Capsule trata el XRP Ledger como un plano de control duradero para la propiedad, el pago, el acceso y la supervivencia. No es un mercado; es la infraestructura que hace que los mercados sean opcionales.

| Fase | Lo que prueba |
|-------|---------------|
| A: Intención del creador | La identidad del manifiesto es determinista y resistente a manipulaciones |
| B: Verdad de la acuñación | Los NFT en XRPL coinciden exactamente con el manifiesto (prueba en vivo en Testnet) |
| C: Verdad del acceso | La propiedad desbloquea el acceso real fuera de la cadena |
| D: Verdad de la gobernanza | Los ingresos se gestionan a través de una cadena de aprobación auditable |
| E: Verdad de la durabilidad | La publicación sobrevive a la muerte del frontend (se superó la prueba de simulación de fallo) |
| Confianza en el entorno de ejecución de escritorio | Cambio de modo, reinicio, interrupción, tiempo de espera, temporización |

Actualmente, la suite ejecuta **más de 700 pruebas** en los paquetes del motor, la CLI y la aplicación de escritorio; `bash verify.sh` ejecuta todo esto e imprime el recuento actual, sin realizar ninguna llamada a la red. (Los números exactos varían a medida que crece la suite; el comando es la fuente de información).

## Arquitectura

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

Monorepositorio con 5 paquetes del motor y una aplicación de escritorio. TypeScript, Vitest, Tauri v2, Node 22+.

## Postura de la red

El sistema tiene un conocimiento completo de la red: Testnet y Mainnet son objetivos distintos y configurables.

| | Testnet | Mainnet |
|-|---------|---------|
| **Default** | Sí | No |
| **Trust-proven** | Sí (pruebas en vivo, suite completa) | Aún no |
| **CLI guard** | Ninguna necesaria | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | Predeterminado en el modo Studio | No se expone en la aplicación de escritorio |

**Considera esta versión como una vista previa de Testnet.** La arquitectura no es exclusiva de Testnet, pero la prueba de confianza está probada en Testnet. La preparación para Mainnet requiere firmas Xaman en vivo y una promoción deliberada; no basta con cambiar un indicador.

## Modelo de confianza

**Qué afecta este sistema:**
- Archivos JSON locales (manifiestos, recibos, políticas, paquetes)
- XRPL a través de WebSocket (`wss://`) para la acuñación, la verificación y las comprobaciones de los titulares
- Frases de contraseña de la billetera almacenadas localmente en `wallets.json` (ignoradas por Git, nunca se incluyen)

**Qué NO afecta este sistema:**
- Ninguna API externa más allá de los nodos XRPL
- Ninguna base de datos, almacenamiento en la nube ni servicios de terceros
- Ningún análisis de usuarios, seguimiento o telemetría

**Límites de seguridad:**
- Las escrituras en Mainnet requieren una autorización explícita `--network mainnet --allow-mainnet-write`
- Las credenciales de la billetera permanecen locales; solo se transmiten a XRPL para firmar las transacciones
- Todos los hash utilizan SHA-256 sobre una canonización determinista `sortKeysDeep()`
- Cada artefacto es verificable de forma independiente con respecto al libro mayor
- `xrpl` fijado en la versión exacta 4.2.5 (tras el aviso sobre la cadena de suministro de npm)

## Limitaciones conocidas

- **Se requiere Node.js** para la aplicación de escritorio (el entorno de ejecución incluido estará disponible pronto).
- **La firma QR de Xaman aún no está activa:** se requiere un archivo de credenciales de billetera (basado en semillas, solo Testnet).
- **La carga a IPFS está pendiente:** los punteros de archivos utilizan rutas locales; el almacenamiento real basado en contenido estará disponible pronto.
- **Solo para Windows:** se planea una versión para macOS para una futura RC.

## Informar sobre problemas

Haz clic en **Reportar** en la barra de título de la aplicación de escritorio para exportar un paquete de soporte y, a continuación, abre un [problema en GitHub](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

## Licencia

MIT

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
