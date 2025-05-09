import type { Request, Response } from 'express'
import { supabase } from '../config/db'
import {
  MS_IN_VCPU_MONTH,
  PRICE_PER_GB_RAM,
  PRICE_PER_MB_NETWORK,
  PRICE_PER_VCPU
} from '../lib/constants'

export async function getUsageStats(req: Request, res: Response) {
  try {
    const { interval = 'daily', start, end } = req.query

    const now = end ? new Date(end as string) : new Date()
    let startDate: Date

    if (start) {
      startDate = new Date(start as string)
    } else {
      startDate = new Date(now)
      if (interval === 'hourly') {
        startDate.setHours(now.getHours() - 23, 0, 0, 0)
      } else if (interval === 'daily') {
        startDate.setDate(now.getDate() - 6)
        startDate.setHours(0, 0, 0, 0)
      } else if (interval === 'weekly') {
        startDate.setDate(now.getDate() - 28)
        startDate.setHours(0, 0, 0, 0)
      } else if (interval === 'monthly') {
        startDate.setMonth(now.getMonth() - 11)
        startDate.setDate(1)
        startDate.setHours(0, 0, 0, 0)
      }
    }

    const { data: records } = await supabase
      .from('Telemetry')
      .select('*')
      .gte('timeStamp', startDate)
      .lte('timeStamp', now)

    // Agrupar y sumar en JS
    const groupBy = (date: Date) => {
      if (interval === 'hourly') {
        return date.toISOString().slice(0, 13) + ':00:00'
      } else if (interval === 'daily') {
        return date.toISOString().slice(0, 10)
      } else if (interval === 'weekly') {
        const year = date.getUTCFullYear()
        const firstDayOfYear = new Date(Date.UTC(year, 0, 1))
        const pastDaysOfYear =
          (date.getTime() - firstDayOfYear.getTime()) / 86400000
        const week = Math.ceil(
          (pastDaysOfYear + firstDayOfYear.getUTCDay() + 1) / 7
        )
        return `${year}-W${week.toString().padStart(2, '0')}`
      } else if (interval === 'monthly') {
        return date.toISOString().slice(0, 7)
      }
      return ''
    }

    const grouped: Record<
      string,
      {
        totalRamMB: number
        totalCpuMs: number
        totalNetworkKB: number
        count: number
      }
    > = {}

    if (!records || records.length === 0) {
      res.json({
        interval,
        periodStart: startDate.toISOString(),
        periodEnd: now.toISOString(),
        count: 0,
        intervals: []
      })
      return
    }

    for (const rec of records) {
      const key = groupBy(rec.timeStamp)
      if (!grouped[key]) {
        grouped[key] = {
          totalRamMB: 0,
          totalCpuMs: 0,
          totalNetworkKB: 0,
          count: 0
        }
      }
      grouped[key].totalRamMB += rec.ramUsageMB ?? 0
      grouped[key].totalCpuMs += rec.cpuUsageMs ?? 0
      grouped[key].totalNetworkKB += rec.networkEgressKB ?? 0
      grouped[key].count += 1
    }

    const chartData = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([intervalKey, entry]) => ({
        interval: intervalKey,
        ramGB: (entry.totalRamMB / 1024).toFixed(3),
        cpuVCPU: (entry.totalCpuMs / MS_IN_VCPU_MONTH).toFixed(3),
        networkMB: (entry.totalNetworkKB / 1024).toFixed(3),
        count: entry.count
      }))

    res.json({
      interval,
      periodStart: startDate.toISOString(),
      periodEnd: now.toISOString(),
      count: records.length,
      intervals: chartData
    })
  } catch (error) {
    res.status(500).json({
      error: `Failed to get usage statistics ${(error as Error).message}`
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
