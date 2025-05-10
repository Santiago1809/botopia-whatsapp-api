import compression from 'compression'
import cors, { type CorsOptions } from 'cors'
import { config } from 'dotenv'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import http from 'http'
import { Server } from 'socket.io'
import { setupSocketEvents } from './src/controllers/whatsapp.controller'
import { telemetryMiddleware } from './src/middleware/telemetry.middleware'
import adminRoutes from './src/routes/admin.route'
import authRoutes from './src/routes/auth.route'
import creditsRoutes from './src/routes/credits.route'
import payuRoutes from './src/routes/payments.route'
import statsRoutes from './src/routes/stats.route'
import userRoutes from './src/routes/user.route'
import whatsAppRoutes from './src/routes/whatsapp.route'

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
  'https://botopia-whatsapp.vercel.app',
  'https://app.botopia.online'
]
const corsOptions: CorsOptions = {
  origin: function (origin: string | undefined, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('🚫 CORS bloqueado para este origen'))
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true
}
app.use(cors(corsOptions))
const io = new Server(server, { cors: corsOptions })
app.set('io', io)
setupSocketEvents(io)

app.use('/api/admin', adminRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/whatsapp', whatsAppRoutes)
app.use('/api/payments', payuRoutes)
app.use('/api/credits', creditsRoutes)

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
