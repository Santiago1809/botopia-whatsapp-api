/**
 * =============================================================================
 *  CATÁLOGO DE EVENTOS — la lista cerrada de lo que la máquina sabe contar
 * =============================================================================
 *
 *  Dos reglas que valen para siempre:
 *
 *  1) El NOMBRE de un evento no cambia nunca. Un cliente lo tiene escrito en su
 *     código y en su tabla de suscripciones. Si algún día el payload tiene que
 *     romper, nace `message.received.v2` y los dos conviven hasta que el último
 *     cliente migre. Renombrar es una caída silenciosa en casa ajena.
 *
 *  2) La forma es `recurso.acción`, con la acción en pasado: describe un HECHO
 *     que ya ocurrió, no una orden. `contact.replied`, no `contact.reply`.
 */

/** Versión del contrato de payloads. Viaja en el sobre de cada evento. */
export const API_VERSION = '2026-08-29'

export interface EventoDelCatalogo {
  tipo: string
  /** Texto de la casilla en /connections. */
  titulo: string
  /** Qué significa exactamente, para que el cliente no tenga que adivinar. */
  descripcion: string
  /** true si el payload puede llevar texto escrito por el lead. */
  llevaMensaje: boolean
  /** true si tiene plantilla de correo; si no, solo se puede recibir por webhook. */
  correo: boolean
}

export const CATALOGO: EventoDelCatalogo[] = [
  {
    tipo: 'message.received',
    titulo: 'Mensaje recibido',
    descripcion:
      'Entró un mensaje de un contacto, por línea propia (QR) o por WhatsApp Business (Meta).',
    llevaMensaje: true,
    correo: false
  },
  {
    tipo: 'message.sent',
    titulo: 'Mensaje enviado',
    descripcion: 'Salió un mensaje: lo mandó el bot, un agente humano o una plantilla.',
    llevaMensaje: true,
    correo: false
  },
  {
    tipo: 'contact.created',
    titulo: 'Contacto nuevo',
    descripcion: 'Alguien escribió por primera vez y quedó registrado como contacto.',
    llevaMensaje: false,
    correo: true
  },
  {
    tipo: 'contact.replied',
    titulo: 'Un contacto te contestó',
    descripcion:
      'El contacto respondió a un mensaje nuestro. No es lo mismo que "escribió": exige que exista un mensaje anterior del bot o de un agente.',
    llevaMensaje: true,
    correo: true
  },
  {
    tipo: 'contact.stage_changed',
    titulo: 'Cambio de etapa',
    descripcion: 'Una tarjeta se movió de columna en el embudo. Trae la etapa anterior y la nueva.',
    llevaMensaje: false,
    correo: true
  },
  {
    tipo: 'contact.ai_disabled',
    titulo: 'IA apagada para un contacto',
    descripcion: 'Se desactivó el agente de IA de ese contacto, a mano o por un escalamiento.',
    llevaMensaje: false,
    correo: true
  },
  {
    tipo: 'contact.deleted',
    titulo: 'Contacto eliminado',
    descripcion: 'Se borró el contacto. Solo viajan identificadores: la fila ya no existe.',
    llevaMensaje: false,
    correo: false
  },
  {
    tipo: 'conversation.handoff_requested',
    titulo: 'Piden un asesor humano',
    descripcion: 'La IA escaló la conversación a una persona. Trae los últimos mensajes del hilo.',
    llevaMensaje: true,
    correo: true
  },
  {
    tipo: 'line.connected',
    titulo: 'Línea conectada',
    descripcion: 'Una línea quedó operativa: se escaneó el QR o sus credenciales de Meta responden.',
    llevaMensaje: false,
    correo: true
  },
  {
    tipo: 'line.disconnected',
    titulo: 'Línea caída',
    descripcion:
      'Una línea dejó de estar operativa: cierre de sesión, fallo de autenticación, credenciales inválidas o reinicio del servicio.',
    llevaMensaje: false,
    correo: true
  },
  {
    tipo: 'line.qr_pending',
    titulo: 'Línea esperando escaneo',
    descripcion:
      'Se generó un código QR y la línea espera que alguien lo escanee. El QR NO viaja en el evento: es una credencial de sesión.',
    llevaMensaje: false,
    correo: false
  },
  {
    tipo: 'usage.limit_reached',
    titulo: 'Tope de mensajes alcanzado',
    descripcion: 'La cuenta agotó el cupo mensual de mensajes de su plan.',
    llevaMensaje: false,
    correo: true
  },
  {
    tipo: 'daily.summary',
    titulo: 'Resumen diario',
    descripcion:
      'Un evento por cuenta y por día con lo que de verdad pasó: mensajes, contactos nuevos, respuestas, escalamientos y líneas caídas.',
    llevaMensaje: false,
    correo: true
  }
]

