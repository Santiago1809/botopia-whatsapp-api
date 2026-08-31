// Cargar variables de entorno PRIMERO, antes de cualquier importación
import { config } from 'dotenv'
config()

import compression from 'compression'
import cors, { type CorsOptions } from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import http from 'http'
import { Server } from 'socket.io'
import {
  restaurarSesionesGuardadas,
  setupSocketEvents
} from './src/controllers/whatsapp.controller.js'
import { telemetryMiddleware } from './src/middleware/telemetry.middleware.js'
import { scheduleRetentionOnBoot } from './src/lib/retention.js'
import { APP_URL } from './src/lib/app-url.js'
import adminRoutes from './src/routes/admin.route.js'
import authRoutes from './src/routes/auth.route.js'
import connectionsRoutes from './src/routes/connections.route.js'
import { emitirCaidaPorReinicio } from './src/services/events/lineEvents.js'
import { iniciarResumenDiario, detenerResumenDiario } from './src/services/events/dailySummary.js'
import { iniciarWorkerDeEntregas, detenerWorkerDeEntregas } from './src/services/events/worker.js'
import { clients } from './src/WhatsAppClients.js'

import paymentsRouter from './src/routes/payments.route.js'
import subscriptionsRouter from './src/routes/subscriptions.route.js'
import statsRoutes from './src/routes/stats.route.js'
import usageRoutes from './src/routes/usage.route.js'
import userRoutes from './src/routes/user.route.js'
import whatsAppRoutes from './src/routes/whatsapp.route.js'
import unsyncedContactRoutes from './src/routes/unsyncedcontact.route.js'
import { authenticateToken } from './src/middleware/jwt.middleware.js'

const app = express()
const server = http.createServer(app)

// Configurar CORS PRIMERO - antes de otros middlewares
// El día que el front deje de vivir en *.vercel.app (por ejemplo en un dominio
// propio) el comodín de abajo deja de cubrirlo y CORS lo rechaza en silencio. Por
// eso la lista se puede ampliar sin tocar código: ALLOWED_ORIGINS con los orígenes
// separados por coma, más APP_URL, que ya apunta al front en los correos.
const extraOrigins = [
  ...(process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  ...(APP_URL ? [APP_URL] : [])
]
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  // Dominios de despliegue reales: NO renombrar en el rebrand, romperían CORS.
  'https://botopia-whatsapp.vercel.app',
  'https://baruc-whatsapp-frontend.vercel.app',
  'https://app.botopia.online',
  'https://www.botopia.online',
  'https://botopia-whatsapp-git-featureavataria-santiago1809s-projects.vercel.app',
  ...extraOrigins
]
const corsOptions: CorsOptions = {
  origin: function (origin: string | undefined, callback) {
    // Permitir sin origin (requests desde el mismo servidor o Postman)
    if (!origin) {
      callback(null, true)
      return
    }
    
    // Verificar si está en la lista de orígenes permitidos
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    
    // Permitir cualquier subdominio de vercel.app
    if (origin.endsWith('.vercel.app')) {
      callback(null, true)
      return
    }
    
    // Rechazar otros orígenes
    callback(null, false)
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}
app.use(cors(corsOptions))

// Configurar Helmet para que NO bloquee los headers de CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}))

app.set('trust proxy', 1) // confía en el primer proxy
app.use(compression())
app.use(telemetryMiddleware)
app.use(
  rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 500,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: true,
    message: {
      error: 'Too many requests, please try again later.'
    },
    validate: {
      validationsConfig: false,
      default: true
    }
  })
)

// Middleware con límites ampliados
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

const io = new Server(server, { cors: corsOptions })
app.set('io', io)
setupSocketEvents(io)

