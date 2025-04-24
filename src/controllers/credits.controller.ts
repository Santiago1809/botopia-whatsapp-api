import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import { prisma } from '../config/db'
import type { CustomRequest } from '../interfaces/global'
import { getCurrentMonth, getCurrentYear } from '../lib/dateUtils'

export async function getUserCredits(req: CustomRequest, res: Response) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        username: req.user?.username
      }
    })

    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }

    // Obtener el mes y año actual en GMT-5
    const currentMonth = getCurrentMonth()
    const currentYear = getCurrentYear()

    // Buscar créditos del mes actual o crearlos si no existen
    let userCredits = await prisma.userCredits.findFirst({
      where: {
        userId: user.id,
        month: currentMonth,
        year: currentYear
      }
    })

    const DEFAULT_CREDIT_LIMIT = 100000 // Definimos un valor predeterminado

    if (!userCredits) {
      // Crear registro de créditos para el mes actual
      userCredits = await prisma.userCredits.create({
        data: {
          userId: user.id,
          month: currentMonth,
          year: currentYear,
          totalCredits: 0,
          usedCredits: 0,
          creditsLimit: DEFAULT_CREDIT_LIMIT // Usamos el valor predeterminado
        }
      })
    }

    // Obtener historial de créditos (últimos 6 meses)
    const creditHistory = await prisma.userCredits.findMany({
      where: {
        userId: user.id
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 6
    })

    res.status(HttpStatusCode.Ok).json({
      currentCredits: userCredits,
      creditHistory
    })
  } catch (error) {
    console.error('Error al obtener créditos del usuario:', error)
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'Error obteniendo información de créditos' })
  }
}

// Función interna que se usará para registrar el uso de créditos
export async function registerCreditUsage(userId: number, creditsUsed: number) {
  try {
    // Obtener el mes y año actual en GMT-5
    const currentMonth = getCurrentMonth()
    const currentYear = getCurrentYear()

    // Buscar o crear registro de créditos para el mes actual
    let userCredits = await prisma.userCredits.findFirst({
      where: {
        userId,
        month: currentMonth,
        year: currentYear
      }
    })

    const DEFAULT_CREDIT_LIMIT = 10000 // Definimos un valor predeterminado

    if (!userCredits) {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user) {
        throw new Error('Usuario no encontrado')
      }

      userCredits = await prisma.userCredits.create({
        data: {
          userId,
          month: currentMonth,
          year: currentYear,
          totalCredits: 0,
          usedCredits: 0,
          creditsLimit: DEFAULT_CREDIT_LIMIT // Usamos el valor predeterminado
        }
      })
    }

    // Actualizar créditos usados
    await prisma.userCredits.update({
      where: {
        id: userCredits.id
      },
      data: {
        usedCredits: {
          increment: creditsUsed
        }
      }
    })

    return true
  } catch (error) {
    console.error('Error al registrar uso de créditos:', error)
    return false
  }
}