const TIPOS = new Set(CATALOGO.map((e) => e.tipo))

export function esTipoValido(tipo: unknown): tipo is string {
  return typeof tipo === 'string' && TIPOS.has(tipo)
}

/** Los tipos que tienen plantilla de correo. */
export const TIPOS_CON_CORREO = CATALOGO.filter((e) => e.correo).map((e) => e.tipo)

/**
 * ---------------------------------------------------------------------------
 *  LISTA DE BLOQUEO
 *
 *  Esto NO es una convención: es una criba que corre sobre cada payload justo
 *  antes de serializarlo, a cualquier profundidad. El productor ya evita meter
 *  estos campos, pero el productor es código y el código cambia; la criba es la
 *  red que queda debajo. Protege también el registro de entregas, porque ahí se
 *  guarda el payload que se envió.
 *
 *  Qué hay aquí y por qué:
 *    · JWT / NUMBER_ID / WABA_ID  — token permanente de Meta. Quien lo tenga
 *      envía mensajes COMO el cliente. Es el dato más crítico del CRM.
 *    · Telefono_contacto_1..4     — celulares del equipo interno del cliente,
 *      que no son del lead y nunca se pidieron para esto.
 *    · password / otp_hash        — credenciales de la plataforma.
 *    · aiPrompt / aiModel         — propiedad intelectual del cliente.
 *    · columnas de pago           — datos financieros y de identidad.
 *    · qr                         — credencial de sesión de WhatsApp: quien la
 *      escanee se apodera de la línea.
 * ---------------------------------------------------------------------------
 */
const CLAVES_PROHIBIDAS = new Set(
  [
    'JWT',
    'jwt',
    'NUMBER_ID',
    'numberId',
    'number_id',
    'WABA_ID',
    'wabaId',
    'waba_id',
    'Telefono_contacto_1',
    'Telefono_contacto_2',
    'Telefono_contacto_3',
    'Telefono_contacto_4',
    'telefono_contacto_1',
    'telefono_contacto_2',
    'telefono_contacto_3',
    'telefono_contacto_4',
    'password',
    'otp_hash',
    'secret',
    'secret_ciphertext',
    'prev_secret_ciphertext',
    'aiPrompt',
    'aiModel',
    'client_document',
    'client_document_type',
    'payment_method',
    'mid',
    'plan_token',
    'subscription_token',
    'external_transaction_id',
    'qr',
    'authorization'
  ].map((k) => k.toLowerCase())
)

/**
 * Devuelve una copia del payload sin las claves prohibidas y, si el destino no
 * pidió el cuerpo del mensaje, sin `body`.
 *
 * `incluirCuerpo` por defecto es false a propósito: el contenido de las
 * conversaciones es el dato más sensible del sistema y un webhook lo saca de
 * nuestra frontera. Que salga tiene que ser una decisión explícita del cliente.
 */
export function depurarPayload(valor: unknown, incluirCuerpo: boolean): unknown {
  if (Array.isArray(valor)) {
    return valor.map((v) => depurarPayload(v, incluirCuerpo))
  }
  if (valor === null || typeof valor !== 'object') return valor

  const salida: Record<string, unknown> = {}
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (CLAVES_PROHIBIDAS.has(clave.toLowerCase())) continue
    if (!incluirCuerpo && clave === 'body') continue
    salida[clave] = depurarPayload(v, incluirCuerpo)
  }
  return salida
}

/** Trunca a 140 caracteres, que es el largo del `preview` del catálogo. */
export function recortarPreview(texto: string | null | undefined): string {
  if (!texto) return ''
  return texto.length <= 140 ? texto : texto.slice(0, 140)
}

/** Enmascara un teléfono dejando los últimos 4 dígitos: "•••••••1234". */
export function enmascararTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null
  const limpio = telefono.replace(/\D/g, '')
  if (limpio.length <= 4) return limpio
  return '•'.repeat(limpio.length - 4) + limpio.slice(-4)
}
