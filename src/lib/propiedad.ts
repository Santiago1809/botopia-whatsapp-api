import type { Response } from 'express'
import type { CustomRequest } from '../interfaces/global.js'
import { query } from './db.js'

/**
 * PROPIEDAD DE LOS RECURSOS DEL API — una sola forma de preguntarlo.
 *
 * QUÉ ROMPÍA. `authenticateToken` comprueba que el token está firmado y deja
 * pasar. A partir de ahí, los controladores filtraban por el id que venía en el
 * cuerpo o en la URL —`id`, `numberId`, `number`— y NUNCA por el usuario del
 * token. Como `app."WhatsAppNumber".id` es un serial (1, 2, 3…), cualquier
 * cuenta registrada podía:
 *
 *   · apagarle la IA a otro cliente          (POST /api/user/toggle-ai)
 *   · reescribirle el prompt de su agente    (PATCH /api/user/update-prompt/:id)
 *   · BORRARLE el número                     (DELETE /api/user/delete-number/:id)
 *     y con él, por el ON DELETE CASCADE, todos sus contactos sincronizados y no
 *     sincronizados. Irreversible.
 *   · leer su lista de contactos             (GET /api/whatsapp/synced-contacts)
 *   · mandar WhatsApps desde su número       (POST /api/whatsapp/send-message),
 *     gastando el cupo mensual QUE SE LE COBRA A ÉL.
 *
 * Nada de esto requería adivinar nada: bastaba probar ids del 1 en adelante.
 *
 * LA CADENA DE PROPIEDAD es corta y siempre la misma:
 *
 *     app."User".id  ->  app."WhatsAppNumber"."userId"  ->  SyncedContactOrGroup
 *                                                       ->  Unsyncedcontact
 *
 * `"userId"` es NOT NULL en el esquema, así que aquí —al revés que en el CRM— no
 * hay filas sin dueño y la comprobación puede ser estricta desde el primer día.
 *
 * EL TOKEN NO TRAE EL id: lleva `{ username, role }`, así que hay que resolverlo
 * contra la base. Se hace UNA vez por petición (memorizado en el propio `req`),
 * contra el índice único de `username`.
 */

export interface UsuarioSesion {
  id: number
  username: string
  role: string
}

/** Fila de app."WhatsAppNumber" tal como la necesitan los controladores. */
export interface NumeroPropio {
  id: number
  number: string
  userId: number
  aiEnabled: boolean
  responseGroups: boolean
  aiUnknownEnabled: boolean
  aiPrompt: string | null
  aiModel: string | null
}

/** Clave donde se memoriza el usuario resuelto, para no consultarlo dos veces. */
const CACHE = Symbol.for('api.usuarioSesion')

/**
 * Usuario de la petición, resuelto contra `app."User"`.
 * Devuelve null si no hay sesión, si el usuario ya no existe o si está inactivo.
 *
 * Releerlo de la base en vez de creerle al token es lo que hace que dar de baja
 * una cuenta surta efecto al instante: el token dura 5 horas y su contenido no
 * cambia cuando cambia la base.
 */
export async function usuarioDeSesion(
  req: CustomRequest
): Promise<UsuarioSesion | null> {
  const anfitrion = req as CustomRequest & { [k: symbol]: unknown }
  if (anfitrion[CACHE] !== undefined) {
    return anfitrion[CACHE] as UsuarioSesion | null
  }

  const username = req.user?.username
  // Misma resolución que usa el WebSocket (usuarioPorUsername): una sola
  // consulta escrita en un solo sitio, para que las dos vías no se separen.
  const resuelto = username ? await usuarioPorUsername(username) : null

  anfitrion[CACHE] = resuelto
  return resuelto
}

/**
 * Resuelve un usuario por su nombre, SIN depender de Express.
 *
 * Está separado porque el WebSocket también lo necesita y allí no hay `req`: el
 * token llega en el handshake de socket.io, no en una cabecera HTTP. Es la misma
 * consulta que hace `usuarioDeSesion`, con la misma regla sobre `active`: un
 * token sigue siendo válido 5 horas después de dar de baja la cuenta, así que
 * quien decide es la base y no el token.
 */
export async function usuarioPorUsername(
  username: string
): Promise<UsuarioSesion | null> {
  const { rows } = await query<{
    id: number
    username: string
    role: string
    active: boolean
  }>('SELECT id, username, role, active FROM app."User" WHERE username = $1', [
    username
  ])
  const fila = rows[0]
  if (!fila || fila.active === false) return null
  return { id: Number(fila.id), username: fila.username, role: fila.role }
}

/**
 * ¿Este número de WhatsApp es de este usuario? Versión sin Express.
 *
 * La usa el WebSocket, que es donde faltaba: `join-room` metía al socket en la
 * sala `<numberId>` sin comprobar nada, y por esa sala viaja —entre otras cosas—
 * el QR de vinculación. Devuelve false si el número no existe, que para quien
 * pregunta es la misma respuesta que "no es tuyo".
 */
export async function numeroEsDelUsuario(
  userId: number,
  numberId: unknown
): Promise<boolean> {
  const id = Number(numberId)
  // Un id no numérico haría fallar la comparación en Postgres con 22P02.
  if (!Number.isInteger(id)) return false
  const { rows } = await query<{ id: number }>(
    'SELECT id FROM app."WhatsAppNumber" WHERE id = $1 AND "userId" = $2',
    [id, userId]
  )
  return rows.length > 0
}

