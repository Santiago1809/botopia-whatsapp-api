import type { Request, Response } from 'express'
import { supabase } from '../config/db.js'
import { query } from '../lib/db.js'
import { runRetention } from '../lib/retention.js'
import {
  MS_IN_VCPU_MONTH,
  PRICE_PER_GB_RAM,
  PRICE_PER_MB_NETWORK,
  PRICE_PER_VCPU
} from '../lib/constants.js'

/**
 * Traduce el intervalo pedido al formato con el que Postgres etiqueta cada grupo.
 * Es la misma clave que producía el groupBy en JS, para que el front reciba
 * exactamente las mismas cadenas ('2026-08-30', '2026-08-30T14:00:00', '2026-W35'…).
 *
 * Va como lista blanca y no como texto interpolado: el valor viene del
 * querystring y termina dentro de un to_char().
 */
const FORMATOS: Record<string, string> = {
  hourly: `to_char(date_trunc('hour',  "timeStamp" AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS')`,
  daily: `to_char(date_trunc('day',   "timeStamp" AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
  weekly: `to_char("timeStamp" AT TIME ZONE 'UTC', 'IYYY"-W"IW')`,
  monthly: `to_char(date_trunc('month', "timeStamp" AT TIME ZONE 'UTC'), 'YYYY-MM')`
}

export async function getUsageStats(req: Request, res: Response) {
  try {
    const { interval = 'daily', start, end } = req.query
    const intervalKey = String(interval)

    if (!FORMATOS[intervalKey]) {
      res.status(400).json({
        error: `interval inválido: ${intervalKey}. Valores: ${Object.keys(FORMATOS).join(', ')}`
      })
      return
    }

    const now = end ? new Date(end as string) : new Date()
    let startDate: Date

    if (start) {
      startDate = new Date(start as string)
    } else {
      startDate = new Date(now)
      if (intervalKey === 'hourly') {
        startDate.setHours(now.getHours() - 23, 0, 0, 0)
      } else if (intervalKey === 'daily') {
        startDate.setDate(now.getDate() - 6)
        startDate.setHours(0, 0, 0, 0)
      } else if (intervalKey === 'weekly') {
        startDate.setDate(now.getDate() - 28)
        startDate.setHours(0, 0, 0, 0)
      } else if (intervalKey === 'monthly') {
        startDate.setMonth(now.getMonth() - 11)
        startDate.setDate(1)
        startDate.setHours(0, 0, 0, 0)
      }
    }

    // Antes: select('*') de TODO el rango y después agrupar y sumar en JS. Sobre
    // una tabla que recibe una fila por request eso significaba traerse cientos de
    // miles de filas a memoria para producir 7, 24 o 12 números. Ahora agrupa y
    // suma Postgres, apoyado en telemetry_timestamp_idx, y viaja una fila por
    // barra del gráfico. Los valores devueltos son idénticos.
    const { rows } = await query<{
      interval: string
      total_ram_mb: string | number
      total_cpu_ms: string | number
      total_network_kb: string | number
      count: number
      total_rows: number
    }>(
      `SELECT ${FORMATOS[intervalKey]}                     AS interval,
              COALESCE(SUM("ramUsageMB"), 0)               AS total_ram_mb,
              COALESCE(SUM("cpuUsageMs"), 0)               AS total_cpu_ms,
              COALESCE(SUM("networkEgressKB"), 0)          AS total_network_kb,
              count(*)::int                                AS count,
              SUM(count(*)) OVER ()::int                   AS total_rows
         FROM app."Telemetry"
        WHERE "timeStamp" >= $1 AND "timeStamp" <= $2
        GROUP BY 1
        ORDER BY 1`,
      [startDate, now]
    )

    const chartData = rows.map((r) => ({
      interval: r.interval,
      ramGB: (Number(r.total_ram_mb) / 1024).toFixed(3),
      cpuVCPU: (Number(r.total_cpu_ms) / MS_IN_VCPU_MONTH).toFixed(3),
      networkMB: (Number(r.total_network_kb) / 1024).toFixed(3),
      count: r.count
    }))

    res.json({
      interval: intervalKey,
      periodStart: startDate.toISOString(),
      periodEnd: now.toISOString(),
      count: rows.length > 0 ? Number(rows[0]?.total_rows ?? 0) : 0,
      intervals: chartData
    })
  } catch (error) {
    res.status(500).json({
      error: `Failed to get usage statistics ${(error as Error).message}`
    })
  }
}

/**
 * POST /api/stats/retention — limpieza por antigüedad a mano (solo admin).
 *
 * Body opcional: { force: true } para saltarse el "ya corrió hace menos de 20
 * horas" que trae app.run_retention. Qué se borra y durante cuánto tiempo se
 * conserva se configura por entorno; ver src/lib/retention.ts.
 */
export async function runRetentionNow(req: Request, res: Response) {
  try {
    const force = req.body?.force === true
    const resultado = await runRetention(force)
    res.json({ success: true, ...resultado })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `No se pudo correr la limpieza: ${(error as Error).message}`
    })
  }
}
export async function calculatePrice(req: Request, res: Response) {
  try {
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)

    const { data: result } = await supabase.rpc('telemetry_summary', {
      start_date: startDate,
      end_date: now
    })

    const totalRamMB = result._sum.ramUsageMB ?? 0
    const totalCpuMs = result._sum.cpuUsageMs ?? 0
    const totalNetworkKB = result._sum.networkEgressKB ?? 0
    const count = result._count._all ?? 0

    const totalRamGB = totalRamMB / 1024
    const totalCpuVCPU = totalCpuMs / MS_IN_VCPU_MONTH
    const totalNetworkMB = totalNetworkKB / 1024

    const totalRamCost = totalRamGB * PRICE_PER_GB_RAM
    const totalCpuCost = totalCpuVCPU * PRICE_PER_VCPU
    const totalNetworkCost = totalNetworkMB * PRICE_PER_MB_NETWORK
    const totalPrice = totalRamCost + totalCpuCost + totalNetworkCost

    res.json({
      totalRamGB: totalRamGB.toFixed(10),
      totalCpuVCPU: totalCpuVCPU.toFixed(10),
      totalNetworkMB: totalNetworkMB.toFixed(10),
      totalRamCost: totalRamCost.toFixed(10),
      totalCpuCost: totalCpuCost.toFixed(10),
      totalNetworkCost: totalNetworkCost.toFixed(10),
      totalPrice: totalPrice.toFixed(10),
      periodStart: startDate.toISOString(),
      periodEnd: now.toISOString(),
      count
    })
  } catch (error) {
    res
      .status(500)
      .json({
        error: `Failed to calculate billing ${(error as Error).message}`
      })
  }
}
