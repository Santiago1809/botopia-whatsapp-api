import express from 'express'
import { Server } from 'socket.io'
import http from 'http'
import cors, { type CorsOptions } from 'cors'
import compression from 'compression'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { prisma } from './src/config/db'
import { telemetryMiddleware } from './src/middleware/telemetry.middleware'
import { HttpStatusCode } from 'axios'
import { setupSocketEvents } from './src/controllers/whatsapp.controller'
import { config } from 'dotenv'

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
const allowedOrigins = [
  'http://localhost:3000',
  'https://frontend-clicsociable.vercel.app',
  'https://frontend-clicsociable-git-development-david-espejos-projects.vercel.app'
]
const corsOptions: CorsOptions = {
  origin: function (origin: string | undefined, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('🚫 CORS bloqueado para este origen'))
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}
app.use(cors(corsOptions))
const io = new Server(server, { cors: corsOptions })
app.set('io', io)
setupSocketEvents(io)

app.use((req, res) => {
  res.status(HttpStatusCode.Ok).json({ message: 'Server is running' })
})

app.use((req, res) => {
  res
    .status(HttpStatusCode.InternalServerError)
    .json({ message: 'Internal Server Error' })
})
const port = process.env.PORT || 3001
server.keepAliveTimeout = 65000
server.headersTimeout = 70000

prisma.$connect().then(() => {
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`)
  })
})
