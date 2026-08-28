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
cp .env.example .env      # y rellena los valores
bun run dev               # http://localhost:3001
```

Comprobación rápida: `curl http://localhost:3001/health` → `{"status":"ok",...}`.

## Orden de arranque

1. **Este API** en el puerto **3001**.
2. **Front** (`lumintik-whatsapp`) en el puerto **3000**.

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
```

## Endpoints

- `GET /` — identificación del servicio
- `GET /health` — health check
- `/api/auth`, `/api/user`, `/api/admin`
- `/api/whatsapp`, `/api/unsyncedcontacts`
- `/api/payments`, `/api/subscriptions`, `/api/stats`

## Notas

- `node-fetch` se importa en `src/controllers/payment.controller.ts` y
  `subscription.controller.ts` pero **no está declarado** en `package.json`; hoy
  resuelve como dependencia transitiva. Conviene declararlo o migrar al `fetch` nativo.
- `ioredis` está en `dependencies` pero no se usa en ningún archivo.
- Las URLs de despliegue en `allowedOrigins` (`index.ts`) y el enlace "Ver Planes"
  de `src/lib/constants.ts` siguen apuntando a los dominios `botopia.online` /
  `botopia-whatsapp.vercel.app`: son infraestructura viva, hay que cambiarlos cuando
  existan los dominios nuevos.