/** Igual que el anterior, pero responde 401 y devuelve null si no hay sesión. */
export async function exigirUsuario(
  req: CustomRequest,
  res: Response
): Promise<UsuarioSesion | null> {
  const usuario = await usuarioDeSesion(req)
  if (!usuario) {
    res.status(401).json({ message: 'Sesión no válida' })
    return null
  }
  return usuario
}

/**
 * Comprueba que un número de WhatsApp existe Y es del usuario del token.
 *
 * Se busca `por` id o `por` número de teléfono según lo que use cada endpoint
 * (unos reciben `numberId` en la URL y otros `number` en el cuerpo), pero la
 * consulta lleva SIEMPRE el `"userId"` en el WHERE: así no hay forma de escribir
 * el filtro a medias.
 *
 * Se responde 404 —y no 403— cuando el número existe pero es de otro: distinguir
 * los dos casos convierte el endpoint en un detector de ids ajenos válidos.
 * Para quien llama con un id que no es suyo, "no existe" es la respuesta honesta.
 */
export async function exigirNumeroPropio(
  req: CustomRequest,
  res: Response,
  criterio: { id?: number | string; number?: string }
): Promise<NumeroPropio | null> {
  const usuario = await exigirUsuario(req, res)
  if (!usuario) return null

  let filas: NumeroPropio[]

  if (criterio.id !== undefined && criterio.id !== null && criterio.id !== '') {
    const id = Number(criterio.id)
    if (!Number.isInteger(id)) {
      // Un id no numérico haría fallar la comparación en Postgres con 22P02 y
      // devolvería un 500 en vez de un 404.
      res.status(404).json({ message: 'Número no encontrado' })
      return null
    }
    const { rows } = await query<NumeroPropio>(
      'SELECT * FROM app."WhatsAppNumber" WHERE id = $1 AND "userId" = $2',
      [id, usuario.id]
    )
    filas = rows
  } else if (criterio.number) {
    const { rows } = await query<NumeroPropio>(
      'SELECT * FROM app."WhatsAppNumber" WHERE number = $1 AND "userId" = $2',
      [String(criterio.number), usuario.id]
    )
    filas = rows
  } else {
    res.status(400).json({ message: 'Falta el número' })
    return null
  }

  const numero = filas[0]
  if (!numero) {
    console.warn(
      `⛔ ${usuario.username} (id ${usuario.id}) pidió el número ${
        criterio.id ?? criterio.number
      }, que no existe o no es suyo.`
    )
    res.status(404).json({ message: 'Número no encontrado' })
    return null
  }

  return numero
}

/**
 * Ids de los números del usuario. Lo usan los endpoints que reciben una LISTA de
 * ids de contactos y tienen que descartar los que no le corresponden.
 */
export async function numerosDelUsuario(userId: number): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    'SELECT id FROM app."WhatsAppNumber" WHERE "userId" = $1',
    [userId]
  )
  return rows.map((r) => Number(r.id))
}

/**
 * De una lista de ids de `SyncedContactOrGroup`, devuelve solo los que cuelgan
 * de un número del usuario.
 *
 * Se filtra en SQL y en UNA consulta, no en un bucle: el endpoint de actualización
 * masiva manda cientos de ids de una vez y una consulta por id volvería a poner
 * ahí el N+1 que ya se quitó del resto del archivo.
 */
export async function sincronizadosDelUsuario(
  userId: number,
  ids: Array<number | string>
): Promise<Set<number>> {
  const numericos = ids.map((v) => Number(v)).filter((v) => Number.isInteger(v))
  if (numericos.length === 0) return new Set()

  const { rows } = await query<{ id: number }>(
    `SELECT s.id
       FROM app."SyncedContactOrGroup" s
       JOIN app."WhatsAppNumber" w ON w.id = s."numberId"
      WHERE s.id = ANY($1::int[]) AND w."userId" = $2`,
    [numericos, userId]
  )
  return new Set(rows.map((r) => Number(r.id)))
}

/**
 * Un solo contacto de `SyncedContactOrGroup`, si cuelga de un número del
 * usuario. Existe junto a `sincronizadosDelUsuario` (que resuelve LISTAS)
 * porque el endpoint de edición de nombre/foto necesita además el `numberId`
 * para emitir el evento de socket, y pedir la lista para un solo id obligaba a
 * una segunda consulta solo para leer ese campo.
 */
export async function sincronizadoPropio(
  userId: number,
  id: number | string
): Promise<{ id: number; numberId: number } | null> {
  const numerico = Number(id)
  if (!Number.isInteger(numerico)) return null

  const { rows } = await query<{ id: number; numberId: number }>(
    `SELECT s.id, s."numberId"
       FROM app."SyncedContactOrGroup" s
       JOIN app."WhatsAppNumber" w ON w.id = s."numberId"
      WHERE s.id = $1 AND w."userId" = $2`,
    [numerico, userId]
  )
  return rows[0] ?? null
}

/**
 * Igual, para `Unsyncedcontact` (la tabla de quienes escribieron sin estar
 * sincronizados). Devuelve la fila —no solo el id— porque los endpoints que la
 * tocan necesitan después el `numberid` para emitir el evento de socket.
 */
export async function noSincronizadoPropio(
  userId: number,
  id: number | string
): Promise<{ id: number; numberid: number } | null> {
  const numerico = Number(id)
  if (!Number.isInteger(numerico)) return null

  const { rows } = await query<{ id: number; numberid: number }>(
    `SELECT u.id, u.numberid
       FROM app."Unsyncedcontact" u
       JOIN app."WhatsAppNumber" w ON w.id = u.numberid
      WHERE u.id = $1 AND w."userId" = $2`,
    [numerico, userId]
  )
  return rows[0] ?? null
}