app.use('/api/admin', adminRoutes)
app.use('/api/stats', statsRoutes)
// Panel de consumo del propio cliente. La sesión se exige dentro del router y el
// id de la cuenta sale del token, nunca de la URL.
app.use('/api/usage', usageRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/whatsapp', whatsAppRoutes)
app.use('/api/payments', paymentsRouter)
app.use('/api/subscriptions', subscriptionsRouter)

// Con sesión, como el resto: sin ella `GET /` de esta ruta devolvía teléfono, nombre y el
// texto del último WhatsApp de TODOS los inquilinos, y sus DELETE borraban los contactos de
// cualquier número. Era la única de las nueve montada sin autenticación.
app.use('/api/unsyncedcontacts', authenticateToken, unsyncedContactRoutes)
app.use('/api/connections', connectionsRoutes)

// Health check endpoint para Railway
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Root endpoint
app.get('/', (_req, res) => {
  res.status(200).json({ message: 'Lumintik WhatsApp API', status: 'running' })
})

const port = Number(process.env.PORT) || 3001
const host = process.env.HOST || '0.0.0.0' // Escuchar en todas las interfaces para Railway
server.keepAliveTimeout = 65000
server.headersTimeout = 70000

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  // No hacer return, dejar que el proceso continúe
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // No hacer return, dejar que el proceso continúe
})

server.listen(port, host, () => {
  console.log(`Server is running on ${host}:${port}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)

  // Bus de eventos: el worker que entrega los webhooks y los avisos por correo,
  // y el planificador del resumen diario. Los dos son tolerantes a que falte
  // configuración — sin SMTP el correo queda registrado como 'blocked' con el
  // motivo y nada más se rompe.
  iniciarWorkerDeEntregas()
  iniciarResumenDiario()

  // Vuelve a abrir las sesiones de WhatsApp que quedaron guardadas en el volumen.
  //
  // Sin esto, un reinicio dejaba WhatsApp MUDO hasta que un humano abría la pantalla y
  // pulsaba conectar: no había ningún `client.on('message')` escuchando, así que los
  // mensajes que llegaran en ese hueco se perdían sin dejar ni una línea en el log. Y
  // como cada despliegue reinicia el contenedor, eso pasaba varias veces al día.
  //
  // Va después de `listen` y sin await: levantar los navegadores tarda, y el servidor
  // tiene que estar respondiendo al healthcheck mientras tanto o Railway da el
  // despliegue por fallido.
  void restaurarSesionesGuardadas(io).catch((e) => {
    console.error(
      '❌ Fallo restaurando las sesiones de WhatsApp:',
      e instanceof Error ? e.message : e
    )
  })
})

/**
 * Apagado graceful.
 *
 * EL AGUJERO QUE TAPA: cuando Railway reinicia el servicio, todas las sesiones
 * de whatsapp-web.js mueren con el proceso y NADIE emitía 'disconnected' — la
 * base seguía listando el número como si la línea existiera y el cliente no se
 * enteraba de que había dejado de recibir mensajes. Aquí se emite
 * line.disconnected(reason='service_restart') por cada sesión viva, esperando de
 * verdad a que se escriba, porque el proceso está a punto de terminar.
 *
 * Se le pone tope de 5 s: un apagado que se cuelga es peor que un evento que no
 * sale, porque Railway acaba matando el proceso a lo bruto de todas formas.
 */
let apagando = false
const apagadoGraceful = async (senal: string) => {
  if (apagando) return
  apagando = true
  console.log(`🛑 ${senal} recibido — cerrando`)

  try {
    await Promise.race([
      (async () => {
        await emitirCaidaPorReinicio(Object.keys(clients))
        detenerResumenDiario()
        await detenerWorkerDeEntregas()
      })(),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ])
  } catch (error) {
    console.error('❌ Error en el apagado graceful:', error)
  }

  server.close(() => process.exit(0))
  // Si alguna conexión abierta impide cerrar, no se espera indefinidamente.
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on('SIGTERM', () => void apagadoGraceful('SIGTERM'))
process.on('SIGINT', () => void apagadoGraceful('SIGINT'))
