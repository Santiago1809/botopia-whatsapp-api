# WhatsApp API - Botopia

API backend para la gestión de WhatsApp Business con integración de Socket.io, autenticación JWT y gestión de pagos.

## 🚀 Desarrollo Local

### Requisitos
- [Bun](https://bun.sh) v1.2.9 o superior
- Node.js 20+ (para producción)

### Instalación

```bash
bun install
```

### Variables de Entorno

Crea un archivo `.env` con las siguientes variables:

```env
PORT=3001
DATABASE_URL=tu_url_de_supabase
SUPABASE_URL=tu_url
SUPABASE_SERVICE_ROLE_KEY=tu_key
JWT_SECRET=tu_secret
# ... otras variables necesarias
```

### Ejecutar en Desarrollo

```bash
# Con hot reload
bun run dev

# Sin hot reload
bun run start:bun
```

El servidor se ejecutará en `http://localhost:3001`

## 📦 Producción

### Build

```bash
npm run build
```

Esto compilará TypeScript a JavaScript en la carpeta `out/`

### Ejecutar en Producción

```bash
npm start
```

## 🚂 Deploy en Railway

Para instrucciones detalladas de despliegue en Railway, consulta [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md)

### Resumen
1. Configura las variables de entorno en Railway
2. Railway ejecutará automáticamente `npm install && npm run build`
3. El servidor iniciará con `node out/index.js`

## 📁 Estructura del Proyecto

```
botopia-whatsapp-api/
├── src/
│   ├── config/          # Configuración de BD
│   ├── controllers/     # Lógica de negocio
│   ├── middleware/      # Middlewares (JWT, telemetría)
│   ├── routes/          # Rutas de la API
│   ├── services/        # Servicios (AI, Email, WhatsApp)
│   └── types/           # Tipos TypeScript
├── index.ts             # Punto de entrada
├── package.json         # Dependencias y scripts
├── tsconfig.json        # Config TypeScript (desarrollo)
└── tsconfig.prod.json   # Config TypeScript (producción)
```

## 🔌 Endpoints Principales

- `/api/auth` - Autenticación y registro
- `/api/user` - Gestión de usuarios
- `/api/admin` - Panel de administración
- `/api/whatsapp` - Operaciones de WhatsApp
- `/api/payments` - Gestión de pagos
- `/api/subscriptions` - Suscripciones
- `/api/stats` - Estadísticas

## 🛠 Tecnologías

- **Runtime**: Bun (dev) / Node.js (prod)
- **Framework**: Express.js
- **Base de Datos**: Supabase (PostgreSQL)
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

This project was created using `bun init` in bun v1.2.9. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
