<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Sistema de publicación de contenido propiedad del creador en el Ledger de XRP. Permite crear obras, vender directamente, desbloquear beneficios para coleccionistas y gestionar los ingresos, todo respaldado por una prueba inmutable en la cadena de bloques.

> **Versión de vista previa.** RC.2 es un producto de vista previa para la red de pruebas (Testnet). La arquitectura del sistema admite tanto la red de pruebas como la red principal (Mainnet), pero todas las pruebas de confianza se han validado únicamente en la red de pruebas. La red principal es un camino deliberado y controlado, no la opción predeterminada.

## Dos formas de usarlo:

### Aplicación de escritorio (recomendada para creadores)

Descargue el instalador de Windows desde [GitHub Releases](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/releases/tag/v1.0.0-rc.2) y siga la [Guía para principiantes](https://mcp-tool-shop-org.github.io/xrpl-creator-capsule/handbook/beginners/).

El **Modo Studio** le guía a través de un flujo de trabajo de 6 pasos:

1. Describa su publicación (título, artista, tamaño de la edición, archivos)
2. Configure los beneficios para coleccionistas (pistas adicionales, stems, arte de alta resolución)
3. Revise los términos y las políticas de seguridad
4. Publique en XRPL Testnet
5. Pruebe el acceso para coleccionistas
6. Genere un paquete de recuperación

Requiere [Node.js 22+](https://nodejs.org/) (un entorno de ejecución integrado estará disponible en una futura versión).

### Interfaz de línea de comandos (CLI) (para desarrolladores e integradores)

```bash
git clone https://github.com/mcp-tool-shop-org/xrpl-creator-capsule.git
cd xrpl-creator-capsule
npm install
bash verify.sh    # 265 tests, zero network calls
```

15 comandos que cubren todo el ciclo de vida de la publicación:

| Comando | Propósito |
|---------|---------|
| `init-wallets` | Genera y financia un par de billeteras de emisor y operador |
| `configure-minter` | Configura al operador como el minter autorizado en la cuenta del emisor |
| `create-release` | Crea una publicación a partir de un archivo de manifiesto de entrada |
| `validate` | Valida un Manifiesto de Publicación contra el esquema |
| `resolve` | Verifica que los punteros del manifiesto sean estructuralmente válidos |
| `mint-release` | Crea ediciones de NFT y emite un recibo de emisión |
| `verify-release` | Concilia el manifiesto y el recibo con el estado de la cadena de bloques |
| `create-access-policy` | Genera una política de acceso a partir del manifiesto y el recibo |
| `grant-access` | Evalúa una solicitud de acceso y emite un recibo de concesión |
| `recover-release` | Reconstruye una publicación a partir de artefactos y el estado de la cadena de bloques |
| `create-governance-policy` | Crea una política de gobernanza para el tesoro de una publicación |
| `propose-payout` | Crea una propuesta de pago contra una política de gobernanza |
| `decide-payout` | Recopila aprobaciones y emite un recibo de decisión |
| `execute-payout` | Registra la ejecución del pago y verifica la cadena de hash |
| `verify-payout` | Verifica los 4 artefactos de gobernanza y sus relaciones |

## Lo que demuestra

XRPL Creator Capsule trata el Ledger de XRP como un plano de control duradero para la propiedad, el pago, el acceso y la supervivencia. No es un mercado, sino la infraestructura que hace que los mercados sean opcionales.

| Fase | Lo que demuestra | Pruebas |
|-------|---------------|-------|
| A — Intención del creador | La identidad del manifiesto es determinista y resistente a la manipulación | 27 |
| B — Veracidad de la emisión | Los NFT en XRPL coinciden exactamente con el manifiesto (prueba en vivo en Testnet) | 36 |
| C — Veracidad del acceso | La propiedad desbloquea un acceso real fuera de la cadena | 34 |
| D — Veracidad de la gobernanza | Los ingresos se gestionan a través de una cadena de aprobación auditable | 67 |
| E — Veracidad de la durabilidad | La publicación sobrevive a la desaparición de la interfaz de usuario (prueba de fallo superada) | 28 |
| Confianza del entorno de ejecución de escritorio | Cambio de modo, reinicio, interrupción, tiempo de espera, sincronización | 73 |
| **Total** | | **265** |

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

Monorepo con 5 paquetes de motor + aplicación de escritorio. TypeScript, Vitest, Tauri v2, Node 22+.

## Estado de la red

El sistema tiene total conocimiento de la red: Testnet y Mainnet son objetivos distintos y configurables.

| | Testnet | Mainnet |
|-|---------|---------|
| **Default** | Sí | No |
| **Trust-proven** | Sí (pruebas en vivo, 265 pruebas) | No todavía |
| **CLI guard** | No se necesitan | `--network mainnet --allow-mainnet-write` |
| **Desktop app** | Modo Studio predeterminado | No se expone en RC.2 |

**Considere esta versión como una vista previa de la red de pruebas (Testnet).** La arquitectura no es exclusiva de la red de pruebas, pero la prueba de confianza ha sido verificada en la red de pruebas. La preparación para la red principal requiere la firma activa de Xaman y una promoción deliberada, no simplemente un cambio de configuración.

## Modelo de confianza

**Qué aspectos cubre este sistema:**
- Archivos JSON locales (manifiestos, recibos, políticas, paquetes)
- XRPL a través de WebSocket (`wss://`) para la creación, verificación y verificación de la titularidad.
- Frases semilla de la billetera almacenadas en el archivo local `wallets.json` (ignoradas por Git, nunca se confirman).

**Qué aspectos NO cubre este sistema:**
- No hay APIs externas más allá de los nodos de XRPL.
- No hay bases de datos, almacenamiento en la nube ni servicios de terceros.
- No hay análisis de usuarios, seguimiento ni telemetría.

**Límites de seguridad:**
- Las escrituras en la red principal requieren la opción explícita `--network mainnet --allow-mainnet-write`.
- Las credenciales de la billetera permanecen locales y solo se transmiten a XRPL para la firma de transacciones.
- Todas las funciones hash utilizan SHA-256 sobre una normalización determinista `sortKeysDeep()`.
- Cada artefacto se puede verificar de forma independiente con el libro mayor.
- `xrpl` está fijado a la versión exacta 4.2.5 (después de la advertencia de la cadena de suministro de npm).

## Limitaciones conocidas

- **Se requiere Node.js** para la aplicación de escritorio (un entorno de ejecución empaquetado está en desarrollo).
- **La firma de Xaman mediante código QR aún no está disponible**: se requiere un archivo de credenciales de la billetera (basado en frases semilla, solo para la red de pruebas).
- **La carga a IPFS está pendiente**: los punteros de archivos utilizan rutas locales, el almacenamiento real con direccionamiento de contenido está en desarrollo.
- **Solo para Windows**: se planea un instalador para macOS para una versión RC futura.

## Informar de problemas

Haga clic en **Reportar** en la barra de título de la aplicación de escritorio para exportar un paquete de soporte y luego abra un [problema en GitHub](https://github.com/mcp-tool-shop-org/xrpl-creator-capsule/issues/new/choose).

## Licencia

MIT

---

Desarrollado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
