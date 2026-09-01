/**
 * TOPES POR PLAN — la única tabla de números que hay que tocar para cambiarlos.
 *
 * QUÉ ROMPÍA. Los topes de cada plan existían en DOS sitios y ninguno cobraba:
 *
 *   · app."PlanLimit" (base) solo guarda el tope MENSUAL DE MENSAJES, y ese sí
 *     se aplica de verdad (app.increment_message_usage, db/schema.sql).
 *   · getPlanLimits() en subscription.controller.ts declara maxWhatsappNumbers
 *     por plan… pero solo se usa para MOSTRARLO en la pantalla de suscripción.
 *
 * Resultado: una cuenta FREE podía crear 20 líneas y 50 agentes sin que nada la
 * frenara — el "límite" era un texto en pantalla. Y cada línea de más no es solo
 * una fila: es un Chromium entero corriendo en el contenedor (LocalAuth abre un
 * navegador por línea), o sea que el tope de líneas también protege la máquina.
 *
 * Este módulo es la fuente única y lo leen los tres interesados:
 *   · addWhatsAppNumber (user.controller.ts) — rechaza la línea que excede.
 *   · addAgent (user.controller.ts) — rechaza el agente que excede.
 *   · getPlanLimits (subscription.controller.ts) — lo muestra, con los MISMOS
 *     números, para que lo que ve el cliente y lo que se aplica no se separen.
 *
 * El tope de MENSAJES no está aquí a propósito: vive en app."PlanLimit" porque
 * el cobro se resuelve dentro de la base (FOR UPDATE) y duplicarlo en código
 * recrearía justo la carrera que se quitó de messages.controller.ts.
 */

export interface TopesDelPlan {
  /** Líneas de WhatsApp (una línea = una sesión con su Chromium). */
  maxLineas: number
  /** Agentes de IA propios (los globales no cuentan: no los crea el cliente). */
  maxAgentes: number
}

/**
 * maxLineas sale de getPlanLimits() (los valores que siempre se le mostraron al
 * cliente). maxAgentes no existía en NINGÚN sitio; se fija en paridad con las
 * líneas —un agente por línea contratada— por ser la regla más defendible sin
 * una decisión de negocio explícita. Si el negocio decide otra cosa, se cambia
 * solo aquí.
 *
 * EXPIRED y cualquier plan desconocido caen al caso FREE, igual que hace la
 * pantalla de suscripción: expirar no borra lo que ya se tiene, pero no da
 * derecho a crear más que una cuenta gratuita.
 */
export function topesDelPlan(plan: string | null | undefined): TopesDelPlan {
  switch ((plan ?? '').toUpperCase()) {
    case 'BASIC':
      return { maxLineas: 1, maxAgentes: 1 }
    case 'PRO':
      return { maxLineas: 3, maxAgentes: 3 }
    case 'INDUSTRIAL':
      return { maxLineas: 10, maxAgentes: 10 }
    default:
      return { maxLineas: 1, maxAgentes: 1 }
  }
}
