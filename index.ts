import compression from 'compression'
import cors, { type CorsOptions } from 'cors'
import { config } from 'dotenv'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import http from 'http'
import { Server } from 'socket.io'
import { setupSocketEvents } from './src/controllers/whatsapp.controller.js'
import { telemetryMiddleware } from './src/middleware/telemetry.middleware.js'
import adminRoutes from './src/routes/admin.route.js'
import authRoutes from './src/routes/auth.route.js'

import paymentsRouter from './src/routes/payments.route.js'
import subscriptionsRouter from './src/routes/subscriptions.route.js'
import statsRoutes from './src/routes/stats.route.js'
import userRoutes from './src/routes/user.route.js'
import whatsAppRoutes from './src/routes/whatsapp.route.js'
import unsyncedContactRoutes from './src/routes/unsyncedcontact.route.js'

config()

const app = express()
const server = http.createServer(app)
app.use(helmet())
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
app.set('trust proxy', 1) // confía en el primer proxy
app.use(express.json())

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'https://botopia-whatsapp.vercel.app',
  'https://baruc-whatsapp-frontend.vercel.app',
  'https://app.botopia.online',
  'https://www.botopia.online',
  'https://botopia-whatsapp-git-featureavataria-santiago1809s-projects.vercel.app'
]
const corsOptions: CorsOptions = {
  origin: function (origin: string | undefined, callback) {
    // Permitir sin origin (requests desde el mismo servidor)
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
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true
}
app.use(cors(corsOptions))

// Ahora sí, middleware con límites ampliados
app.use(express.json({ limit: '50mb' })) // 👈 aquí el cambio clave
app.use(express.urlencoded({ limit: '50mb', extended: true })) // 👈 y aquí también

const io = new Server(server, { cors: corsOptions })
app.set('io', io)
setupSocketEvents(io)

app.use('/api/admin', adminRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/whatsapp', whatsAppRoutes)
app.use('/api/payments', paymentsRouter)
app.use('/api/subscriptions', subscriptionsRouter)

app.use('/api/unsyncedcontacts', unsyncedContactRoutes)

const port = process.env.PORT || 3001
server.keepAliveTimeout = 65000
server.headersTimeout = 70000

process.on('uncaughtException', (res) => {
  return res
})
process.on('unhandledRejection', (res) => {
  return res
})

server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
