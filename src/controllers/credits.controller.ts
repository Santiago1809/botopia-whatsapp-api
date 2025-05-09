import { HttpStatusCode } from 'axios'
import type { Response } from 'express'
import { supabase } from '../config/db'
import type { CustomRequest } from '../interfaces/global'
import { getCurrentMonth, getCurrentYear } from '../lib/dateUtils'

export async function getUserCredits(req: CustomRequest, res: Response) {
  try {
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('username', req.user?.username)
      .single()
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }

    // Obtener el mes y año actual en GMT-5
    const currentMonth = getCurrentMonth()
    const currentYear = getCurrentYear()

    let { data: userCredits } = await supabase
      .from('UserCredits')
      .select('*')
      .eq('userId', user.id)
      .eq('month', currentMonth)
      .eq('year', currentYear)
      .single()

    const DEFAULT_CREDIT_LIMIT = 100000 // Definimos un valor predeterminado

    if (!userCredits) {
      // Crear registro de créditos para el mes actual
      userCredits = await supabase
        .from('UserCredits')
        .insert({
          userId: user.id,
          month: currentMonth,
          year: currentYear,
          totalCredits: 0,
          usedCredits: 0,
          creditsLimit: DEFAULT_CREDIT_LIMIT
        })
        .select('*')
        .single()
    }
    const { data: creditHistory } = await supabase
      .from('UserCredits')
      .select('*')
      .eq('userId', user.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(6)

    res.status(HttpStatusCode.Ok).json({
      currentCredits: userCredits,
      creditHistory
    })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error obteniendo información de créditos ${
        (error as Error).message
      }`
    })
  }
}

// Función interna que se usará para registrar el uso de créditos
export async function registerCreditUsage(userId: number, creditsUsed: number) {
  try {
    // Obtener el mes y año actual en GMT-5
    const currentMonth = getCurrentMonth()
    const currentYear = getCurrentYear()
    let { data: userCredits } = await supabase
      .from('UserCredits')
      .select('*')
      .eq('userId', userId)
      .eq('month', currentMonth)
      .eq('year', currentYear)
      .single()

    const DEFAULT_CREDIT_LIMIT = 10000 // Definimos un valor predeterminado

    if (!userCredits) {
      const { data: user } = await supabase
        .from('User')
        .select('*')
        .eq('id', userId)
        .single()

      if (!user) {
        throw new Error('Usuario no encontrado')
      }

      userCredits = await supabase
        .from('UserCredits')
        .insert({
          userId: user.id,
          month: currentMonth,
          year: currentYear,
          totalCredits: 0,
          usedCredits: 0,
          creditsLimit: DEFAULT_CREDIT_LIMIT // Usamos el valor predeterminado
        })
        .select('*')
        .single()
    }
    await supabase
      .from('UserCredits')
      .update({
        usedCredits: userCredits.usedCredits + creditsUsed
      })
      .eq('id', userCredits.id)

    return true
  } catch (error) {
    console.error('Error al registrar uso de créditos:', error)
    return false
  }
}
