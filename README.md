# Lumintik WhatsApp API

Backend Express 5 + Socket.io para WhatsApp Business: autenticación JWT, gestión de
números y contactos vía `whatsapp-web.js`, respuestas con Google GenAI y pagos con
dLocal Go. Persistencia en Supabase.

## Requisitos

- [Bun](https://bun.sh) 1.x para desarrollo
- Node.js 20+ para producción
- Chromium: `whatsapp-web.js` usa Puppeteer, que descarga su propio Chromium en `bun install`

## Arranque en local

```bash
bun install
npm rebuild bcrypt        # ver nota de abajo
cp .env.example .env      # y rellena los valores
bun run dev               # http://localhost:3001
```

Comprobación rápida: `curl http://localhost:3001/health` → `{"status":"ok",...}`.

> **bcrypt**: según la versión de Bun, `bun install` no ejecuta el postinstall que
> compila el binding nativo y el arranque falla con
> `Cannot find module .../bcrypt/lib/binding/napi-v3/bcrypt_lib.node`.
> Se arregla con `npm rebuild bcrypt` una sola vez (o instalando con `npm install`).

## Orden de arranque

1. **Este API** en el puerto **3001**.
2. **Front** (`lumintik-whatsapp`) en el puerto **3000**.

Copia `.env.example` a `.env` y rellena. La única variable de base de datos es
`DATABASE_URL`: **ya no se usan `SUPABASE_URL` ni `SUPABASE_KEY`.**

```bash
cp .env.example .env
```

---

## 🐘 Base de datos: Postgres en Railway

Este servicio y `CRM-ms` comparten **una sola instancia de Postgres** con dos
esquemas: `app` (este repo) y `crm` (el microservicio). Antes eran dos proyectos
de Supabase distintos.

### Puesta en marcha desde cero

**1. Crear el Postgres en Railway**

En el proyecto de Railway: `+ New` → `Database` → `Add PostgreSQL`.
Railway crea el servicio y expone en su pestaña *Variables*:

| Variable | Host | Cuándo usarla |
|---|---|---|
| `DATABASE_URL` | `postgres.railway.internal` | Desde los servicios desplegados en el mismo proyecto. Red privada, sin TLS, sin cobro de egress. |
| `DATABASE_PUBLIC_URL` | `…proxy.rlwy.net` | Desde tu máquina (aplicar el esquema, correr el smoke test). Sale a internet y **exige TLS**. |

El código decide el TLS mirando el host, así que la misma variable funciona en
los dos casos sin tocar nada (`src/lib/db.ts`).

**2. Aplicar el esquema**

`db/schema.sql` es la fuente canónica del esquema para **los dos** servicios
(tablas, índices, funciones RPC y los triggers de realtime). Es idempotente:
se puede correr las veces que haga falta.

```bash
# con psql
psql "$DATABASE_PUBLIC_URL" -f db/schema.sql

# o sin psql instalado (usa el driver pg que ya es dependencia)
DATABASE_URL="$DATABASE_PUBLIC_URL" npm run db:schema
```

**3. Configurar la variable en los servicios**

En Railway, en **cada** servicio (`botopia-whatsapp-api` y `CRM-ms`):

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Referenciarla así (en vez de pegar el valor) hace que rote sola si Railway
regenera la credencial.

**4. Borrar las variables viejas**

En los dos servicios: eliminar `SUPABASE_URL` y `SUPABASE_KEY`. Y **revocar en
Supabase** la key `service_role` del CRM: estuvo hardcodeada en un archivo que sí
está en git.

**5. Levantar**

```bash
bun install
bun run dev        # local
```

### Verificar que quedó bien

```bash
npm run build
DATABASE_URL="..." npm run db:smoke
```

El smoke test hace insert/select/update/delete por cada tabla del esquema `app`
pasando por el adaptador, prueba las 3 funciones RPC, el upsert con `onConflict`,
la semántica `PGRST116` de `.single()` y las guardas del adaptador. Crea y borra
sus propios datos, pero **córrelo contra una base de prueba, no producción**.

### Cómo habla el código con Postgres

No se reescribieron los 105 call sites. `src/config/db.ts` sigue exportando un
objeto llamado `supabase` con la misma forma de siempre
(`from().select().eq().single()`, `.rpc()`), solo que ahora es un adaptador sobre
`pg`: `src/lib/supabase-adapter.ts`.

Dos reglas del adaptador que conviene conocer:

- **No lanza** por errores de la base: devuelve `{ data, error }` como
  supabase-js. Mucho código ignora `error`, y con `pg` desnudo esas rutas
  pasarían de "no encontrado" a 500.
- **Sí lanza**, con un mensaje que dice qué hacer, ante cualquier método de
  PostgREST que no esté implementado (`.or()`, `.ilike()`, joins embebidos,
  tablas fuera de la lista blanca…). Un uso nuevo revienta en desarrollo, no en
  producción con datos.

Lo que PostgREST resolvía con DSL propio se reescribió a SQL parametrizado con
`query()` de `src/lib/db.ts`: los tres `.or(...)` de `auth.controller.ts` y
`user.controller.ts`.

### Migrar los datos que ya están en Supabase

`db/schema.sql` está **derivado del código**, no de un dump de producción. Antes
de mover datos reales:

```bash
pg_dump --schema-only "$SUPABASE_API_URL" > app_schema.sql
pg_dump --schema-only "$SUPABASE_CRM_URL" > crm_schema.sql
```

y conciliar. Los puntos abiertos están marcados con ⚠️ dentro de `schema.sql`
(qué borraba exactamente `delete_contacts_by_numberid`, y si
`contacts.esta_al_habilitado` / `ultima_actividad` son columnas propias o espejos).
Después, `pg_dump --data-only` + `setval` de todas las secuencias.

### Ejecutar en Desarrollo

`http://localhost:3000` y `http://localhost:3002` ya están en la lista de orígenes
CORS permitidos en `index.ts`.

## Credenciales que hay que pegar

Lista completa en `.env.example`. Las que importan:

| Variable | Para qué | ¿Bloquea el arranque? |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_KEY` | Base de datos | **Sí** — `src/config/db.ts` lanza excepción si faltan |
| `JWT_SECRET` | Firma de tokens | No, pero sin ella se usa un secreto por defecto inseguro |
| `SMTP_HOST/PORT/USER/PASS` | Correos (bienvenida, reset, avisos) | No — el servicio de correo queda deshabilitado con un aviso |
| `GOOGLE_GENAI_API_KEY` | Agente IA | No, solo falla ese módulo |
| `API_KEY`, `API_SECRET` | dLocal Go (pagos/suscripciones) | No, solo falla ese módulo |

Sin Supabase el proceso **no levanta**. Es la única credencial obligatoria para arrancar.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `bun run dev` | Desarrollo con hot reload (`bun --watch index.ts`) |
| `bun run start:bun` | Ejecuta con Bun sin watch |
| `npm run build` | Compila TypeScript a `out/` con `tsconfig.prod.json` |
| `npm start` | Ejecuta el build (`node out/index.js`) |
| `npm run build:bun` | Build alternativo con el bundler de Bun |

## Estructura

```
src/
├── config/         # Cliente de Supabase
├── controllers/    # Lógica de negocio (auth, user, admin, whatsapp, pagos)
├── middleware/     # JWT, telemetría
├── routes/         # Rutas de la API
├── services/       # AI (GenAI), Email (nodemailer), WhatsApp
└── types/          # Tipos TypeScript
index.ts            # Punto de entrada: CORS, middlewares, rutas, Socket.io

botopia-whatsapp-api/
├── db/
│   ├── schema.sql       # DDL canónico (esquemas app + crm), RPCs y triggers
│   ├── apply-schema.mjs # Aplica schema.sql sin necesitar psql
│   └── smoke-test.mjs   # CRUD por tabla + RPCs, contra un Postgres real
├── src/
│   ├── config/          # Configuración de BD (reexporta el adaptador)
│   ├── controllers/     # Lógica de negocio
│   ├── lib/
│   │   ├── db.ts               # Pool de pg, SSL por host, query() y LISTEN
│   │   └── supabase-adapter.ts # Adaptador con la forma de supabase-js
│   ├── middleware/      # Middlewares (JWT, telemetría)
│   ├── routes/          # Rutas de la API
│   ├── services/        # Servicios (AI, Email, WhatsApp)
│   └── types/           # Tipos TypeScript
├── index.ts             # Punto de entrada
├── package.json         # Dependencias y scripts
├── tsconfig.json        # Config TypeScript (desarrollo)
└── tsconfig.prod.json   # Config TypeScript (producción)
```

## Endpoints

- `GET /` — identificación del servicio
- `GET /health` — health check
- `/api/auth`, `/api/user`, `/api/admin`
- `/api/whatsapp`, `/api/unsyncedcontacts`
- `/api/payments`, `/api/subscriptions`, `/api/stats`
- `/api/connections` — webhooks salientes, avisos por correo y actividad de
  eventos. Es lo que consume la pantalla **Conexiones** del front.

## Eventos y webhooks

Cada hecho de la cuenta (mensaje entrante, contacto que contesta, cambio de
etapa, línea caída) se guarda en el esquema `events` de la base y se entrega
firmado a los destinos que registre el cliente, y/o por correo.

- **Documentación para el cliente**: [`docs/WEBHOOKS.md`](docs/WEBHOOKS.md) —
  catálogo de eventos, ejemplos de payload y cómo verificar la firma (Node y
  Python).
- **Dónde está el código**: `src/services/events/` (emisor, worker de entregas,
  firma HMAC, validación anti-SSRF, plantillas de correo, resumen diario) y la
  sección `events` de `db/schema.sql` (tablas, `events.emitir()` y los triggers
  que producen los eventos de la vía Meta).

### Variables de entorno que usa

| Variable | Para qué | Si falta |
| --- | --- | --- |
| `WEBHOOK_SECRET_KEY` | Cifra los secretos de firma guardados. Genérala con `openssl rand -base64 32`. | Se deriva una clave de `JWT_SECRET` y se avisa por log. Si tampoco hay `JWT_SECRET`, no se pueden crear webhooks. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | Envío de los avisos por correo. | Los avisos se registran como `blocked` con el motivo escrito. **Nada más se rompe.** |
| `MAIL_FROM` | Remitente real (dominio verificado del proveedor transaccional). | Se usa `SMTP_USER`. |
| `EVENTS_WORKER_ENABLED` | `false` apaga el worker de entregas en esta instancia. | Activo. |
| `WEBHOOK_ALLOW_INSECURE_HOSTS` | **Solo desarrollo**: hosts separados por coma a los que se permite `http://` y puerto libre. | Solo se admite `https://` a direcciones públicas. |

## Notas

- `node-fetch` se importa en `src/controllers/payment.controller.ts` y
  `subscription.controller.ts` pero **no está declarado** en `package.json`; hoy
  resuelve como dependencia transitiva. Conviene declararlo o migrar al `fetch` nativo.
- `ioredis` está en `dependencies` pero no se usa en ningún archivo.
- Las URLs de despliegue en `allowedOrigins` (`index.ts`) y el enlace "Ver Planes"
  de `src/lib/constants.ts` siguen apuntando a los dominios `botopia.online` /
  `botopia-whatsapp.vercel.app`: son infraestructura viva, hay que cambiarlos cuando
  existan los dominios nuevos.

- **Runtime**: Bun (dev) / Node.js (prod)
- **Framework**: Express.js
- **Base de Datos**: PostgreSQL en Railway (driver `pg`)
- **WebSockets**: Socket.io
- **Autenticación**: JWT
- **WhatsApp**: whatsapp-web.js
- **IA**: Google GenAI

## 📝 Scripts Disponibles

- `bun run dev` - Desarrollo con hot reload
- `bun run start:bun` - Ejecutar con Bun
- `npm run build` - Compilar para producción
- `npm start` - Ejecutar en producción
- `npm run build:bun` - Build con Bun (alternativo)
- `npm run db:schema` - Aplicar `db/schema.sql` sobre `DATABASE_URL`
- `npm run db:smoke` - Smoke test del adaptador contra Postgres (requiere build)

This project was created using `bun init` in bun v1.2.9. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
