/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../config/db'

export const telemetryMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.method === 'OPTIONS') return next()

  const startCPU = process.cpuUsage()
  let totalBytesSent = 0

  const originalWrite = res.write.bind(res)
  const originalEnd = res.end.bind(res)

  res.write = function (
    chunk: any,
    encoding?: BufferEncoding | ((error: Error | null | undefined) => void),
    cb?: (error: Error | null | undefined) => void
  ): boolean {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8')
    totalBytesSent += buffer.length
    return originalWrite(chunk, encoding as BufferEncoding, cb)
  }

  res.end = function (
    chunk?: any,
    encoding?: BufferEncoding | (() => void),
    cb?: () => void
  ): Response {
    if (chunk) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8')
      totalBytesSent += buffer.length
    }
    return originalEnd(chunk, encoding as BufferEncoding, cb)
  }

  res.on('finish', async () => {
    const endMemory = process.memoryUsage()
    const memoryUsageMB = (endMemory.rss / 1024 / 1024).toFixed(2)
    const cpuDiff = process.cpuUsage(startCPU)
    const cpuUsedMs = ((cpuDiff.user + cpuDiff.system) / 1000).toFixed(2)
    const networkEgressKB = (totalBytesSent / 1024).toFixed(2)

    try {
      const ip =
        (req.headers['x-forwarded-for'] as string | undefined) ||
        req.socket.remoteAddress ||
        ''
      let country = ''
      let city = ''
      try {
        const geoRes = await axios.get(
          `http://ip-api.com/json/${ip.split(',')[0]}`
        )
        country = geoRes.data.country || ''
        city = geoRes.data.city || ''
      } catch (geoErr) {
        console.error('Geo lookup failed:', geoErr)
      }
      await prisma.telemetry.create({
        data: {
          city,
          country,
          ip: ip.split(',')[0],
          cpuUsageMs: +cpuUsedMs,
          networkEgressKB: +networkEgressKB,
          ramUsageMB: +memoryUsageMB
        }
      })
    } catch (error) {
      console.error('Error saving telemetry data:', error)
    }
  })

  next()
}
