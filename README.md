# J. Armando — Storefront Editorial de Moda, Sastrería con IA y Backoffice

**J. Armando** es una plataforma de comercio electrónico de indumentaria de grado de producción diseñada para el **mercado de Estados Unidos (`USD`)**. Combina un storefront editorial de geometría rectilínea (`zero-radius`) con un flujo de checkout **guest-first** de 3 pasos que crea o vincula la cuenta del cliente en el momento del pago, un motor atómico de reserva de inventario, un backoffice administrativo protegido por roles, un asistente conversacional de IA con guardrails deterministas y un estudio de prueba virtual (**Virtual Try-On**) sin persistencia en disco ni base de datos.

Las **31 funcionalidades del MVP** (más este entregable de documentación) están implementadas, verificadas mediante una suite automatizada de 99 archivos / 667 tests sobre una instancia efímera embebida de PostgreSQL 17, y validadas de forma independiente bajo un flujo multi-agente de Desarrollo Guiado por Especificaciones (**SDD**).

---

## Tabla de Contenidos

1. [Resumen Ejecutivo y Enlaces Rápidos](#1-resumen-ejecutivo-y-enlaces-rápidos)
2. [Sistema de Diseño Editorial y Filosofía de Marca](#2-sistema-de-diseño-editorial-y-filosofía-de-marca)
3. [Reglas de Dominio, Actores y Matriz de las 32 Features](#3-reglas-de-dominio-actores-y-matriz-de-las-32-features)
4. [Stack Tecnológico, Toolchain e Inventario de Librerías](#4-stack-tecnológico-toolchain-e-inventario-de-librerías)
5. [Arquitectura Hexagonal (Puertos y Adaptadores)](#5-arquitectura-hexagonal-puertos-y-adaptadores)
6. [Superficie Completa de Rutas y API REST](#6-superficie-completa-de-rutas-y-api-rest)
7. [Subsistemas de IA: Guardrails Deterministas, Privacidad de Try-On y Resolución en 3 Niveles](#7-subsistemas-de-ia-guardrails-deterministas-privacidad-de-try-on-y-resolución-en-3-niveles)
8. [Checkout Guest-First, Reserva Atómica de Stock y Ciclo de Vida de Identidad](#8-checkout-guest-first-reserva-atómica-de-stock-y-ciclo-de-vida-de-identidad)
9. [Capa de Datos PostgreSQL 17: 17 Tablas, 7 Enums, Migraciones y Seeds](#9-capa-de-datos-postgresql-17-17-tablas-7-enums-migraciones-y-seeds)
10. [Restricciones Durables de Ingeniería y Registros de Decisiones de Arquitectura (ADRs)](#10-restricciones-durables-de-ingeniería-y-registros-de-decisiones-de-arquitectura-adrs)
11. [Guía de Inicio Rápido Local, Gate de Verificación (`./init.sh`) y Flujo Multi-Agente SDD](#11-guía-de-inicio-rápido-local-gate-de-verificación-initsh-y-flujo-multi-agente-sdd)

---

## 1. Resumen Ejecutivo y Enlaces Rápidos

### Puntos Clave de la Arquitectura

- **Mercado de EE. UU. y Dinero en Centavos Enteros (`CONSTRAINTS.md` #1):** Todos los precios, costos de envío, impuestos y totales de orden se almacenan y calculan como centavos enteros (`bigint`) en `USD` (`char(3) = 'USD'`). Los precios del catálogo se muestran **sin impuestos incluidos (`tax-exclusive`)**; el impuesto sobre las ventas estatal de EE. UU. (`sales tax`) se calcula según el estado de destino durante el checkout mediante [`lib/tax/sales-tax.ts`](lib/tax/sales-tax.ts).
- **Checkout Guest-First con Creación de Cuenta al Pagar:** Los compradores exploran el catálogo, gestionan su carrito (cookie `httpOnly` `ja_cart_session`) y completan el checkout sin registro previo. Cuando el pago es exitoso (`payment.succeeded`), la transacción reserva atómicamente el stock de cada variante (`UPDATE variant SET stock_qty = stock_qty - qty WHERE id = ? AND stock_qty >= qty`), congela las líneas de la orden y crea o vincula la cuenta ([`account`](db/schema/account.ts)) por correo en minúsculas (con contraseña opcional de acceso rápido hasheada con `scrypt`).
- **Autenticación por Contraseña + Código OTP de 6 Dígitos por Email (Passwordless):** Los clientes recurrentes inician sesión en `/account/signin` usando su contraseña (`node:crypto` `scrypt` + `timingSafeEqual`) o un código numérico de un solo uso de 6 dígitos con vigencia de 15 minutos (`account_access_code`) enviado a través del puerto de correo.
- **Aislamiento mediante Puertos y Adaptadores Hexagonales:** Las capacidades externas residen detrás de cuatro puertos agnósticos al framework — [`ChatAssistant`](lib/chat/chat-assistant.ts), [`TryOnProvider`](lib/try-on/try-on-provider.ts), [`PaymentProvider`](payments/payment-provider.ts) y [`EmailSender` / `OrderConfirmationEmailSender` / `AccessCodeEmailSender`](lib/email/email-service.ts) — de modo que los componentes de UI y los Route Handlers nunca dependen de SDKs específicos de proveedores.
- **Guardrails Deterministas de IA y Privacidad Zero-Persistence en Virtual Try-On:**
  - [`GuardedChatAssistant`](lib/chat/guarded-chat-assistant.ts) responde políticas de la tienda ([`store-knowledge.ts`](lib/chat/guardrails/store-knowledge.ts)), precios publicados en centavos enteros, sinónimos de categorías, stock por variante y medidas corporales de [`size_chart`](db/schema/catalog.ts) **de forma determinista sin invocar al LLM**, rechaza entradas fuera de alcance o intentos de *prompt injection*, y descarta cualquier monto en dólares no verificado en respuestas abiertas del LLM mediante pertenencia exacta al conjunto canónico de precios ([`answer-guard.ts`](lib/chat/guardrails/answer-guard.ts)).
  - El **Virtual Try-On** (`POST /api/try-on`) ejecuta validación pre-flight ([`photo-validation.ts`](lib/try-on/photo-validation.ts): lista blanca JPEG/PNG/WebP, límite inclusivo de `4 MiB` y verificación de *magic bytes* antes de tocar la base de datos o el proveedor), acota las llamadas externas con un `AbortSignal.timeout` de `30 s`, y procesa las fotos **estrictamente en memoria por petición** (`Cache-Control: no-store`, cero tablas en BD, cero archivos en disco/almacenamiento de objetos/navegador, cero registro de bytes o URLs en logs).
- **Gate de Verificación sin Docker y sin API Keys (`./init.sh`):** Ejecutar [`./init.sh`](init.sh) corre `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck` y `pnpm test` (que levanta un clúster efímero de `embedded-postgres` 17 por ejecución y prueba los adaptadores de IA/pagos/email offline mediante *seams* de transporte inyectables) y termina con código `0` sin requerir Docker, una instalación local de PostgreSQL ni claves de API en vivo.

### Índice de Documentación del Repositorio

| Documento | Propósito |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Instrucciones operativas para agentes, tabla de comandos, flujo de arranque y regla de código QR para vista previa móvil |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Versiones fijadas del toolchain, superficie de ejecución, estructura del repositorio, capa de datos y arquitectura en capas |
| [`CONSTRAINTS.md`](CONSTRAINTS.md) | 10 reglas de ingeniería durables (MUST / MUST NOT) aplicadas en todas las features |
| [`CONTEXT.md`](CONTEXT.md) | Lenguaje ubicuo del dominio, glosario canónico y términos rechazados |
| [`DESIGN.md`](DESIGN.md) | Dirección visual editorial, tipografía, tokens de color, geometría zero-radius y adaptación de referencias |
| [`PROGRESS.md`](PROGRESS.md) | Estado verificado actual del repositorio y bitácora cronológica de sesiones (`Session 001`–`Session 048`) |
| [`feature_list.json`](feature_list.json) | Fuente única de verdad para las 32 features, grafo de dependencias (DAG), criterios de verificación y evidencia |
| [`docs/build-brief.md`](docs/build-brief.md) | Definición del problema, actores objetivo, metas del producto, no-metas y criterios de validación del MVP |
| [`docs/domain-model.md`](docs/domain-model.md) | Entidades principales, relaciones, invariantes y máquinas de estado |
| [`docs/user-and-access-model.md`](docs/user-and-access-model.md) | Límites de permisos para Guest, Customer y Admin, cookies de sesión y reglas de privacidad de fotos |
| [`docs/technical-discovery.md`](docs/technical-discovery.md) | Decisiones de stack, reglas del mercado US/USD libre de impuestos en catálogo, estrategia de proveedores de IA y despliegue |
| [`docs/mvp-scope.md`](docs/mvp-scope.md) | Alcance incluido en el MVP frente a capacidades explícitamente excluidas para post-MVP |
| [`docs/risks-and-open-questions.md`](docs/risks-and-open-questions.md) | Preguntas arquitectónicas resueltas y puntos de privacidad abiertos previos a producción |
| [`docs/adr/`](docs/adr/) | Registros de Decisiones de Arquitectura aceptados ([`0001`](docs/adr/0001-standalone-git-repository.md)–[`0004`](docs/adr/0004-chat-assistant-guardrails.md)) |

---

## 2. Sistema de Diseño Editorial y Filosofía de Marca

Definido en [`DESIGN.md`](DESIGN.md) e implementado en [`app/globals.css`](app/globals.css), la estética de **J. Armando** fusiona la sobriedad editorial de alta costura con inteligencia computacional discreta:

### Principios Visuales y Geométricos

1. **Geometría Rectilínea Zero-Radius:** Cada tarjeta, botón, input, modal, insignia, tabla y panel aplica `border-radius: 0px` (esquinas arquitectónicas de `90 grados` inspiradas en patrones de sastrería y maquetación impresa). Las **únicas** excepciones circulares permitidas son los indicadores de estado de IA y las muestras de color (`color swatches`).
2. **Enmarcado Estructural Hairline:** Divisores finos de `1px solid` y capas tonales reemplazan las sombras paralelas (`drop shadows`) y los bordes pesados.
3. **Superficies de IA Silenciosas:** Las funciones generativas (Chat Assistant y Virtual Try-On) se integran como superficies de sastrería en tono acero pizarra (`slate-steel`) en lugar de widgets llamativos o popups intrusivos.

### Tipografía y Tokens de Color

| Token / Rol | Valor / Fuente | Uso |
| --- | --- | --- |
| **Serif Editorial de Titulares** | `Newsreader` (regular e itálica; nunca negrita) | Títulos de página, declaraciones hero, nombres de prendas, encabezados de confirmación de orden |
| **Sans Geométrica Funcional** | `Hanken Grotesk` (`400`, `500`, `600`) | Cuerpo de texto, navegación, precios, tablas de tallas, tablas de SKU, controles de formulario, metadatos de IA |
| **Primario / Tinta (`Ink`)** | `#121212` (Carbón Profundo) | Tipografía principal, marcos estructurales, botones primarios (nunca negro puro `#000000`) |
| **Neutral / Lienzo (`Canvas`)** | `#F9F8F5` (Alabastro Marfil Cálido) | Fondo de página que realza la fotografía textil sin deslumbramiento |
| **Secundario / Piedra (`Stone`)** | `#6E6A63` / `#E5E2DC` | Metadatos, etiquetas secundarias, divisores estructurales de `1px` |
| **Terciario / Acento IA** | `#4A5568` (Acero Pizarra) | Estudio de Virtual Try-On, superficies del Chat Assistant e indicadores algorítmicos |

### Adaptación de las Referencias de Diseño (`stitch_image_based_application/`)

El directorio `stitch_image_based_application/` contiene propuestas visuales iniciales (`LUMEN Atelier`). Según [`AGENTS.md`](AGENTS.md) y [`DESIGN.md`](DESIGN.md):
- Todo el branding `LUMEN` se reemplaza por **J. Armando**.
- Los textos de referencia en español, precios en EUR (`€`) y etiquetas con IVA incluido de los mockups se reemplazan en la interfaz de usuario por **copy en inglés (mercado US)**, **formato en `USD` (`$`) desde centavos enteros** y **precios de catálogo libres de impuestos** con cálculo separado de sales tax estatal en el checkout.
- Los widgets de referencia fuera de alcance (**AI Stylist cross-sell**, **predictor de ajuste FITIQ**, **boletín informativo / newsletter**, **portal de devoluciones**, **pasarela de pagos real**) se excluyen intencionalmente según [`docs/mvp-scope.md`](docs/mvp-scope.md).

---

## 3. Reglas de Dominio, Actores y Matriz de las 32 Features

### Matriz de Permisos por Actor y Rol

Según [`docs/user-and-access-model.md`](docs/user-and-access-model.md):

| Capacidad | Guest (`ja_cart_session`) | Customer (`ja_account_session`, rol `customer`) | Admin (`ja_account_session`, rol `admin`) |
| --- | :---: | :---: | :---: |
| Explorar `/catalog`, filtrar/ordenar, ver `/products/[slug]` y tablas de tallas | Sí | Sí | Sí |
| Agregar/editar/eliminar líneas del carrito (`/cart`, `1..10` por línea, limitado al stock) | Sí | Sí | Sí |
| Usar el Guarded Chat Assistant (`POST /api/chat`) y Virtual Try-On (`POST /api/try-on`) | Sí | Sí | Sí |
| Completar checkout de 3 pasos (`/checkout`) y ver confirmación de orden | Sí (crea/vincula Account al pagar) | Sí (vincula orden a su Account) | Sí |
| Iniciar sesión con Contraseña o Código OTP de 6 dígitos (`/account/signin`) | Crea sesión | Sí | Sí |
| Ver `/account`, `/account/orders` y su propio `/account/orders/[reference]` | Redirige a `/account/signin` | Sí (solo sus propias órdenes) | Sí (sus propias órdenes en `/account`) |
| Acceder al backoffice `/admin*` y endpoints `/api/admin/*` | `401 Unauthorized` | `403 Forbidden` | Sí (`getAdminSession()`) |
| Crear productos/variantes en borrador, publicar/archivar productos (`/admin/products*`) | No | No | Sí |
| Listar órdenes de todos los clientes y avanzar fulfillment (`/admin/orders*`) | No | No | Sí |

### Inventario Completo de las 32 Features (`feature_list.json`)

Cada corte funcional en [`feature_list.json`](feature_list.json) cuenta con su especificación en `docs/specs/` y su reporte de validación independiente en `docs/validations/`:

| # | Feature ID | Área | Título y Comportamiento Entregado | Estado |
| --- | --- | --- | --- | --- |
| 1 | `bootstrap-app-skeleton` | `bootstrap` | Shell Next.js 16.4 + React 19.3 + TypeScript, tokens editoriales, proyecto Vitest `ui`, gate no bloqueante `./init.sh` | `accepted` |
| 2 | `bootstrap-database-schema` | `bootstrap` | Esquema Drizzle ORM + PostgreSQL 17, migraciones, seed demo idempotente (`6` categorías, `9` productos, `40` variantes, `16` SVGs), harness `embedded-postgres` | `accepted` |
| 3 | `catalog-product-listing` | `catalog` | Grilla responsiva de 1/2/4 columnas de productos `published` con precios USD sin impuestos (`formatPriceUSD`) | `accepted` |
| 4 | `catalog-filtering` | `catalog` | Filtrado por URL (`category`, `size`, `color`, `maxPrice`) y ordenamiento (`newest`, `price-asc`, `price-desc`, `name`) | `accepted` |
| 5 | `product-detail-page` | `catalog` | Página de detalle asimétrica 3:2 (`/products/[slug]`), galería, composición/cuidados, 404 para slugs `draft`/`archived`/desconocidos | `accepted` |
| 6 | `product-variant-selection` | `catalog` | Selector interactivo de matriz talla/color (`?size=&color=`), disponibilidad derivada (`available` / `out_of_stock`), precio override por variante | `accepted` |
| 7 | `guest-cart-add` | `shopping` | `POST /api/cart/lines` y vista `/cart` con identidad mediante cookie opaca `httpOnly` `ja_cart_session` | `accepted` |
| 8 | `guest-cart-manage` | `shopping` | Steppers interactivos de cantidad (`PATCH /api/cart/lines`) y eliminación de líneas (`DELETE /api/cart/lines`) con recálculo instantáneo en centavos | `accepted` |
| 9 | `cart-stock-limits` | `shopping` | Aplicación en servidor y UI de límites de `stockQty` disponible al agregar, editar cantidad y reconciliar ítems agotados | `accepted` |
| 10 | `checkout-contact-and-address` | `checkout` | Paso 1 de `/checkout`: email de contacto y dirección de envío en EE. UU. (`state`, `zip` de 5/9 dígitos) persistidos en `checkout_session` | `accepted` |
| 11 | `checkout-shipping-method` | `checkout` | Paso 2 de `/checkout`: selección entre Standard (`$0.00`, 3–5 días hábiles) y Express (`$15.00`, 1–2 días hábiles) | `accepted` |
| 12 | `checkout-sales-tax` | `checkout` | Cálculo de sales tax estatal de EE. UU. según destino ([`lib/tax/sales-tax.ts`](lib/tax/sales-tax.ts)) para los 50 estados + DC | `accepted` |
| 13 | `payment-provider-abstraction` | `payments` | Puerto agnóstico `PaymentProvider`, `SimulatedPaymentProvider` (`succeed`/`fail`/`pending`) y mapeador `describePaymentOutcome` | `accepted` |
| 14 | `order-creation-on-payment` | `orders` | Paso 3 `POST /api/checkout/pay`: crea orden `paid` (`JA-XXXXXX`) con snapshots congelados en `order_line` y vista `/checkout/confirmation/[reference]` | `accepted` |
| 15 | `payment-failure-path` | `payments` | Pagos simulados rechazados/fallidos no crean orden pagada, preservan carrito y stock, y permiten reintento en el sitio | `accepted` |
| 16 | `stock-reservation` | `inventory` | Decremento condicional atómico en SQL (`stock_qty >= qty`) ordenado por `variantId` para evitar sobreventa ante checkouts concurrentes | `accepted` |
| 17 | `account-created-at-payment` | `identity` | El pago exitoso crea o vincula automáticamente `account` + rol `customer` por email en minúsculas y asocia `order.accountId` | `accepted` |
| 18 | `account-quick-access-password` | `identity` | Campo opcional de contraseña Quick Access en el checkout hasheado con `scrypt` (`lib/auth/password.ts`) y guardado en la cuenta creada/vinculada | `accepted` |
| 19 | `account-signin-signout` | `identity` | Inicio de sesión de clientes (`/account/signin`) vía contraseña o código OTP de 6 dígitos por email (`account_access_code`) + ciclo de `ja_account_session` | `accepted` |
| 20 | `order-history` | `orders` | Historial de órdenes del cliente autenticado (`/account/orders`) y detalle (`/account/orders/[reference]`) aislado estrictamente por cuenta | `accepted` |
| 21 | `order-confirmation-email` | `notifications` | Email de confirmación de orden no bloqueante (`OrderConfirmationEmailSender`) enviado al crearse una orden `paid` | `accepted` |
| 22 | `admin-role-gate` | `backoffice` | Guardia del lado del servidor `getAdminSession()` que protege páginas `/admin*` y rutas `/api/admin/*` (`401`/`403`) + cuenta admin en seed | `accepted` |
| 23 | `admin-product-create` | `backoffice` | Listado admin de productos (`/admin/products`), formulario de creación (`/admin/products/new`) y detalle (`/admin/products/[id]`) con SKU y stock | `accepted` |
| 24 | `admin-product-publish` | `backoffice` | Transiciones de estado de producto (`draft` <-> `published` <-> `archived`) que controlan la visibilidad en el storefront | `accepted` |
| 25 | `admin-order-list` | `backoffice` | Listado global de órdenes (`/admin/orders`) y detalle (`/admin/orders/[reference]`) de todos los clientes con snapshots financieros | `accepted` |
| 26 | `admin-order-fulfillment` | `backoffice` | Progresión secuencial de fulfillment (`unfulfilled` -> `preparing` -> `shipped` -> `delivered`) para órdenes pagadas, reflejada en la cuenta del cliente | `accepted` |
| 27 | `chat-assistant` | `ai` | Panel del Chat Assistant en el storefront (`app/chat/chat-panel.tsx`) y `POST /api/chat` detrás del puerto `ChatAssistant` | `accepted` |
| 28 | `chat-assistant-guardrails` | `ai` | Decorador `GuardedChatAssistant`: respuestas deterministas de políticas/precios/catálogo, rechazo de inyección y filtro de montos en dólares | `accepted` |
| 29 | `virtual-tryon-generation` | `ai` | Estudio Virtual Try-On en página de producto (`app/products/[slug]/try-on-panel.tsx`) y `POST /api/try-on` con privacidad en memoria | `accepted` |
| 30 | `catalog-size-chart` | `catalog` | Tabla `size_chart` por categoría (`30` filas en seed para `XS`–`XL`), guía de tallas en página de producto y respuestas deterministas en el chat | `accepted` |
| 31 | `virtual-tryon-failure` | `ai` | Validación pre-flight `4 MiB` / JPEG-PNG-WebP / magic-bytes (`400 invalid_photo`), timeout `30 s` (`504`) y reintento conservando la misma foto | `accepted` |
| 32 | `repository-readme` | `documentation` | `README.md` raíz exhaustivo con arquitectura, stack, librerías, sistemas de IA, esquema de 17 tablas y 6 diagramas Mermaid | `accepted` |

---

## 4. Stack Tecnológico, Toolchain e Inventario de Librerías

Todas las versiones del toolchain y dependencias están fijadas en [`.nvmrc`](.nvmrc) y [`package.json`](package.json).

### Versiones Fijadas de Runtime y Toolchain

| Herramienta | Versión Fijada | Gestión y Rol Arquitectónico |
| --- | --- | --- |
| **Node.js** | `v24.21.0` (`>=24.0.0`) | Gestionado vía `nvm` ([`.nvmrc`](.nvmrc)). Ejecuta los scripts CLI `db/*.ts` directamente usando `--experimental-strip-types` nativo de Node 24 (sintaxis TypeScript borrable sin `tsx` ni `ts-node`). |
| **pnpm** | `12.11.2` | Gestionado vía Corepack (`"packageManager": "pnpm@12.11.2"`). Garantiza instalaciones deterministas con lockfile (`pnpm install --frozen-lockfile`). |
| **TypeScript** | `^5` (`5.9.3`) | Verificación estática estricta de tipos (`tsc --noEmit`) con `allowImportingTsExtensions` habilitado para el type-stripping nativo de Node 24. |
| **PostgreSQL** | `17` | Base de datos relacional principal que almacena catálogo, carrito, checkout, órdenes, pagos e identidad en centavos enteros (`bigint`). |

### Dependencias de Producción (`dependencies` en `package.json`)

| Paquete | Versión | Rol Arquitectónico |
| --- | --- | --- |
| `next` | `16.4.0` | Framework App Router con React Server Components (RSC), compilación con Turbopack, Route Handlers dinámicos y `params` / `searchParams` asíncronos (`Promise<...>`) de Next 16. |
| `react` | `19.3.0` | Primitivas de renderizado para Server y Client Components (`useState`, `useEffect`, `useId`, transiciones). |
| `react-dom` | `19.3.0` | Bindings de DOM y renderizador HTML en streaming del lado del servidor para React 19. |
| `drizzle-orm` | `^0.45.4` | Constructor de consultas SQL tipado y DSL de esquema (`pgTable`, `pgEnum`, repositorios transaccionales en `db/`). Seleccionado en [ADR 0002](docs/adr/0002-drizzle-data-access-layer.md). |
| `pg` | `^8.23.1` | Driver de pool de conexiones `node-postgres` que respalda a Drizzle ORM mediante `DATABASE_URL` ([`db/client.ts`](db/client.ts)). |

### Dependencias de Desarrollo y Verificación (`devDependencies` en `package.json`)

| Paquete | Versión | Rol Arquitectónico |
| --- | --- | --- |
| `drizzle-kit` | `0.31.11` | Generador de diferencias de esquema y migraciones SQL (`pnpm db:generate`) y ejecutor de migraciones (`pnpm db:migrate`) configurado en [`drizzle.config.ts`](drizzle.config.ts). |
| `embedded-postgres` | `17.10.0-beta.17` | Inicia binarios reales y desechables de PostgreSQL 17 en espacio de usuario para los tests de integración ([`db/tests/global-setup.ts`](db/tests/global-setup.ts)) y desarrollo local sin Docker (`pnpm db:devdb`). |
| `vitest` | `^5.0.3` | Ejecutor de pruebas configurado en [`vitest.config.mts`](vitest.config.mts) con dos proyectos aislados: `ui` (`jsdom`) y `db` (`node`, con bases de datos PostgreSQL paralelas por archivo). |
| `@testing-library/react` | `^16.3.3` | Renderizado de componentes y pruebas de DOM centradas en el usuario para Client y Server Components en el proyecto Vitest `ui`. |
| `@testing-library/dom` | `^10.4.2` | Primitivas de consulta accesibles (`getByRole`, `getByLabelText`, `getByTestId`) utilizadas en los tests de UI. |
| `jsdom` | `^30.1.2` | Entorno DOM de navegador para el proyecto Vitest `ui` (`globals: true` habilitado para limpieza automática en `afterEach`). |
| `@vitejs/plugin-react` | `^6.1.2` | Plugin de transformación JSX/TSX para Vitest 5. |
| `eslint` | `^9` (`9.39.5`) | Linter estático con configuración plana ([`eslint.config.mjs`](eslint.config.mjs)). |
| `eslint-config-next` | `16.4.0` | Conjunto de reglas ESLint para Next.js 16 y React 19 (`core-web-vitals` + TypeScript). |
| `typescript` | `^5` (`5.9.3`) | Compilador TypeScript (`tsc --noEmit`) con `allowImportingTsExtensions` para el soporte nativo de Node 24. |
| `@types/node` | `^24` | Definiciones de tipos para Node 24 (alineadas con los requisitos peer de `vitest@5`: `^22 \|\| >=24`). |
| `@types/pg` | `^8.23.1` | Definiciones de tipos TypeScript para `pg`. |
| `@types/react` / `@types/react-dom` | `^19` | Definiciones de tipos TypeScript para React 19. |

### Primitivas Nativas de Node.js (Cero SDKs Externos para Auth e IA)

Para mantener una huella de dependencias mínima y auditable, la autenticación y la comunicación con proveedores de IA utilizan primitivas nativas de Node 24 en lugar de SDKs pesados:
- **`node:crypto` (`scrypt`, `randomBytes`, `timingSafeEqual`):** Impulsa el hashing de contraseñas (`<saltHex>:<keyHex>` en [`lib/auth/password.ts`](lib/auth/password.ts)), los tokens de sesión opacos de 32 bytes en `base64url` (`ja_cart_session`, `ja_account_session`) y los códigos de acceso OTP de 6 dígitos criptográficamente aleatorios.
- **`node:crypto` (`createSign("RSA-SHA256")`):** Firma aserciones JWT OAuth2 RS256 en [`lib/ai/google-auth.ts`](lib/ai/google-auth.ts) para intercambiar credenciales de `gcp-service-account.json` por tokens Bearer de corta duración de Google Cloud Vertex AI sin instalar `@google-cloud/vertexai` ni `google-auth-library`.
- **`fetch` nativo + `AbortSignal.timeout`:** Ejecuta todas las llamadas HTTP hacia Vertex AI, Google Gemini API y endpoints compatibles con OpenAI / DevExpert, aceptando un *seam* `fetch` inyectable para pruebas offline deterministas.

---

## 5. Arquitectura Hexagonal (Puertos y Adaptadores)

### Regla de Dirección de Dependencias

Las dependencias de código apuntan estrictamente hacia adentro, hacia los contratos de dominio y los repositorios de datos:

```text
app/ (Páginas Next.js, Client Components y Route Handlers)
  │
  ├──► lib/ y payments/ (Puertos de Dominio Agnósticos al Framework, Decoradores de Guardrails y Mapeadores Puros)
  │      └──► Adaptadores Concretos (Vertex AI, Gemini API, OpenAI/DevExpert, Simulated Payment, Simulated Email)
  │
  └──► db/ (Repositorios Drizzle y Transacciones Atómicas)
         └──► PostgreSQL 17 (17 Tablas, 7 pgEnums)
```

- Los módulos en [`payments/`](payments/) y [`lib/`](lib/) (`lib/money.ts`, `lib/tax/sales-tax.ts`, `lib/chat/`, `lib/try-on/`, `lib/email/`) **no** importan `next`, `react` ni `db/` directamente. Cuando un decorador necesita datos del catálogo (como `GuardedChatAssistant`), recibe una interfaz estrecha de callbacks (`CatalogFactReader`) conectada en la raíz de composición ([`app/api/chat/composition.ts`](app/api/chat/composition.ts)).

### Diagrama 1: Arquitectura del Sistema y Puertos/Adaptadores Hexagonales

```mermaid
flowchart TB
  subgraph Client["Cliente en Navegador (Comprador y Admin)"]
    StorefrontUI["UI Storefront (/catalog, /products/[slug], /cart, /checkout)"]
    AccountUI["Portal de Cliente (/account, /account/signin, /account/orders)"]
    AdminUI["Backoffice Admin (/admin/products, /admin/orders)"]
    ChatUI["ChatPanel + TryOnPanel (Client Components)"]
  end

  subgraph AppLayer["Next.js 16.4 App Router (app/)"]
    RSC["Server Components (Páginas RSC)"]
    APIRoutes["REST Route Handlers (/api/cart, /api/checkout, /api/auth, /api/admin, /api/chat, /api/try-on)"]
    ChatComp["Raíz de Composición (app/api/chat/composition.ts)"]
  end

  subgraph DomainPorts["Puertos Hexagonales y Servicios de Dominio (lib/ y payments/)"]
    ChatGuard["Decorador GuardedChatAssistant + Store Knowledge y Answer Guard"]
    ChatPort["Puerto: ChatAssistant (lib/chat/chat-assistant.ts)"]
    TryOnVal["Validador Pre-Flight de Fotos (4 MiB, JPEG/PNG/WebP, Magic Bytes)"]
    TryOnPort["Puerto: TryOnProvider (lib/try-on/try-on-provider.ts)"]
    PayPort["Puerto: PaymentProvider (payments/payment-provider.ts)"]
    EmailPort["Puerto: EmailSender / OrderConfirmation y AccessCode (lib/email/)"]
    TaxMoney["Helpers Puros de Dominio (lib/money.ts, lib/tax/sales-tax.ts)"]
  end

  subgraph Adapters["Adaptadores Concretos (Intercambiables Detrás de los Puertos)"]
    VertexAdapters["Tier 1: VertexChatAssistant y VertexTryOnProvider (JWT RS256)"]
    GeminiAdapters["Tier 2: GeminiChatAssistant y GeminiTryOnProvider (GEMINI_API_KEY)"]
    OpenAiAdapters["Tier 3: OpenAiChatAssistant y OpenAiImagesTryOnProvider + SimulatedTryOnProvider"]
    SimPayAdapter["SimulatedPaymentProvider (succeed | fail | pending)"]
    SimEmailAdapter["SimulatedEmailSender y SimulatedAccessCodeEmailSender"]
  end

  subgraph DataLayer["Capa de Datos Drizzle ORM (db/)"]
    Repos["Repositorios (catalog, cart, checkout, order, auth, admin-products, admin-orders)"]
    PG[("PostgreSQL 17 (17 Tablas y 7 Enums)")]
  end

  StorefrontUI --> RSC
  AccountUI --> RSC
  AdminUI --> RSC
  StorefrontUI --> APIRoutes
  AccountUI --> APIRoutes
  AdminUI --> APIRoutes
  ChatUI --> APIRoutes

  RSC --> Repos
  RSC --> TaxMoney
  APIRoutes --> Repos
  APIRoutes --> ChatComp
  APIRoutes --> TryOnVal
  APIRoutes --> PayPort
  APIRoutes --> EmailPort

  ChatComp --> ChatGuard
  ChatGuard --> ChatPort
  ChatGuard --> Repos
  TryOnVal --> TryOnPort

  ChatPort --> VertexAdapters
  ChatPort --> GeminiAdapters
  ChatPort --> OpenAiAdapters

  TryOnPort --> VertexAdapters
  TryOnPort --> GeminiAdapters
  TryOnPort --> OpenAiAdapters

  PayPort --> SimPayAdapter
  EmailPort --> SimEmailAdapter
  Repos --> PG
```

### Los Cuatro Puertos Realizados y sus Adaptadores

| Interfaz del Puerto | Ubicación | Decorador / Mapeador | Adaptadores Concretos |
| --- | --- | --- | --- |
| **`ChatAssistant`** | [`lib/chat/chat-assistant.ts`](lib/chat/chat-assistant.ts) | [`GuardedChatAssistant`](lib/chat/guarded-chat-assistant.ts) (`lib/chat/guardrails/*`) | 1. [`VertexChatAssistant`](lib/chat/vertex-chat-assistant.ts) (`gemini-2.5-flash` vía Vertex AI)<br>2. [`GeminiChatAssistant`](lib/chat/gemini-chat-assistant.ts) (`gemini-3.8-flash` / `gemini-2.5-flash`)<br>3. [`OpenAiChatAssistant`](lib/chat/openai-chat-assistant.ts) (`gpt-4o-mini` o gateway compatible) |
| **`TryOnProvider`** | [`lib/try-on/try-on-provider.ts`](lib/try-on/try-on-provider.ts) | [`photo-validation.ts`](lib/try-on/photo-validation.ts) + [`prompt.ts`](lib/try-on/prompt.ts) | 1. [`VertexTryOnProvider`](lib/try-on/vertex-try-on-provider.ts) (`gemini-2.5-flash-image` vía Vertex AI)<br>2. [`GeminiTryOnProvider`](lib/try-on/gemini-try-on-provider.ts) (`gemini-3.1-flash-image` / `gemini-2.5-flash-image`)<br>3. [`OpenAiImagesTryOnProvider`](lib/try-on/openai-images-try-on-provider.ts) (`POST {baseUrl}/images/edits`, timeout `30 s`)<br>4. [`SimulatedTryOnProvider`](lib/try-on/simulated-try-on-provider.ts) (vista previa SVG determinista) |
| **`PaymentProvider`** | [`payments/payment-provider.ts`](payments/payment-provider.ts) | [`describePaymentOutcome`](payments/payment-outcome.ts) (`payments/payment-outcome.ts`) | [`SimulatedPaymentProvider`](payments/simulated-provider.ts) (`createSimulatedPaymentProvider`: eventos deterministas `succeed`, `fail` y `pending` con `sim_<reference>`) |
| **`OrderConfirmationEmailSender` y `AccessCodeEmailSender`** | [`lib/email/email-service.ts`](lib/email/email-service.ts) | `renderOrderConfirmationText` / `renderOrderConfirmationHtml` y `renderAccessCodeText` / `renderAccessCodeHtml` | [`SimulatedEmailSender`](lib/email/order-confirmation.ts) ([`lib/email/order-confirmation.ts`](lib/email/order-confirmation.ts)) y [`SimulatedAccessCodeEmailSender`](lib/email/access-code.ts) ([`lib/email/access-code.ts`](lib/email/access-code.ts)) |

### Estructura de Directorios del Repositorio

```text
.
├── app/                                  # Páginas Next.js 16.4 App Router, Client Components y rutas API
│   ├── layout.tsx                        # Layout raíz (fuentes Newsreader + Hanken Grotesk, <ChatPanel /> global)
│   ├── page.tsx                          # Landing page editorial (/)
│   ├── globals.css                       # Tokens de diseño zero-radius y estilos de componentes
│   ├── catalog/                          # Grilla /catalog, product-card, filter-bar y filter-params por URL
│   ├── products/[slug]/                  # Detalle /products/[slug], galería, variant-selector, size-guide, add-to-cart, try-on-panel
│   ├── cart/                             # Vista de sesión /cart, steppers en cart-items, helpers de cookie y validación
│   ├── checkout/                         # Flujo de 3 pasos /checkout, payment-outcome y /checkout/confirmation/[reference]
│   ├── account/                          # Resumen /account, /account/signin (pestañas Password + OTP), /account/orders y [reference]
│   ├── admin/                            # Dashboard /admin, /admin/products (listado, new, [id]) y /admin/orders (listado, [reference])
│   ├── chat/                             # Componente cliente flotante/drawer del Chat Assistant
│   └── api/                              # REST Route Handlers (cart, checkout, auth, account, admin, chat, try-on)
├── db/                                   # Capa de datos Drizzle ORM sobre PostgreSQL 17
│   ├── schema/                           # 17 tablas y 7 pgEnums (enums.ts, catalog.ts, account.ts, cart.ts, order.ts, index.ts)
│   ├── migrations/                       # 7 migraciones SQL versionadas (0000_bumpy_lifeguard .. 0006_fresh_zombie)
│   ├── tests/                            # globalSetup de embedded-postgres efímero, harness por archivo y 25 suites de BD
│   ├── catalog.ts                        # Consultas de productos publicados, filtros, tablas de tallas y contexto para try-on
│   ├── cart.ts                           # Repositorio de carrito invitado, límite por stock y resumen de sesión
│   ├── checkout.ts                       # Repositorio de checkout_session (contacto/dirección, envío, contraseña quick-access)
│   ├── order.ts                          # Creación transaccional de orden, decremento atómico de stock, vínculo de cuenta e historial
│   ├── auth.ts                           # Auth por contraseña, sesiones, generación/verificación de OTP de 6 dígitos y rol admin
│   ├── admin-products.ts                 # Creación de productos/variantes en backoffice y transiciones draft/published/archived
│   ├── admin-orders.ts                   # Listado/detalle de órdenes en backoffice y máquina de estados secuencial de fulfillment
│   ├── seed.ts & seed-data.ts            # Seed demo idempotente (insert-if-missing) de catálogo, envíos y cuenta admin
│   ├── verify.ts                         # Verificador CLI de población del catálogo (pnpm db:verify)
│   └── devdb.ts                          # Servidor local desechable de PostgreSQL 17 embebido (pnpm db:devdb)
├── lib/                                  # Puertos de aplicación agnósticos al framework, servicios de dominio y guardrails
│   ├── ai/google-auth.ts                 # Firmante JWT RS256 sin SDK y caché de tokens para Google Cloud Vertex AI
│   ├── auth/                             # Hashing de contraseñas scrypt (password.ts), cookies de sesión y getAdminSession
│   ├── chat/                             # Puerto ChatAssistant, adaptadores Vertex/Gemini/OpenAI, GuardedChatAssistant y guardrails/
│   ├── try-on/                           # Puerto TryOnProvider, adaptadores Vertex/Gemini/OpenAI/Simulated, photo-validation y prompt
│   ├── email/                            # Puertos, plantillas y emisores simulados para confirmación de orden y código OTP
│   ├── tax/sales-tax.ts                  # Tabla de tasas de sales tax por estado de EE. UU. y calculadora en centavos enteros
│   └── money.ts                          # Formateador puro de centavos enteros a cadena USD (formatPriceUSD)
├── payments/                             # Puerto agnóstico PaymentProvider, SimulatedPaymentProvider y mapeador de resultados
├── public/images/products/               # 16 ilustraciones editoriales SVG 3:4 referenciadas por seed-data.ts
├── docs/                                 # Documentos de descubrimiento, ADRs (docs/adr/), specs (docs/specs/) y validaciones
├── stitch_image_based_application/       # Propuestas visuales de referencia únicamente (NO son especificación)
├── init.sh                               # Gate de verificación no bloqueante (install + lint + typecheck + test)
├── feature_list.json                     # Fuente de verdad de las 32 features, dependencias y evidencia de verificación
└── PROGRESS.md                           # Estado verificado del repositorio y bitácora de sesiones
```

---

## 6. Superficie Completa de Rutas y API REST

### Páginas de Storefront, Cuenta de Cliente y Backoffice Admin

| Ruta | Renderizado | Guardia de Acceso | Responsabilidad |
| --- | --- | --- | --- |
| `/` | Estático (`○`) | Público | Landing page editorial de presentación de **J. Armando** con entrada directa a `/catalog`. |
| `/catalog` | Dinámico (`ƒ`) | Público | Grilla de productos `published` con filtros por URL (`category`, `size`, `color`, `maxPrice`) y ordenamiento (`newest`, `price-asc`, `price-desc`, `name`). |
| `/products/[slug]` | Dinámico (`ƒ`) | Público | Página de detalle de producto (división editorial `3:2`): galería de imágenes, precio `formatPriceUSD` sin impuestos, selector de variante talla/color, guía de tallas de la categoría, botón Add-to-Cart y estudio Virtual Try-On. Devuelve `404` para slugs `draft`, `archived` o inexistentes. |
| `/cart` | Dinámico (`ƒ`) | Público (`ja_cart_session`) | Carrito de sesión invitado con steppers de cantidad (`1..10`, limitado por `stockQty`), eliminación de líneas, alertas de reconciliación de stock, subtotal en centavos enteros y enlace a `/checkout`. Las lecturas nunca emiten cookie. |
| `/checkout` | Dinámico (`ƒ`) | Público (`ja_cart_session`) | Checkout guest-first de 3 pasos: (1) Email de contacto, dirección en EE. UU. y contraseña opcional Quick Access, (2) Método de envío (`Standard $0.00` / `Express $15.00`), (3) Resumen de sales tax estatal y Pago Simulado (`succeed` / `fail`). |
| `/checkout/confirmation/[reference]` | Dinámico (`ƒ`) | Público (`ja_cart_session` / referencia) | Confirmación post-compra que muestra la referencia (`JA-XXXXXX`), líneas congeladas, dirección de entrega, método de envío, desglose de impuestos y estado de creación/vinculación de cuenta. |
| `/account/signin` | Dinámico (`ƒ`) | Público (redirige si ya inició sesión) | Portal de autenticación de doble pestaña: **Contraseña** y **Código de Acceso por Email de 6 dígitos (OTP)**. Soporta redirección con `?returnUrl=`. |
| `/account` | Dinámico (`ƒ`) | Autenticado (`ja_account_session`) | Resumen de cuenta del cliente con email verificado, roles asignados, acceso rápido a `/account/orders` (y `/admin` si es administrador) y botón de cierre de sesión. |
| `/account/orders` | Dinámico (`ƒ`) | Autenticado (`ja_account_session`) | Historial de órdenes del cliente que lista todas las órdenes pagadas pertenecientes a la cuenta activa (más recientes primero) con insignias de pago y fulfillment. |
| `/account/orders/[reference]` | Dinámico (`ƒ`) | Autenticado (Solo propietario) | Detalle de orden del cliente con snapshots congelados de líneas, dirección de envío, total pagado y estado de fulfillment en vivo (`unfulfilled` -> `delivered`). Devuelve `404` si la referencia pertenece a otro cliente. |
| `/admin` | Dinámico (`ƒ`) | Admin (`getAdminSession`) | Dashboard del backoffice con acceso a Gestión de Catálogo (`/admin/products`) y Gestión de Fulfillment de Órdenes (`/admin/orders`). |
| `/admin/products` | Dinámico (`ƒ`) | Admin (`getAdminSession`) | Tabla de catálogo del backoffice con todos los estados (`draft`, `published`, `archived`), precio base, número de variantes, stock total y botón `+ New Product`. |
| `/admin/products/new` | Dinámico (`ƒ`) | Admin (`getAdminSession`) | Formulario de creación transaccional para un nuevo producto `draft` con filas dinámicas de variantes (talla/color/hex/stock). |
| `/admin/products/[id]` | Dinámico (`ƒ`) | Admin (`getAdminSession`) | Detalle de producto en backoffice con tabla de inventario SKU/stock por variante y controles de ciclo de vida (`Publish Product`, `Archive Product`, `Revert to Draft`). |
| `/admin/orders` | Dinámico (`ƒ`) | Admin (`getAdminSession`) | Listado global de órdenes de todos los clientes con referencia, email, cantidad de ítems, insignias de orden/fulfillment y total en USD. |
| `/admin/orders/[reference]` | Dinámico (`ƒ`) | Admin (`getAdminSession`) | Detalle global de orden con líneas congeladas, snapshot de entrega, desglose financiero y controles interactivos de avance secuencial de fulfillment. |

### Endpoints de la API REST (`app/api/**`)

Todos los endpoints mutables o sensibles incluyen la cabecera `Cache-Control: no-store`.

| Endpoint | Métodos | Auth / Identidad | Contrato de Petición y Semántica de Respuesta |
| --- | --- | --- | --- |
| `/api/cart/lines` | `POST`, `PATCH`, `DELETE` | `ja_cart_session` (cookie `httpOnly`) | `POST { variantId, quantity }` agrega 1–10 unidades (emite cookie en la primera adición; `400` si no está disponible o `> stockQty`). `PATCH { lineId, quantity }` actualiza cantidad (`400` si `> stockQty`, `404` si es de otro carrito). `DELETE { lineId }` elimina la línea. |
| `/api/checkout/contact-and-address` | `GET`, `POST` | `ja_cart_session` | `POST { email, recipientName, line1, line2, city, state, zip, country, phone, password? }` valida estado de EE. UU. de 2 letras, ZIP de 5/9 dígitos y contraseña opcional Quick Access (`>= 8` caracteres, letra + dígito), haciendo upsert en `checkout_session`. |
| `/api/checkout/shipping-method` | `POST` | `ja_cart_session` | `POST { shippingMethodId }` asocia un `shipping_method` válido (`standard` o `express`) al `checkout_session` activo y devuelve subtotal/envío/impuesto/total en centavos. |
| `/api/checkout/pay` | `POST` | `ja_cart_session` | `POST { cardToken, paymentScenario? }` invoca `PaymentProvider.createPayment`. En `payment.succeeded`, descuenta stock atómicamente, crea orden `paid` + `order_line`s, crea/vincula `account`, convierte el carrito y envía email de confirmación (`200 { ok: true, orderReference }`). En `payment.failed`, devuelve `402` preservando carrito y stock. Si se agota el stock, devuelve `409 out_of_stock`. |
| `/api/auth/signin` | `POST` | Público | `POST { email, password }` verifica el hash `scrypt`, crea `account_session` y emite la cookie `ja_account_session` (`200 { ok: true, account }`, o `401` si las credenciales son inválidas). |
| `/api/auth/request-code` | `POST` | Público | `POST { email }` genera un OTP numérico de 6 dígitos en `account_access_code` (expira en 15 min) y lo envía mediante `AccessCodeEmailSender` (`200 { ok: true }`, o `404` si la cuenta no existe). |
| `/api/auth/verify-code` | `POST` | Público | `POST { email, code }` verifica y consume (elimina) el OTP de 6 dígitos de un solo uso, crea `account_session` y emite `ja_account_session` (`200 { ok: true, account }`, o `400` si es inválido/expirado). |
| `/api/auth/signout` | `POST` | `ja_account_session` | Elimina la sesión activa en `account_session` y limpia la cookie `ja_account_session` (`200 { ok: true }`). |
| `/api/auth/me` | `GET` | `ja_account_session` | Devuelve `{ authenticated: true, account: { id, email, roles } }` o `{ authenticated: false }`. |
| `/api/account/orders` | `GET` | `ja_account_session` | Devuelve las órdenes pagadas del cliente autenticado (`401` si no ha iniciado sesión). |
| `/api/account/orders/[reference]` | `GET` | `ja_account_session` | Devuelve el detalle de la orden `reference` del cliente autenticado (`401` si no está autenticado, `404` si no existe o pertenece a otra cuenta). |
| `/api/admin/check` | `GET` | `getAdminSession` | Verifica acceso de administrador (`200 { ok: true, admin }` para admins, `401` no autenticado, `403` cliente sin rol admin). |
| `/api/admin/products` | `GET`, `POST` | `getAdminSession` | `GET` lista todos los productos en cualquier estado. `POST` valida la entrada (`validateAdminProductInput`) y crea transaccionalmente un producto `draft` + variantes (`201`). |
| `/api/admin/products/[id]/status` | `PATCH`, `POST` | `getAdminSession` | `PATCH/POST { status }` transiciona el producto entre `draft`, `published` y `archived` (`200`, `400` estado inválido, `404` ID desconocido) y revalida las rutas del storefront. |
| `/api/admin/orders` | `GET` | `getAdminSession` | Lista todas las órdenes de todos los clientes con conteo de líneas y estados de pago/fulfillment (`200`). |
| `/api/admin/orders/[reference]` | `GET` | `getAdminSession` | Devuelve el detalle completo de cualquier orden por `reference` (`200`, `404` referencia desconocida). |
| `/api/admin/orders/[reference]/fulfillment` | `PATCH`, `POST` | `getAdminSession` | `PATCH/POST { fulfillmentStatus }` avanza secuencialmente una orden `paid` (`unfulfilled` -> `preparing` -> `shipped` -> `delivered`). Rechaza órdenes no pagadas o saltos de estado con `400`. |
| `/api/chat` | `POST` | Público | `POST { messages }` enruta la conversación a través de `GuardedChatAssistant` (`200 { message }`, `400` cuerpo inválido, `503` proveedor no configurado en turno abierto, `502` error upstream). |
| `/api/try-on` | `POST` | Público | `multipart/form-data` (`photo`, `productSlug`, `size`, `color`, `consent="accepted"`). Valida la foto en pre-flight (`400 invalid_photo`), resuelve variante publicada (`400 not_available`) e invoca `TryOnProvider` con timeout de `30 s` (`200 { image, garment }`, `504 provider_timeout`, `503 provider_unavailable`, `502 provider_error`). |

---

## 7. Subsistemas de IA: Guardrails Deterministas, Privacidad de Try-On y Resolución en 3 Niveles

### Cadena de Resolución de Proveedores de IA en 3 Niveles (`lib/chat/index.ts` y `lib/try-on/index.ts`)

Tanto `getChatAssistant()` ([`lib/chat/index.ts`](lib/chat/index.ts)) como `getTryOnProvider()` ([`lib/try-on/index.ts`](lib/try-on/index.ts)) resuelven su adaptador de forma perezosa (*lazy*) en tiempo de petición siguiendo una cadena de prioridad de 3 niveles:

| Nivel de Prioridad | Condición de Activación | Adaptador de Chat Assistant y Modelo por Defecto | Adaptador de Virtual Try-On y Modelo por Defecto | Mecanismo de Autenticación |
| --- | --- | --- | --- | --- |
| **Tier 1: Google Cloud Vertex AI** | Existe `gcp-service-account.json` (o `GOOGLE_APPLICATION_CREDENTIALS`) en disco y `USE_VERTEX_AI !== "false"` | [`VertexChatAssistant`](lib/chat/vertex-chat-assistant.ts)<br>(`VERTEX_CHAT_MODEL` o `gemini-2.5-flash`) | [`VertexTryOnProvider`](lib/try-on/vertex-try-on-provider.ts)<br>(`VERTEX_IMAGE_MODEL` o `gemini-2.5-flash-image`) | Aserción JWT RS256 sin SDK firmada vía `node:crypto` en [`lib/ai/google-auth.ts`](lib/ai/google-auth.ts) e intercambiada en `https://oauth2.googleapis.com/token` (cacheada con margen de expiración de 5 min). |
| **Tier 2: Google Gemini API** | `GEMINI_API_KEY` está definida (o `TRYON_PROVIDER="gemini"`) | [`GeminiChatAssistant`](lib/chat/gemini-chat-assistant.ts)<br>(`GEMINI_CHAT_MODEL` o `gemini-3.8-flash`) | [`GeminiTryOnProvider`](lib/try-on/gemini-try-on-provider.ts)<br>(`GEMINI_IMAGE_MODEL` o `gemini-3.1-flash-image`) | Cabecera `x-goog-api-key` contra `https://generativelanguage.googleapis.com/v1beta`. |
| **Tier 3: Gateway Compatible con OpenAI / DevExpert** | `OPENAI_API_KEY` (Chat) o `TRYON_BASE_URL` + `TRYON_MODEL` + (`TRYON_API_KEY` \| `DEVEXPERT_API_KEY` \| `OPENAI_API_KEY`) (Try-On) | [`OpenAiChatAssistant`](lib/chat/openai-chat-assistant.ts)<br>(`CHAT_ASSISTANT_MODEL` o `gpt-4o-mini` en `POST {baseUrl}/chat/completions`) | [`OpenAiImagesTryOnProvider`](lib/try-on/openai-images-try-on-provider.ts)<br>(`TRYON_MODEL` p. ej. `image-edit` en `POST {baseUrl}/images/edits`) | `Authorization: Bearer <apiKey>` sobre HTTP multipart/JSON con `AbortSignal.timeout` de `30 s`. |

### Subsistema 1: Guarded Chat Assistant (`lib/chat/guarded-chat-assistant.ts`)

Documentado en [ADR 0003](docs/adr/0003-chat-assistant-llm-provider.md), [ADR 0004](docs/adr/0004-chat-assistant-guardrails.md) y [`CONSTRAINTS.md`](CONSTRAINTS.md) (#5, #6, #7), el Chat Assistant **jamás confía en que un LLM invente políticas de la tienda, precios, disponibilidad de stock o medidas corporales**:

1. **Rechazo de Consultas Fuera de Alcance y Prompt Injection ([`lib/chat/guardrails/intents.ts`](lib/chat/guardrails/intents.ts)):** Los mensajes que piden ignorar instrucciones, revelar el prompt del sistema, escribir código o hablar de temas ajenos a la tienda se interceptan antes de consultar la BD o el LLM y reciben la respuesta fija `OUT_OF_SCOPE_REPLY`.
2. **Consulta de Políticas Verificadas de la Tienda ([`lib/chat/guardrails/store-knowledge.ts`](lib/chat/guardrails/store-knowledge.ts)):** Las preguntas sobre costos de envío (`Standard gratis 3–5 días hábiles, Express $15.00 tarifa plana 1–2 días hábiles`), regiones de envío (`50 estados de EE. UU. + DC`), impuestos/moneda (`USD sin impuestos en catálogo, sales tax estatal en checkout`), creación de cuenta en el pago o políticas no publicadas (`return_window`, `exchange_policy`, `order_cancellation`, `payment_methods`, `discounts_and_promo_codes`, `physical_stores`) devuelven exactamente el texto revisado en código sin llamar al LLM.
3. **Anclaje Determinista en Catálogo, Variantes y Guía de Tallas ([`product-match.ts`](lib/chat/guardrails/product-match.ts) y [`answer.ts`](lib/chat/guardrails/answer.ts)):**
   - Consulta `listPublishedProductFacts(db)` ([`db/catalog.ts`](db/catalog.ts)), que filtra estrictamente por `status = 'published'` y variantes no descontinuadas (los productos `draft` y `archived` son invisibles).
   - Empareja prendas específicas por nombre/slug o sustantivos genéricos de categoría (`coat`, `blazer`, `trousers`, `dress`, `shirt`, `knitwear`) mediante `CATEGORY_SYNONYMS`.
   - Las preguntas sobre precios, tallas/ajuste (medidas corporales de `size_chart` en pulgadas para las tallas ofrecidas), materiales/cuidados y stock de variantes se responden de forma determinista a partir de las filas de PostgreSQL formateadas con `formatPriceUSD`. Como estos turnos no invocan al LLM, funcionan incluso sin API keys configuradas.
4. **Verificación Post-LLM de Montos en Dólares ([`lib/chat/guardrails/answer-guard.ts`](lib/chat/guardrails/answer-guard.ts)):** Solo las conversaciones abiertas de estilismo dentro del alcance llegan al adaptador `ChatAssistant`, inyectando como contexto del sistema únicamente los datos publicados y políticas verificadas. Antes de entregar la respuesta del LLM, `guardLlmAnswer()` extrae cada monto con `$` en el texto, lo normaliza al formato canónico `$X.XX` y comprueba **pertenencia exacta al conjunto** de precios publicados y tarifas de envío verificadas (`$0.00`, `$15.00`). Cualquier respuesta que contenga una cifra en dólares no verificada se descarta y se reemplaza por `UNVERIFIED_PRICE_FALLBACK`.

#### Diagrama 2: Pipeline Determinista de Guardrails del Chat Assistant y Fallback al LLM

```mermaid
flowchart TD
  Req["POST /api/chat ({ messages })"] --> Validate["Validar Array de Mensajes No Vacío y Prompt del Usuario"]
  Validate -- "Payload Inválido" --> Err400["HTTP 400 { error } (Cache-Control: no-store)"]
  Validate -- "Mensaje Válido" --> Classify["Clasificar Intención (lib/chat/guardrails/intents.ts)"]

  Classify -- "Fuera de Alcance o Prompt Injection" --> Refusal["Devolver OUT_OF_SCOPE_REPLY Fijo (Sin Llamar al LLM)"]
  Classify -- "Política de Tienda (envío, devoluciones, impuestos, etc.)" --> Policy["Consultar STORE_POLICIES (store-knowledge.ts)"]
  Policy --> PolicyReply["Devolver Copy Exacto Verificado / No Publicado (Sin Llamar al LLM)"]

  Classify -- "Precio / Tallas / Info de Producto / Turno Abierto" --> ReadDB["Cargar Datos Publicados (listPublishedProductFacts en db/catalog.ts)"]
  ReadDB --> Match["Emparejar Producto por Nombre, Slug o Sinónimo de Categoría (product-match.ts)"]

  Match -- "Intención de Precio (Producto Publicado Emparejado)" --> PriceReply["Formatear Precio Exacto USD vía formatPriceUSD (Sin Llamar al LLM)"]
  Match -- "Intención de Precio (No Emparejado / Draft / Archived)" --> UnpubPrice["Devolver UNKNOWN_PRODUCT_PRICE_REPLY (Sin Llamar al LLM)"]

  Match -- "Intención de Tallas y Ajuste" --> SizeCheck{"¿El Producto Tiene Filas en size_chart?"}
  SizeCheck -- "Sí" --> SizeReply["Formatear Variantes Disponibles + Medidas en Pulgadas (Sin Llamar al LLM)"]
  SizeCheck -- "Sin Tabla / Sin Coincidencia" --> NoChartReply["Devolver NO_SIZE_CHART_REPLY o SIZE_GUIDE_PROMPT_REPLY (Sin Llamar al LLM)"]

  Match -- "Intención de Material / Cuidados / Stock" --> InfoReply["Formatear Composición, Cuidados, Precio y Stock (Sin Llamar al LLM)"]

  Match -- "Turno Abierto de Estilismo Dentro del Alcance" --> ResolveLLM["Resolver Adaptador en 3 Niveles (Vertex AI -> Gemini API -> OpenAI)"]
  ResolveLLM --> CallLLM["Invocar inner.answer() con Hechos Verificados e Instrucciones Inyectadas"]
  CallLLM --> GuardAnswer["guardLlmAnswer() (answer-guard.ts): Extraer Todos los Montos en Dólares"]
  GuardAnswer -- "Todos los Montos $ Están en el Conjunto Canónico Permitido" --> SafeReply["Devolver Respuesta del LLM Anclada (HTTP 200)"]
  GuardAnswer -- "Contiene algún Monto $ No Verificado" --> StripReply["Descartar Respuesta -> Devolver UNVERIFIED_PRICE_FALLBACK (HTTP 200)"]
```

### Subsistema 2: Virtual Try-On y Privacidad Zero-Persistence en Memoria (`lib/try-on/`)

Regido por [`CONSTRAINTS.md`](CONSTRAINTS.md) (#8, #9) y [`docs/user-and-access-model.md`](docs/user-and-access-model.md):

1. **Validación Pre-Flight Autoritativa de Fotos ([`lib/try-on/photo-validation.ts`](lib/try-on/photo-validation.ts)):**
   - Se ejecuta tanto en el selector del cliente (para retroalimentación inmediata) como en `POST /api/try-on` (compuerta autoritativa **antes** de invocar `getTryOnGarmentContext` o `getTryOnProvider`).
   - Exige: (a) archivo no vacío, (b) lista blanca de MIME declarado (`image/jpeg`, `image/png`, `image/webp` — rechaza HEIC/AVIF/SVG/PDF), (c) tamaño máximo inclusivo de `4 MiB` (`4 * 1024 * 1024 = 4,194,304` bytes), y (d) verificación de firma por *magic bytes* (`FF D8 FF` para JPEG, `89 50 4E 47 0D 0A 1A 0A` para PNG, `RIFF....WEBP` para WebP). Las extensiones falsificadas o archivos mayores a 4 MiB devuelven de inmediato `400 { code: "invalid_photo" }`.
2. **Contexto de Prenda Publicada Resuelto en Servidor:** Resuelve la prenda objetivo desde `db/catalog.ts` (`getTryOnGarmentContext`), exigiendo un producto `published` y una variante `(size, color)` no descontinuada (las variantes sin stock siguen siendo elegibles para prueba visual). Lee la imagen SVG/raster local desde `public/images/products/` cuando está disponible para que los modelos multimodales (`VertexTryOnProvider`, `GeminiTryOnProvider`) reciban tanto la foto del comprador como la referencia visual real de la prenda.
3. **Timeout Acotado y Mapeo de Errores Recuperables:** Cada llamada al proveedor está acotada por un `AbortSignal.timeout` de `30,000 ms` (`30 s`). Los timeouts se mapean a `TryOnProviderError(kind: "timeout")` -> HTTP `504 { code: "provider_timeout" }`; la falta de configuración o fallos de BD se mapean a `503 { code: "provider_unavailable" }`; los errores del proveedor upstream se mapean a `502 { code: "provider_error" }`. Ante errores reintentables (`502`/`503`/`504`), el panel cliente conserva en memoria el objeto `File`, la talla, el color y la casilla de consentimiento para que al pulsar **"Try again"** se reenvíe la petición sin obligar al usuario a elegir el archivo otra vez.
4. **Garantía Estricta de Privacidad Zero-Persistence:**
   - **Sin Tablas ni Columnas en Base de Datos:** [`db/schema/index.ts`](db/schema/index.ts) omite explícitamente cualquier tabla de try-on.
   - **Sin Disco, Archivos Temporales, Object Storage ni Almacenamiento en Navegador:** Los bytes de la foto viven únicamente en un `Uint8Array` en memoria durante la petición HTTP y en el estado de React (`useState`) en el cliente. Nunca se escribe en `localStorage`, `sessionStorage`, `indexedDB` ni en el sistema de archivos.
   - **Sin Caché ni Logs Sensibles:** Todas las respuestas llevan `Cache-Control: no-store`. Los logs de error del servidor registran únicamente mensajes fijos y el `kind`/`status` del error — jamás bytes de imagen, cadenas base64, data URLs ni cuerpos de respuesta del proveedor.

#### Diagrama 3: Secuencia de Privacidad en Memoria y Resolución Multi-Proveedor del Virtual Try-On

```mermaid
sequenceDiagram
  autonumber
  actor Shopper as Comprador
  participant Panel as "TryOnPanel (Solo Estado React en Memoria)"
  participant API as "POST /api/try-on (Route Handler)"
  participant Validator as "photo-validation.ts (4 MiB + Magic Bytes)"
  participant CatalogDB as "db/catalog.ts (getTryOnGarmentContext)"
  participant Factory as "lib/try-on/index.ts (getTryOnProvider)"
  participant Provider as "TryOnProvider (Vertex AI / Gemini / OpenAI Images)"

  Shopper->>Panel: Selecciona Talla/Color, Elige Foto (JPEG/PNG/WebP <= 4 MiB) y Acepta Consentimiento
  Panel->>Validator: validateTryOnPhotoSelection(file) (Pre-Flight en Cliente)
  alt Archivo Inválido en Cliente (MIME no soportado o > 4 MiB)
    Validator-->>Panel: { valid: false, message }
    Panel-->>Shopper: Limpia Input de Archivo y Muestra Alerta role="alert" (Sin Petición HTTP)
  else Selección Válida en Cliente
    Shopper->>Panel: Pulsa "Try on"
    Panel->>API: POST multipart/form-data (photo, productSlug, size, color, consent="accepted")
    API->>Validator: validateTryOnPhotoSelection + sniffTryOnPhotoMimeType(bytes)
    alt Vacío, > 4 MiB, MIME No Soportado o Magic Bytes Falsificados
      Validator-->>API: Rechazo (invalid_photo)
      API-->>Panel: HTTP 400 { code: "invalid_photo" } (Cache-Control: no-store)
      Panel-->>Shopper: Limpia Selección y Muestra Mensaje Fijo de Validación
    else Bytes de Foto Válidos en Memoria
      API->>CatalogDB: getTryOnGarmentContext(db, productSlug, size, color)
      alt Producto Draft, Archived, Variante Descontinuada o Inexistente
        CatalogDB-->>API: null
        API-->>Panel: HTTP 400 { code: "not_available" } (Cache-Control: no-store)
      else Producto Publicado y Variante Activa Resuelta
        API->>Factory: getTryOnProvider() (Tier 1 Vertex -> Tier 2 Gemini -> Tier 3 OpenAI/DevExpert)
        API->>Provider: generateTryOn({ photo, garment, prompt }) [AbortSignal.timeout(30_000)]
        alt Timeout del Proveedor (> 30 s)
          Provider-->>API: TryOnProviderError (kind: "timeout")
          API-->>Panel: HTTP 504 { code: "provider_timeout" } (Cache-Control: no-store)
          Panel-->>Shopper: Conserva Foto/Consentimiento en Memoria y Habilita Botón "Try again"
        else Fallo Upstream del Proveedor
          Provider-->>API: TryOnProviderError (kind: "upstream")
          API-->>Panel: HTTP 502 { code: "provider_error" } (Cache-Control: no-store)
          Panel-->>Shopper: Conserva Foto/Consentimiento en Memoria y Habilita Botón "Try again"
        else Generación Exitosa
          Provider-->>API: TryOnResult { image: { kind: "base64", mimeType, data } }
          API-->>Panel: HTTP 200 { image, garment } (Cache-Control: no-store, Zero Persistence)
          Panel-->>Shopper: Renderiza Vista Previa Generada en Memoria
        end
      end
    end
  end
```

---

## 8. Checkout Guest-First, Reserva Atómica de Stock y Ciclo de Vida de Identidad

Implementado en [`db/checkout.ts`](db/checkout.ts), [`db/order.ts`](db/order.ts), [`lib/tax/sales-tax.ts`](lib/tax/sales-tax.ts), [`payments/simulated-provider.ts`](payments/simulated-provider.ts) y [`app/api/checkout/pay/route.ts`](app/api/checkout/pay/route.ts), el checkout sigue un pipeline guest-first de 3 pasos:

1. **Paso 1 — Contacto y Dirección de Envío en EE. UU. (`POST /api/checkout/contact-and-address`):** Valida email, nombre del destinatario, dirección postal, código de estado de EE. UU. de 2 letras (`AL`..`WY` + `DC`) y código ZIP de 5 o 9 dígitos. Si el comprador introduce una contraseña opcional **Quick Access** (`>= 8` caracteres con al menos una letra y un dígito), se hashea inmediatamente con `scrypt` (`hashPassword`) y se guarda en `checkout_session.password_hash`.
2. **Paso 2 — Método de Envío (`POST /api/checkout/shipping-method`):** Vincula el `shipping_method` seleccionado (`standard` a `0` centavos o `express` a `1500` centavos) con `checkout_session`.
3. **Paso 3 — Sales Tax por Destino y Ejecución Atómica del Pago (`POST /api/checkout/pay`):**
   - **Verificación Previa de Stock:** `createPaidOrderFromCheckout` verifica que el carrito no esté vacío y que todas las líneas tengan `stockQty` suficiente antes de invocar `PaymentProvider.createPayment`.
   - **Ejecución del Pago Simulado:** Invoca `PaymentProvider.createPayment`. Si el pago devuelve `payment.failed` (p. ej. `card_declined`), **no se crea ninguna orden pagada**, el stock de las variantes y el `cart` permanecen intactos, y el comprador puede reintentar en la misma pantalla (`HTTP 402`).
   - **Reserva Atómica de Stock Libre de Deadlocks:** Dentro de una única transacción de PostgreSQL (`db.transaction`), las líneas del carrito se ordenan de forma determinista por `variantId` (`localeCompare`) y cada variante se descuenta mediante un `UPDATE` condicional atómico:
     ```sql
     UPDATE variant
     SET stock_qty = stock_qty - $qty
     WHERE id = $variantId
       AND discontinued = false
       AND stock_qty >= $qty
     RETURNING id, stock_qty;
     ```
     Si un checkout concurrente reclamó la última unidad milisegundos antes, el `UPDATE` devuelve `0` filas, la transacción lanza `InsufficientStockError`, hace rollback completo y la ruta responde `409 { code: "out_of_stock" }`.
   - **Creación o Vinculación de Cuenta al Momento del Pago:** Dentro de la misma transacción, se busca el email normalizado en minúsculas en `account`. Si no existe cuenta, se inserta una nueva fila en `account` (con `checkout_session.password_hash` si se proporcionó). Si la cuenta ya existe, la orden se vincula a ella (y solo rellena `password_hash` si la cuenta existente aún no tenía contraseña, sin sobrescribir jamás una contraseña previa). Se asegura la fila en `account_role` (`role = 'customer'`) con `ON CONFLICT DO NOTHING`.
   - **Snapshot Congelado de la Orden y Email No Bloqueante:** Inserta `address`, `order` (`status = 'paid'`, `fulfillment_status = 'unfulfilled'`, totales congelados `subtotal_cents`, `shipping_cents`, `tax_cents`, `total_cents`), snapshots congelados en `order_line` (`product_name`, `variant_size`, `variant_color`, `unit_price_cents`) y `payment` (`status = 'succeeded'`), y marca `cart.status = 'converted'`. Finalmente, `OrderConfirmationEmailSender.send()` se ejecuta dentro de un bloque `try/catch` no bloqueante para que un fallo en el servidor de correo jamás revierta una compra ya pagada.

### Diagrama 4: Secuencia de Checkout Guest-First, Reserva Atómica de Stock y Vinculación de Cuenta

```mermaid
sequenceDiagram
  autonumber
  actor Shopper as Comprador
  participant CheckoutUI as "/checkout (Formulario Cliente de 3 Pasos)"
  participant PayAPI as "POST /api/checkout/pay"
  participant OrderRepo as "db/order.ts (createPaidOrderFromCheckout)"
  participant PayPort as "PaymentProvider (SimulatedPaymentProvider)"
  participant PG as "PostgreSQL 17 (Transacción)"
  participant EmailPort as "OrderConfirmationEmailSender"

  Shopper->>CheckoutUI: Completa Paso 1 (Email, Dirección US, Contraseña Opcional) y Paso 2 (Envío)
  Shopper->>CheckoutUI: Envía Pago en Paso 3 (Card Token / Escenario)
  CheckoutUI->>PayAPI: POST /api/checkout/pay ({ cardToken, paymentScenario })
  PayAPI->>OrderRepo: createPaidOrderFromCheckout(db, sessionToken, paymentProvider, ...)
  OrderRepo->>PG: Carga Líneas Activas del Carrito + CheckoutSession + ShippingMethod + TaxCents
  OrderRepo->>PayPort: createPayment({ reference: "JA-XXXXXX", amountCents: totalCents, currency: "USD", cardToken })

  alt Pago Rechazado (payment.failed)
    PayPort-->>OrderRepo: { type: "payment.failed", reason: "card_declined" }
    OrderRepo-->>PayAPI: { ok: false, code: "payment_failed" } (Cero Escrituras en BD, Carrito y Stock Intactos)
    PayAPI-->>CheckoutUI: HTTP 402 { error, outcome }
    CheckoutUI-->>Shopper: Muestra Aviso de Pago Fallido Reintentable
  else Pago Exitoso (payment.succeeded)
    PayPort-->>OrderRepo: { type: "payment.succeeded", providerRef: "sim_JA-XXXXXX" }
    OrderRepo->>PG: BEGIN TRANSACTION (Ordena Líneas del Carrito por variantId ASC)
    loop Por Cada Línea Ordenada del Carrito
      OrderRepo->>PG: UPDATE variant SET stock_qty = stock_qty - qty WHERE id = ? AND discontinued = false AND stock_qty >= qty
    end
    alt Alguna Variante No Tiene Stock Suficiente (Carrera Concurrente por la Última Unidad)
      PG-->>OrderRepo: 0 Filas Actualizadas -> Lanza InsufficientStockError y ROLLBACK
      OrderRepo-->>PayAPI: { ok: false, code: "out_of_stock", details }
      PayAPI-->>CheckoutUI: HTTP 409 { code: "out_of_stock" }
      CheckoutUI-->>Shopper: Muestra Alerta de Stock Agotado y Conserva el Carrito para Ajustar
    else Todas las Variantes Reservadas Atómicamente
      OrderRepo->>PG: Busca o Crea account (Email en Minúsculas + password_hash scrypt Opcional)
      OrderRepo->>PG: INSERT account_role (role = "customer") ON CONFLICT DO NOTHING
      OrderRepo->>PG: INSERT address + order (status="paid", fulfillment="unfulfilled", totales congelados)
      OrderRepo->>PG: INSERT Snapshots Congelados en order_line + payment (status="succeeded")
      OrderRepo->>PG: UPDATE cart SET status = "converted", account_id = account.id + DELETE checkout_session
      OrderRepo->>PG: COMMIT TRANSACTION
      OrderRepo->>EmailPort: send(OrderConfirmationEmailPayload) [try/catch No Bloqueante]
      OrderRepo-->>PayAPI: { ok: true, order }
      PayAPI-->>CheckoutUI: HTTP 200 { ok: true, orderReference: "JA-XXXXXX" }
      CheckoutUI-->>Shopper: Redirige a /checkout/confirmation/JA-XXXXXX
    end
  end
```

---

## 9. Capa de Datos PostgreSQL 17: 17 Tablas, 7 Enums, Migraciones y Seeds

### Los 7 Enums de PostgreSQL (`db/schema/enums.ts`)

| Nombre del Enum (`pgEnum`) | Valores Permitidos | Uso en el Dominio |
| --- | --- | --- |
| `product_status` | `'draft'`, `'published'`, `'archived'` | Controla la visibilidad en `/catalog`, `/products/[slug]`, Chat Assistant y Virtual Try-On |
| `variant_size` | `'XS'`, `'S'`, `'M'`, `'L'`, `'XL'` | Escala de tallas estándar de EE. UU. compartida entre `variant` y `size_chart` |
| `cart_status` | `'active'`, `'converted'`, `'expired'` | Ciclo de vida del carrito de sesión invitado (`active` hasta convertirse en una orden `paid`) |
| `account_role_name` | `'customer'`, `'admin'` | Filas de asignación multi-rol en la tabla `account_role` |
| `order_status` | `'created'`, `'paid'`, `'failed'`, `'cancelled'` | Ciclo de vida financiero de una orden (`paid` tras pago exitoso + reserva atómica de stock) |
| `fulfillment_status` | `'unfulfilled'`, `'preparing'`, `'shipped'`, `'delivered'` | Ciclo de vida logístico secuencial para órdenes `paid` (gestionado en `/admin/orders/[reference]`) |
| `payment_status` | `'pending'`, `'succeeded'`, `'failed'`, `'cancelled'` | Estado del intento de pago registrado en `payment` |

### Inventario Completo de las 17 Tablas (`db/schema/*.ts`)

| # | Nombre de Tabla | Archivo de Esquema | Clave Primaria y Claves Naturales / Restricciones | Columnas Principales y Propósito |
| --- | --- | --- | --- | --- |
| 1 | `category` | [`db/schema/catalog.ts`](db/schema/catalog.ts) | `id` (`uuid`), `UNIQUE(slug)` | `slug`, `name`, `sort_order`. Taxonomía de productos (`coats`, `blazers`, `trousers`, `dresses`, `shirts`, `knitwear`). |
| 2 | `product` | [`db/schema/catalog.ts`](db/schema/catalog.ts) | `id` (`uuid`), `UNIQUE(slug)`, `INDEX(status)` | `slug`, `name`, `description`, `composition`, `care`, `base_price_cents` (`bigint`), `currency` (`'USD'`), `category_id` (FK), `status` (`product_status`). |
| 3 | `product_image` | [`db/schema/catalog.ts`](db/schema/catalog.ts) | `id` (`uuid`), `UNIQUE(product_id, position)` | `product_id` (FK), `path`, `alt_text`, `position` (orden de visualización base 0). |
| 4 | `variant` | [`db/schema/catalog.ts`](db/schema/catalog.ts) | `id` (`uuid`), `UNIQUE(product_id, size, color)`, `UNIQUE(sku)`, `CHECK(stock_qty >= 0)` | `product_id` (FK), `size` (`variant_size`), `color`, `color_hex`, `sku`, `price_override_cents` (`bigint` nullable), `stock_qty`, `discontinued`. |
| 5 | `size_chart` | [`db/schema/catalog.ts`](db/schema/catalog.ts) | `id` (`uuid`), `UNIQUE(category_id, size)` | `category_id` (FK), `size` (`variant_size`), `measurements` (`jsonb` con rangos corporales en pulgadas: `chest`, `waist`, `hip`, `sleeve`, `length`, `inseam`, `rise`). |
| 6 | `account` | [`db/schema/account.ts`](db/schema/account.ts) | `id` (`uuid`), `UNIQUE(email)`, `CHECK(email = lower(email))` | `email` (en minúsculas), `password_hash` (`scrypt` `<saltHex>:<keyHex>` nullable), `created_at`, `updated_at`. |
| 7 | `account_role` | [`db/schema/account.ts`](db/schema/account.ts) | `id` (`uuid`), `UNIQUE(account_id, role)` | `account_id` (FK), `role` (`account_role_name`: `'customer'` \| `'admin'`). |
| 8 | `address` | [`db/schema/account.ts`](db/schema/account.ts) | `id` (`uuid`) | `account_id` (FK nullable), `recipient_name`, `line1`, `line2`, `city`, `state` (`char(2)`), `zip`, `country` (`'US'`), `phone`. |
| 9 | `account_session` | [`db/schema/account.ts`](db/schema/account.ts) | `id` (`uuid`), `UNIQUE(session_token)` | `account_id` (FK `ON DELETE CASCADE`), `session_token` (token de cookie `ja_account_session`), `expires_at` (30 días), `created_at`. |
| 10 | `account_access_code` | [`db/schema/account.ts`](db/schema/account.ts) | `id` (`uuid`) | `account_id` (FK `ON DELETE CASCADE`), `code` (OTP numérico de 6 dígitos), `expires_at` (15 minutos), `created_at`. Se elimina al usarse. |
| 11 | `cart` | [`db/schema/cart.ts`](db/schema/cart.ts) | `id` (`uuid`), `UNIQUE(session_token)` | `session_token` (token de cookie `ja_cart_session`), `account_id` (FK nullable), `status` (`cart_status`), `created_at`, `updated_at`. |
| 12 | `cart_line` | [`db/schema/cart.ts`](db/schema/cart.ts) | `id` (`uuid`), `UNIQUE(cart_id, variant_id)`, `CHECK(quantity > 0)` | `cart_id` (FK), `variant_id` (FK), `quantity` (`integer` 1..10). |
| 13 | `checkout_session` | [`db/schema/order.ts`](db/schema/order.ts) | `id` (`uuid`), `UNIQUE(cart_id)` | `cart_id` (FK `ON DELETE CASCADE`), `email`, `recipient_name`, `line1`, `line2`, `city`, `state`, `zip`, `country`, `phone`, `password_hash`, `shipping_method_id` (FK). |
| 14 | `shipping_method` | [`db/schema/order.ts`](db/schema/order.ts) | `id` (`uuid`), `UNIQUE(slug)` | `slug` (`standard` / `express`), `name`, `description`, `cost_cents` (`bigint`: `0` / `1500`), `delivery_estimate`. |
| 15 | `order` | [`db/schema/order.ts`](db/schema/order.ts) | `id` (`uuid`), `UNIQUE(reference)` | `reference` (`JA-XXXXXX`), `account_id` (FK nullable), `contact_email`, `status` (`order_status`), `fulfillment_status`, `address_id` (FK), `shipping_method_id` (FK), totales congelados `subtotal_cents`, `shipping_cents`, `tax_cents`, `total_cents`, `currency` (`'USD'`), `created_at`, `paid_at`. |
| 16 | `order_line` | [`db/schema/order.ts`](db/schema/order.ts) | `id` (`uuid`) | `order_id` (FK), `variant_id` (FK nullable), snapshots congelados `product_name`, `variant_size`, `variant_color`, `unit_price_cents` (`bigint`), `quantity`, `line_total_cents` (`bigint`). |
| 17 | `payment` | [`db/schema/order.ts`](db/schema/order.ts) | `id` (`uuid`) | `order_id` (FK), `status` (`payment_status`), `provider` (`'simulated'`), `amount_cents` (`bigint`), `created_at`, `updated_at`. |

### Historial de Migraciones Drizzle Versionadas (`db/migrations/`)

| Etiqueta de Migración | Archivo SQL | Cambios de Esquema Introducidos |
| --- | --- | --- |
| `0000_bumpy_lifeguard` | [`db/migrations/0000_bumpy_lifeguard.sql`](db/migrations/0000_bumpy_lifeguard.sql) | Crea los 7 tipos `pgEnum` iniciales y las 13 tablas base (`category`, `product`, `product_image`, `variant`, `account`, `account_role`, `address`, `cart`, `cart_line`, `shipping_method`, `order`, `order_line`, `payment`). |
| `0001_needy_malice` | [`db/migrations/0001_needy_malice.sql`](db/migrations/0001_needy_malice.sql) | Crea la tabla `size_chart` (`category_id`, `size`, `measurements` JSONB, `UNIQUE(category_id, size)`). |
| `0002_daily_gabe_jones` | [`db/migrations/0002_daily_gabe_jones.sql`](db/migrations/0002_daily_gabe_jones.sql) | Crea la tabla `checkout_session` (`UNIQUE(cart_id)`) y agrega la columna `recipient_name` a `address`. |
| `0003_freezing_vargas` | [`db/migrations/0003_freezing_vargas.sql`](db/migrations/0003_freezing_vargas.sql) | Agrega la clave foránea `shipping_method_id` a `checkout_session`. |
| `0004_mean_texas_twister` | [`db/migrations/0004_mean_texas_twister.sql`](db/migrations/0004_mean_texas_twister.sql) | Agrega el valor `'unfulfilled'` al enum `fulfillment_status` (antes de `'preparing'`) y hace nullable `order.account_id`. |
| `0005_dark_warbird` | [`db/migrations/0005_dark_warbird.sql`](db/migrations/0005_dark_warbird.sql) | Agrega la columna `password_hash` a `checkout_session` para la creación opcional de contraseña Quick Access en el checkout. |
| `0006_fresh_zombie` | [`db/migrations/0006_fresh_zombie.sql`](db/migrations/0006_fresh_zombie.sql) | Crea las tablas `account_session` y `account_access_code` para sesiones de cliente/admin y autenticación OTP de 6 dígitos por email. |

### Diagrama 5: Diagrama Entidad-Relación de las 17 Tablas en PostgreSQL (`erDiagram`)

```mermaid
erDiagram
  category ||--o{ product : "categorizes"
  category ||--o{ size_chart : "defines_measurements"
  product ||--o{ product_image : "displays"
  product ||--o{ variant : "has_matrix"

  account ||--o{ account_role : "grants"
  account ||--o{ account_session : "authenticates"
  account ||--o{ account_access_code : "verifies_otp"
  account ||--o{ address : "stores"
  account ||--o{ cart : "links_on_pay"
  account ||--o{ order : "places"

  cart ||--o{ cart_line : "contains"
  variant ||--o{ cart_line : "selected_in"
  cart ||--o| checkout_session : "stages"
  shipping_method ||--o{ checkout_session : "chosen_in"

  address ||--o{ order : "ships_to"
  shipping_method ||--o{ order : "delivers_via"
  order ||--o{ order_line : "freezes"
  variant ||--o{ order_line : "snapshot_of"
  order ||--o{ payment : "settled_by"

  category {
    uuid id PK
    text slug UK
    text name
    integer sort_order
  }
  product {
    uuid id PK
    text slug UK
    text name
    bigint base_price_cents
    char currency
    uuid category_id FK
    product_status status
  }
  product_image {
    uuid id PK
    uuid product_id FK
    text path
    text alt_text
    integer position
  }
  variant {
    uuid id PK
    uuid product_id FK
    variant_size size
    text color
    text color_hex
    text sku UK
    bigint price_override_cents
    integer stock_qty
    boolean discontinued
  }
  size_chart {
    uuid id PK
    uuid category_id FK
    variant_size size
    jsonb measurements
  }
  account {
    uuid id PK
    text email UK
    text password_hash
    timestamptz created_at
  }
  account_role {
    uuid id PK
    uuid account_id FK
    account_role_name role
  }
  account_session {
    uuid id PK
    uuid account_id FK
    text session_token UK
    timestamptz expires_at
  }
  account_access_code {
    uuid id PK
    uuid account_id FK
    text code
    timestamptz expires_at
  }
  address {
    uuid id PK
    uuid account_id FK
    text recipient_name
    text line1
    char state
    text zip
    char country
  }
  cart {
    uuid id PK
    text session_token UK
    uuid account_id FK
    cart_status status
  }
  cart_line {
    uuid id PK
    uuid cart_id FK
    uuid variant_id FK
    integer quantity
  }
  checkout_session {
    uuid id PK
    uuid cart_id FK
    text email
    text recipient_name
    char state
    text zip
    text password_hash
    uuid shipping_method_id FK
  }
  shipping_method {
    uuid id PK
    text slug UK
    text name
    bigint cost_cents
    text delivery_estimate
  }
  order {
    uuid id PK
    text reference UK
    uuid account_id FK
    text contact_email
    order_status status
    fulfillment_status fulfillment_status
    uuid address_id FK
    uuid shipping_method_id FK
    bigint subtotal_cents
    bigint shipping_cents
    bigint tax_cents
    bigint total_cents
  }
  order_line {
    uuid id PK
    uuid order_id FK
    uuid variant_id FK
    text product_name
    text variant_size
    text variant_color
    bigint unit_price_cents
    integer quantity
    bigint line_total_cents
  }
  payment {
    uuid id PK
    uuid order_id FK
    payment_status status
    text provider
    bigint amount_cents
  }
```

### Diagrama 6: Máquinas de Estado de Producto, Carrito, Orden, Pago y Fulfillment (`stateDiagram-v2`)

```mermaid
stateDiagram-v2
  direction LR

  state "Ciclo de Vida de Producto (product_status)" as ProductSM {
    [*] --> draft : "Admin crea producto"
    draft --> published : "Publish Product"
    draft --> archived : "Archive Product"
    published --> archived : "Archive Product"
    published --> draft : "Revert to Draft"
    archived --> published : "Publish Product"
    archived --> draft : "Revert to Draft"
  }

  state "Ciclo de Vida de Carrito (cart_status)" as CartSM {
    [*] --> active : "Primer POST /api/cart/lines"
    active --> converted : "Pago Exitoso (Orden Creada)"
    active --> expired : "Sesión Expirada"
  }

  state "Ciclo de Vida de Orden y Fulfillment" as OrderSM {
    [*] --> created : "Orden Inicializada"
    created --> paid : "payment.succeeded + Stock Reservado"
    created --> failed : "payment.failed"
    created --> cancelled : "Orden Cancelada"

    state paid {
      [*] --> unfulfilled : "Estado Pagado Inicial"
      unfulfilled --> preparing : "Admin: Mark as Preparing"
      preparing --> shipped : "Admin: Mark as Shipped"
      shipped --> delivered : "Admin: Mark as Delivered"
    }
  }
```

### Inventario del Seed Demo Idempotente (`pnpm db:seed`)

Definido en [`db/seed-data.ts`](db/seed-data.ts) y ejecutado por [`db/seed.ts`](db/seed.ts) usando semántica estricta `ON CONFLICT DO NOTHING` dentro de una sola transacción:
- **6 Categorías:** `Coats` (`coats`), `Blazers` (`blazers`), `Dresses` (`dresses`), `Knitwear` (`knitwear`), `Shirts` (`shirts`), `Trousers` (`trousers`).
- **9 Productos (`6` `published`, `2` `draft`, `1` `archived`):**
  - *Publicados (6):* `Longline Wool Overcoat` (`$349.00`), `Double-Breasted Linen Blazer` (`$249.00`), `Silk Slip Midi Dress` (`$189.00`), `Merino Crewneck Sweater` (`$129.00`), `Cotton Poplin Shirt` (`$89.00`), `Pleated Wool Trousers` (`$159.00`).
  - *Borrador / Draft (2):* `Cropped Tweed Jacket` (`$219.00`), `Ribbed Knit Cardigan` (`$145.00`).
  - *Archivado / Archived (1):* `Satin Evening Gown` (`$299.00`).
- **40 Variantes:** Cubren tallas `XS`–`XL`, múltiples colores con muestras hexadecimales, códigos SKU, precios personalizados por variante (`price_override_cents`), variantes agotadas (`stock_qty = 0`) y variantes descontinuadas (`discontinued = true`) para ejercitar todos los filtros y casos borde del storefront.
- **16 Imágenes de Producto:** Ilustraciones editoriales SVG con proporción 3:4 bajo `public/images/products/`.
- **30 Filas de Tabla de Tallas (`size_chart`):** `6 categorías × 5 tallas (XS–XL)` con rangos de medidas corporales de EE. UU. en pulgadas.
- **2 Métodos de Envío:** `Standard Shipping` (`$0.00`, `3–5 business days`) y `Express Shipping` (`$15.00`, `1–2 business days`).
- **Cuenta Admin de Backoffice por Defecto:**
  - **Email:** `admin@j-armando.store`
  - **Contraseña:** `Admin123!`
  - **Roles:** `admin`, `customer`

---

## 10. Restricciones Durables de Ingeniería y Registros de Decisiones de Arquitectura (ADRs)

### Las 10 Reglas Durables (`CONSTRAINTS.md`)

Cada feature de este repositorio cumple las 10 reglas codificadas en [`CONSTRAINTS.md`](CONSTRAINTS.md):

1. **Dinero en Centavos Enteros (`#1`):** El dinero DEBE almacenarse y calcularse como centavos enteros (`bigint`) en `currency char(3) = 'USD'`; los precios del catálogo no incluyen impuestos y el sales tax estatal de EE. UU. se suma en el checkout.
2. **Migraciones Aplicadas Inmutables (`#2`):** Los cambios de esquema DEBEN realizarse mediante nuevas migraciones generadas (`pnpm db:generate`); los archivos SQL ya aplicados en `db/migrations/` NO DEBEN editarse manualmente.
3. **Seeds Insert-If-Missing (`#3`):** Los scripts de seed DEBEN ser *insert-if-missing* (`ON CONFLICT DO NOTHING` sobre claves naturales en una sola transacción) y NO DEBEN actualizar ni eliminar filas existentes.
4. **Suite de Pruebas Autocontenida (`#4`):** La suite de pruebas automatizada NO DEBE requerir Docker, una instalación local de PostgreSQL ni bases de datos preconfiguradas (`db/tests/global-setup.ts` levanta un servidor PostgreSQL 17 embebido y efímero por ejecución).
5. **Pruebas de IA Offline y sin Claves (`#5`):** La suite de pruebas automatizada NO DEBE realizar llamadas en vivo a proveedores externos de IA ni requerir API keys; los adaptadores aceptan un *seam* de transporte `fetch` inyectable.
6. **Aislamiento por Puertos Hexagonales (`#6`):** Las capacidades externas de IA y pagos DEBEN residir detrás de puertos propios del repositorio (`ChatAssistant`, `TryOnProvider`, `PaymentProvider`, `EmailSender`); la UI y las rutas dependen únicamente del puerto.
7. **Datos del Chat Solo Verificados (`#7`):** Las políticas de tienda, precios, atributos de producto y medidas de `size_chart` expuestos al comprador DEBEN provenir de forma determinista de [`store-knowledge.ts`](lib/chat/guardrails/store-knowledge.ts) y de filas publicadas en la BD — nunca de la salida del LLM — y cualquier respuesta del LLM con un monto en dólares no verificado DEBE descartarse (`guardLlmAnswer`).
8. **Privacidad Zero-Persistence en Try-On (`#8`):** Las fotos y resultados del try-on NO DEBEN persistirse, cachearse ni registrarse en logs (sin tabla/columna en BD, sin archivos en disco/temporales, sin object storage, sin `localStorage`/`IndexedDB`, con `Cache-Control: no-store`).
9. **Validación Pre-Flight de Fotos y Llamadas Acotadas (`#9`):** El try-on DEBE validar las fotos (`JPEG`/`PNG`/`WebP`, `<= 4 MiB` inclusivo, firma de *magic bytes*) antes de cualquier consulta al catálogo o proveedor, y acotar cada petición al proveedor con un timeout de `30 s` (`AbortSignal.timeout`).
10. **Identidad de Carrito Invitado en Servidor (`#10`):** La identidad del carrito invitado DEBE resolverse exclusivamente desde la cookie opaca `httpOnly` `ja_cart_session`; nunca se aceptan IDs de carrito/línea/sesión desde el body o query string para seleccionar un carrito, y las operaciones de lectura nunca crean un carrito ni emiten cookie.

### Registros de Decisiones de Arquitectura (`docs/adr/`)

| ADR | Título | Resumen de la Decisión |
| --- | --- | --- |
| [`ADR 0001`](docs/adr/0001-standalone-git-repository.md) | Repositorio Git Independiente en la Raíz del Proyecto | Aísla la raíz del proyecto como su propio repositorio Git independiente para auditorías limpias basadas en diffs y aislamiento por worktrees. |
| [`ADR 0002`](docs/adr/0002-drizzle-data-access-layer.md) | Drizzle ORM + `drizzle-kit` sobre `pg` | Selecciona Drizzle ORM (`0.45.4`) + `drizzle-kit` (`0.31.11`) sobre `pg` con type-stripping nativo de Node 24 y `embedded-postgres` (`17.10.0-beta.17`) para pruebas sin Docker. |
| [`ADR 0003`](docs/adr/0003-chat-assistant-llm-provider.md) | Proveedor LLM del Chat Assistant detrás del Puerto `ChatAssistant` | Define el puerto hexagonal `ChatAssistant` con adaptadores `fetch` inyectables y resolución perezosa de entorno entre Vertex AI, Gemini API y OpenAI. |
| [`ADR 0004`](docs/adr/0004-chat-assistant-guardrails.md) | Decorador Determinista de Guardrails para el Chat Assistant | Envuelve `ChatAssistant` en `GuardedChatAssistant` para responder determinísticamente políticas, precios publicados, variantes y tablas de tallas, filtrando cifras en dólares no verificadas. |

---

## 11. Guía de Inicio Rápido Local, Gate de Verificación (`./init.sh`) y Flujo Multi-Agente SDD

### Prerrequisitos

- **macOS / Linux**
- **Node.js `v24.21.0`** vía `nvm` (fijado por [`.nvmrc`](.nvmrc); [`./init.sh`](init.sh) carga automáticamente `~/.nvm/nvm.sh`)
- **pnpm `12.11.2`** vía Corepack (`corepack enable`)
- *No se requiere Docker ni una instalación de PostgreSQL en el sistema* (`pnpm db:devdb` levanta una instancia embebida de PostgreSQL 17 bajo demanda).

### Configuración Local Paso a Paso

#### 1. Ejecutar el Gate de Verificación Estándar

```bash
./init.sh
```

`./init.sh` instala dependencias con lockfile congelado, ejecuta ESLint, corre `tsc --noEmit` y ejecuta las 99 suites de Vitest (`667` tests entre `ui` + `db` sobre un clúster efímero de PostgreSQL 17 embebido), terminando con código `0`.

#### 2. Configurar Variables de Entorno (`.env.local`)

Copia [`.env.example`](.env.example) a `.env.local` (ignorado por Git):

```bash
cp .env.example .env.local
```

| Variable | ¿Requerida? | Valor por Defecto / Ejemplo | Propósito |
| --- | --- | --- | --- |
| `DATABASE_URL` | Para `pnpm dev` y `db:*` | `postgresql://postgres:password@127.0.0.1:5432/j_armando` | URL de conexión a PostgreSQL. Usa `pnpm db:devdb` si no tienes un servidor Postgres local. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Opcional (IA Tier 1) | `./gcp-service-account.json` | Ruta al JSON de cuenta de servicio de GCP para Vertex AI (`gemini-2.5-flash` / `gemini-2.5-flash-image`). |
| `USE_VERTEX_AI` | Opcional | `true` (`"false"` desactiva Tier 1) | Define `"false"` para omitir Vertex AI aunque exista `gcp-service-account.json`. |
| `VERTEX_LOCATION` | Opcional | `us-central1` | Región de Google Cloud para los endpoints de Vertex AI. |
| `VERTEX_CHAT_MODEL` | Opcional | `gemini-2.5-flash` | Modelo de Vertex AI para el Chat Assistant. |
| `VERTEX_IMAGE_MODEL` | Opcional | `gemini-2.5-flash-image` | Modelo de Vertex AI para generación de imagen en Virtual Try-On. |
| `GEMINI_API_KEY` | Opcional (IA Tier 2) | `AQ.Ab8...` | Clave de API de Google AI Studio para acceso directo a Gemini API. |
| `GEMINI_CHAT_MODEL` | Opcional | `gemini-3.8-flash` | Modelo Gemini usado cuando `GEMINI_API_KEY` está activa. |
| `GEMINI_IMAGE_MODEL` | Opcional | `gemini-3.1-flash-image` | Modelo de imagen Gemini usado cuando `GEMINI_API_KEY` está activa. |
| `OPENAI_API_KEY` | Opcional (IA Tier 3) | `sk-...` | Clave de OpenAI o gateway compatible para fallback del Chat Assistant. |
| `CHAT_ASSISTANT_MODEL` | Opcional | `gpt-4o-mini` | Modelo enviado al endpoint Chat Completions compatible con OpenAI. |
| `OPENAI_BASE_URL` | Opcional | `https://api.openai.com/v1` | URL base para la API Chat Completions compatible con OpenAI. |
| `TRYON_BASE_URL` | Opcional (IA Tier 3) | `https://inference.devexpert.io/v1` | URL base de Images API compatible con OpenAI **incluyendo `/v1`** (el adaptador añade `/images/edits`). |
| `TRYON_MODEL` | Opcional (IA Tier 3) | `image-edit` | Nombre del modelo de edición de imagen para Virtual Try-On en Tier 3. |
| `TRYON_API_KEY` | Opcional (IA Tier 3) | Fallback a `DEVEXPERT_API_KEY` -> `OPENAI_API_KEY` | Token Bearer para el endpoint de Virtual Try-On en Tier 3. |

#### 3. Levantar Base de Datos, Migrar, Ejecutar Seed e Iniciar el Storefront

**Opción A — Usando el PostgreSQL 17 Desechable Integrado (`pnpm db:devdb`, Sin Docker):**

En la Terminal 1, inicia el servidor de base de datos embebido y copia el `DATABASE_URL` impreso en tu `.env.local`:

```bash
pnpm db:devdb
# Imprime: DATABASE_URL=postgresql://postgres:password@127.0.0.1:<port>/j_armando
```

En la Terminal 2, aplica las migraciones, ejecuta el seed del catálogo demo + cuenta admin por defecto (`admin@j-armando.store` / `Admin123!`), verifica la población e inicia el servidor de desarrollo:

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:verify
pnpm dev
```

**Opción B — Usando una Instancia Local o Administrada de PostgreSQL Existente:**

Configura `DATABASE_URL` en `.env.local` y ejecuta `pnpm db:migrate && pnpm db:seed && pnpm db:verify && pnpm dev`.

### Referencia de Comandos CLI (`package.json`)

| Comando | Descripción |
| --- | --- |
| `./init.sh` | Gate de arranque y verificación no bloqueante (`pnpm install --frozen-lockfile` + `pnpm lint` + `pnpm typecheck` + `pnpm test`) |
| `pnpm dev` | Inicia el servidor de desarrollo de Next.js 16.4 (`http://localhost:3000`) |
| `pnpm dev:phone` | Ejecuta `next build && next start -p 3001` para vista previa en teléfono físico sin retraso de hidratación por LAN o túnel |
| `pnpm build` | Genera un build de producción optimizado con Next.js 16.4 Turbopack |
| `pnpm start` | Inicia el servidor de producción de Next.js después de `pnpm build` |
| `pnpm lint` | Ejecuta ESLint 9 en todo el repositorio |
| `pnpm typecheck` | Ejecuta verificación estricta de tipos con `tsc --noEmit` |
| `pnpm test` | Ejecuta Vitest 5 (suites `ui` en jsdom + suites de integración `db` en node sobre `embedded-postgres` efímero) |
| `pnpm db:generate` | Genera una nueva migración SQL en `db/migrations/` a partir de cambios en `db/schema/` |
| `pnpm db:migrate` | Aplica las migraciones versionadas en `db/migrations/` sobre `DATABASE_URL` |
| `pnpm db:seed` | Inserta el catálogo demo, tablas de tallas, métodos de envío y cuenta admin por defecto (`ON CONFLICT DO NOTHING`) |
| `pnpm db:verify` | Verifica los conteos mínimos del catálogo (`6` categorías, `9` productos, `24+` variantes, `30` filas de tallas, `2` métodos de envío) |
| `pnpm db:devdb` | Levanta un servidor PostgreSQL 17 local desechable e imprime su `DATABASE_URL` hasta detenerlo con `Ctrl-C` |

### Regla de Vista Previa en Teléfono Físico y Código QR (`AGENTS.md`)

Tal como se documenta en [`AGENTS.md`](AGENTS.md) y [`PROGRESS.md`](PROGRESS.md) (`Session 013`):
- `next.config.ts` configura `allowedDevOrigins` para LAN y túneles `*.trycloudflare.com`, y `pnpm dev:phone` (`next build && next start -p 3001`) elimina la latencia de hidratación de bundles de desarrollo a través de túneles.
- Siempre que se despliega o redespliega una vista previa ejecutable (localhost, LAN o túnel), los agentes generan y muestran un **código QR** escaneable junto a la URL pública accesible desde móvil para validar el storefront directamente en un teléfono físico.

### Flujo de Ingeniería Multi-Agente Guiado por Especificaciones (SDD) (`.agents/skills/`)

Este repositorio está construido y validado mediante un arnés multi-agente modular bajo `.agents/skills/`:

1. **`build-brief` (`.agents/skills/build-brief/SKILL.md`):** Conduce el descubrimiento estructurado del producto y genera los documentos controlados de descubrimiento (`CONTEXT.md`, `DESIGN.md`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`, `docs/technical-discovery.md`, `docs/mvp-scope.md`, `docs/risks-and-open-questions.md`).
2. **`harness-starter` (`.agents/skills/harness-starter/SKILL.md`):** Inicializa el arnés de arranque (`AGENTS.md`, `init.sh`, `PROGRESS.md`, `feature_list.json`) a partir del corpus de descubrimiento.
3. **`feature-spec` / Planner (`.agents/skills/feature-spec/SKILL.md`):** Selecciona la primera feature lista por dependencias en [`feature_list.json`](feature_list.json) y redacta una especificación lista para implementación en `docs/specs/<feature-id>.md`.
4. **`feature-implementer` / Generator (`.agents/skills/feature-implementer/SKILL.md`):** Implementa estrictamente la especificación seleccionada (`WIP=1`), ejecuta `./init.sh` y `pnpm build`, actualiza la documentación durable (`ARCHITECTURE.md`, `CONSTRAINTS.md`) y marca el estado de la feature como `passing` (nunca `accepted`).
5. **`feature-validator` / Independent Evaluator (`.agents/skills/feature-validator/SKILL.md`):** Audita la implementación frente a la especificación, escenarios de aceptación, reglas de seguridad y límites de alcance en un contexto limpio, escribiendo un reporte de validación en `docs/validations/<feature-id>.md` y devolviendo `accept`, `revise` o `block`.
6. **`feature-flow` y `github-flow` (`.agents/skills/feature-flow/SKILL.md`, `.agents/skills/github-flow/SKILL.md`):** Orquesta el ciclo completo `planner -> implementer -> validator` sobre worktrees aislados de Git (`../tienda-worktrees/<id>`), con puertos/bases de datos dedicados y pull requests con evidencia completa de verificación.
