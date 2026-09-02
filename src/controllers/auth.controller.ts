import { HttpStatusCode } from 'axios'
import * as bcrypt from 'bcrypt'
import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { supabase } from '../config/db.js'
import { query } from '../lib/db.js'
import type { ChangePassword, CustomRequest } from '../interfaces/global.js'
import { APP_URL } from '../lib/app-url.js'
import { resetPasswordTemplate, welcomeUserTemplate } from '../lib/constants.js'
import { transporter, sendEmail } from '../services/email.service.js'
import { Role, type User } from '../types/global.js'
import { cerrarCliente, clients } from '../WhatsAppClients.js'

// En producción no hay valor por defecto: un JWT_SECRET adivinable permite firmar
// tokens de cualquier usuario. Fuera de producción se usa uno fijo para no obligar
// a configurar nada en local.
const JWT_SECRET = (() => {
  const fromEnv = process.env.JWT_SECRET
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET no está configurada. En Railway: servicio del API → Variables → JWT_SECRET (cadena larga y aleatoria).'
    )
  }
  console.warn('⚠️ JWT_SECRET sin definir: se usa una clave de desarrollo. NO usar en producción.')
  return 'dev_only_insecure_secret'
})()

// Minutos que vive un código de recuperación antes de caducar.
const OTP_TTL_MINUTES = 10

/**
 * Deriva un nombre de usuario libre a partir del correo.
 *
 * `ana@empresa.com` -> `ana`, y si `ana` está tomado, `ana2`, `ana3`… Se consulta la
 * base en cada intento en vez de calcular un sufijo al azar para que el nombre siga
 * siendo legible: es lo que la persona ve como su usuario en la app.
 */
async function usernameLibreDesde(email: string): Promise<string> {
  const base =
    (email.split('@')[0] ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 24) || 'usuario'
  for (let i = 1; i <= 50; i++) {
    const intento = i === 1 ? base : `${base}${i}`
    const { rows } = await query(
      'SELECT 1 FROM app."User" WHERE username = $1 LIMIT 1',
      [intento]
    )
    if (!rows.length) return intento
  }
  // 50 colisiones del mismo buzón es un caso que no se da; aun así no se puede
  // devolver algo que choque, porque la columna es UNIQUE y el INSERT reventaría.
  return `${base}${Date.now().toString(36)}`
}

export const registerUser = async (req: Request, res: Response) => {
  try {
    // OJO: aquí NO se lee `role` (ni active, subscription, plan o id) del body.
    // El registro es público y el adaptador de supabase persiste toda clave que
    // llegue al INSERT: aceptar `role` permitía crear un admin con un POST.
    const {
      username: usernamePedido,
      password,
      email,
      phoneNumber,
      countryCode
    } = req.body as Partial<User>
    if (!password || !email) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Faltan datos para el registro' })
      return
    }

    // El registro ya no pide "nombre de usuario": el correo es la identidad. Pero la
    // columna existe, es NOT NULL y UNIQUE, y se muestra en la app, así que se deriva
    // del correo. Dos personas con el mismo buzón en dominios distintos
    // (ana@a.com y ana@b.com) chocarían, y ese choque saldría como "el usuario ya
    // existe" señalando al correo, que sí está libre: por eso se numera.
    const username = usernamePedido?.trim()
      ? usernamePedido.trim()
      : await usernameLibreDesde(email)
    // Antes: .or(`username.eq.${username},email.eq.${email}...`) — DSL de PostgREST
    // que no traduce a SQL y que además interpolaba datos del request sin escapar.
    // Ahora es un OR explícito y parametrizado. El teléfono solo entra en la
    // condición si vino, igual que antes.
    const orParts = ['username = $1', 'email = $2']
    const orParams: unknown[] = [username, email]
    if (phoneNumber !== '' && phoneNumber != null) {
      orParams.push(phoneNumber)
      orParts.push(`"phoneNumber" = $${orParams.length}`)
    }
    const existingRows = await query(
      `SELECT * FROM app."User" WHERE ${orParts.join(' OR ')} LIMIT 1`,
      orParams
    )
    const existingUser = existingRows.rows[0]
    if (existingUser) {
      res
        .status(409)
        .json({ message: 'El usuario, correo o número de teléfono ya existe' })
      return
    }
    const hashedPassword = await bcrypt.hash(password, 10)
    // Lista blanca explícita de columnas que el registro puede escribir. Nada
    // más del body llega a la base, y el rol se fuerza SIEMPRE a 'user': subir
    // a admin solo puede hacerlo un admin ya existente, nunca el propio registro.
    const { data: user } = await supabase
      .from('User')
      .insert({
        username,
        password: hashedPassword,
        email,
        phoneNumber,
        countryCode,
        role: Role.user
      })
      .select()
      .single()
    // El rol del token se fija aquí (no se lee de `user`): la firma es la
    // credencial y no debe depender de lo que haya vuelto de la base.
    const token = jwt.sign(
      { username: user.username, role: Role.user },
      JWT_SECRET,
      { expiresIn: '5h' }
    )
    // El enlace de confirmación viaja en el correo de bienvenida y apunta a
    // /activate del front, que llama a POST /api/auth/activate con este token.
    // Confirmar el correo NO es obligatorio para entrar: solo sella la cuenta.
    // Sin APP_URL no hay a dónde apuntar, así que el correo sale sin botón.
    const activationUrl = APP_URL
      ? `${APP_URL}/activate?token=${encodeURIComponent(
          jwt.sign(
            { email: user.email, purpose: 'account-activation' },
            JWT_SECRET,
            { expiresIn: '7d' }
          )
        )}`
      : null
    // Enviar email de bienvenida (no bloquea si falla)
    sendEmail({
      to: email,
      subject: 'Bienvenido a Lumintik Agents',
      html: welcomeUserTemplate(user.username, activationUrl)
    }).catch(err => {
      console.error('Error al enviar email de bienvenida:', err)
      // No fallar el registro si el email falla
    })
    res.json({ token, user: { id: user.id, username: user.username, role: Role.user, email: user.email } })
  } catch (error) {
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: `Error en el servidor ${(error as Error).message}` })
  }
}

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body
    if (!identifier || !password) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Faltan datos para el login' })
      return
    }
    // Antes: .or('username.eq.' + identifier + ...) — concatenaba el identificador
    // del request DENTRO del filtro de PostgREST sin escapar (inyección de filtro).
    // Ahora es un solo parámetro comparado contra las tres columnas.
    const userRows = await query<User>(
      `SELECT * FROM app."User"
        WHERE username = $1 OR email = $1 OR "phoneNumber" = $1
        LIMIT 1`,
      [identifier]
    )
    const user = userRows.rows[0]

    if (!user) {
      res
        .status(HttpStatusCode.BadRequest)
        .json({ message: 'Usuario no encontrado!' })
      return
    }

    if (!user.active) {
      res.status(403).json({ message: 'Usuario no autorizado' })
      return
    }

    const validPassword = await bcrypt.compare(
      password as string,
      user.password
    )
    if (!validPassword) {
      res.status(403).json({ message: 'Contraseña incorrecta' })
      return
    }
    const role = user.role || Role.user

    const token = jwt.sign(
      { username: user.username, role: role },
      JWT_SECRET,
      { expiresIn: '5h' }
    )
    res.json({ token, user: { id: user.id, username: user.username, role: role, email: user.email } })
  } catch (error) {
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: `Error en el servidor: ${(error as Error).message}` })
  }
}

export const getUserInfo = async (req: CustomRequest, res: Response) => {
  try {
    const { data: user } = await supabase
      .from('User')
      .select('id, username, role, email')
      .eq('username', req.user?.username)
      .single()
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    //console.log("🔍 [DEBUG BACKEND] Usuario encontrado:", user);
    //console.log("🔍 [DEBUG BACKEND] ID del usuario:", user.id);
    //console.log("🔍 [DEBUG BACKEND] Tipo del ID:", typeof user.id);
    res.json({ ...user })
  } catch (error) {
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: `Error en el servidor: ${(error as Error).message}` })
  }
}

export const getUsersList = async (req: CustomRequest, res: Response) => {
  try {
    if (req.user?.role !== Role.admin)
      return res.status(403).json({ message: 'Acceso denegado' })
    // Antes: .select('*,!password'), que NO es sintaxis válida de PostgREST.
    // Respondía 400, el error se ignoraba y `users` quedaba undefined: el listado
    // de usuarios estaba roto. Se enumeran las columnas y se omite el hash.
    const { data: users } = await supabase
      .from('User')
      .select(
        'id, username, email, phoneNumber, countryCode, role, active, tokensPerResponse, subscription, subscription_updated_at, createdAt, updatedAt'
      )
    res.json(users)
  } catch (error) {
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: `Error en el servidor: ${(error as Error).message}` })
  }
}

export async function logOut(req: CustomRequest, res: Response) {
  const authHeader = req.headers['authorization']
  if (!authHeader) {
    res.status(401).json({ message: 'Acceso denegado' })
    return
  }
  const token = authHeader.split(' ')[1]
  if (!token) {
    res.status(401).json({ message: 'Acceso denegado' })
    return
  }

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

  const { data: whatsappNumbers } = await supabase
    .from('WhatsAppNumber')
    .select('*')
    .eq('userId', user.id)
  try {
    for (const numberData of whatsappNumbers || []) {
      const numberId = String(numberData.id)
      // Se lee el mapa en CRUDO (no `clienteVivo`): esta vía necesita el objeto
      // aunque esté muerto, porque es a quien hay que cerrarle el navegador.
      const client = clients[numberId]
      if (!client) continue

      // AQUÍ SE LLAMABA A `client.logout()`. `LocalAuth.logout()` borra la
      // carpeta de sesión entera (LocalAuth.js:56-68), así que CERRAR SESIÓN EN
      // LA APP DESVINCULABA EL WHATSAPP: al volver a entrar había que escanear
      // el QR de nuevo, y cuando eso fallaba el operador acababa creando una
      // línea nueva (el numberId subiendo 2, 4, 5, 7, 8, 9, 10 con el mismo
      // teléfono). Cerrar sesión solo apaga el navegador; la vinculación se
      // destruye únicamente desde /api/user/delete-number.
      await Promise.race([
        cerrarCliente(client, numberId, 'el usuario cerró sesión'),
        new Promise((resolver) => setTimeout(resolver, 5000))
      ])
      delete clients[numberId]
    }
    // Antes aquí se borraban las filas de app."WhatsAppNumber" del usuario: cerrar
    // sesión destruía la vinculación y obligaba a rescanear el QR en cada login.
    // Cerrar sesión solo apaga los clientes en memoria (lo de arriba); el número
    // vinculado se borra únicamente desde /api/user/delete-number.
    res.json({ message: 'Sesión cerrada correctamente' })
  } catch (error) {
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: `Error al cerrar sesión: ${(error as Error).message}` })
  }
}

export const requestResetPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as Partial<User>
    if (!email) {
      res.status(HttpStatusCode.BadRequest).json({ message: 'Falta el email' })
      return
    }
    const { data: user } = await supabase
      .from('User')
      .select('*')
      .eq('email', email)
      .single()
    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' })
      return
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    // El código se guarda hasheado y con caducidad en la base, no en un objeto en
    // memoria: así sobrevive a un redespliegue y funciona con más de una instancia.
    const otpHash = await bcrypt.hash(otp, 10)
    // Invalida los códigos anteriores del mismo correo: solo el último sirve.
    await query(
      `UPDATE app."PasswordReset" SET used_at = now()
        WHERE email = $1 AND used_at IS NULL`,
      [email]
    )
    // El cast a text es explícito: sin él Postgres tiene que adivinar el tipo de $3
    // para el operador ||, que también existe para arrays y jsonb.
    await query(
      `INSERT INTO app."PasswordReset" (email, otp_hash, expires_at)
        VALUES ($1, $2, now() + ($3::text || ' minutes')::interval)`,
      [email, otpHash, String(OTP_TTL_MINUTES)]
    )

    // Sin SMTP el código se genera pero no llega a nadie: hay que decirlo, no
    // responder "enviado correctamente" y dejar al usuario esperando un correo.
    if (!transporter) {
      res.status(HttpStatusCode.ServiceUnavailable).json({
        message:
          'No podemos enviarte el código: el correo saliente no está configurado en el servidor (faltan SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS).'
      })
      return
    }

    try {
      await sendEmail({
        to: email,
        subject: 'Código para recuperar tu contraseña',
        html: resetPasswordTemplate(otp)
      })
    } catch (err) {
      console.error('Error al enviar email con OTP:', err)
      res.status(HttpStatusCode.ServiceUnavailable).json({
        message:
          'No pudimos entregar el código a tu correo. Revisa la configuración SMTP del servidor o inténtalo más tarde.'
      })
      return
    }

    // Aquí había `io.emit('otp-sent', { email, ... })`: el correo de quien pide
    // recuperar su contraseña, anunciado a TODOS los sockets conectados. Nadie lo
    // escucha —no hay un solo `on('otp-sent')` en el front— y lo único que hacía
    // era repartir direcciones de correo y decir en vivo qué cuenta está en medio
    // de un restablecimiento, que es la señal que busca quien intenta colarse.
    // Quien pidió el código ya recibe la confirmación en la respuesta HTTP.
    res.status(HttpStatusCode.Ok).json({
      message: 'OTP enviado correctamente',
      expiresInMinutes: OTP_TTL_MINUTES
    })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error al solicitar el restablecimiento de contraseña: ${
        (error as Error).message
      }`
    })
  }
}
// El front llamaba a este paso con dos nombres distintos (`verify-code` y
// `request-password-verification`). Los dos apuntan aquí; ver auth.route.ts.
export async function verifyOtp(req: Request, res: Response) {
  // El front manda el código como `otp` o como `code` según la pantalla.
  const { email, otp, code } = req.body as {
    email?: string
    otp?: string
    code?: string
  }
  const submitted = otp ?? code

  if (!email || !submitted) {
    res
      .status(HttpStatusCode.BadRequest)
      .json({ message: 'Faltan el correo o el código' })
    return
  }

  try {
    const { rows } = await query<{ id: number; otp_hash: string }>(
      `SELECT id, otp_hash FROM app."PasswordReset"
        WHERE email = $1 AND used_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1`,
      [email]
    )
    const pending = rows[0]
    if (!pending) {
      res.status(HttpStatusCode.BadRequest).json({
        message: 'El código expiró o ya se usó. Pide uno nuevo.'
      })
      return
    }

    if (!(await bcrypt.compare(submitted, pending.otp_hash))) {
      res.status(HttpStatusCode.BadRequest).json({ message: 'Código incorrecto' })
      return
    }

    await query(
      `UPDATE app."PasswordReset" SET verified_at = now() WHERE id = $1`,
      [pending.id]
    )

    // El token es la prueba de haber acertado el código: sin él nadie puede
    // cambiar la contraseña (antes change-password no pedía absolutamente nada).
    const resetToken = jwt.sign(
      { email, purpose: 'password-reset', resetId: pending.id },
      JWT_SECRET,
      { expiresIn: `${OTP_TTL_MINUTES}m` }
    )
    res.status(HttpStatusCode.Ok).json({ message: 'OTP verificado', resetToken })
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error al verificar el OTP ${(error as Error).message}`
    })
  }
}
export const changePassword = async (req: Request, res: Response) => {
  const { email, newPassword, resetToken } = req.body as ChangePassword

  if (!email || !newPassword) {
    res
      .status(HttpStatusCode.BadRequest)
      .json({ message: 'Faltan datos para cambiar la contraseña' })
    return
  }

  // Antes este endpoint cambiaba la contraseña de cualquier correo que le pasaran,
  // sin sesión ni código: era un secuestro de cuentas en una línea. Ahora exige el
  // token que devuelve verify-code, y ese token solo se emite tras acertar el OTP.
  if (!resetToken) {
    res.status(HttpStatusCode.Unauthorized).json({
      message: 'Falta el código de verificación. Vuelve a pedir el correo de recuperación.'
    })
    return
  }

  let claims: { email?: string; purpose?: string; resetId?: number }
  try {
    claims = jwt.verify(resetToken, JWT_SECRET) as typeof claims
  } catch {
    res.status(HttpStatusCode.Unauthorized).json({
      message: 'El enlace de recuperación expiró. Pide un código nuevo.'
    })
    return
  }

  if (claims.purpose !== 'password-reset' || claims.email !== email) {
    res
      .status(HttpStatusCode.Unauthorized)
      .json({ message: 'Código de recuperación no válido para este correo' })
    return
  }

  try {
    // Un código solo sirve una vez: el UPDATE condicionado hace de cerrojo.
    const consumed = await query(
      `UPDATE app."PasswordReset" SET used_at = now()
        WHERE id = $1 AND email = $2
          AND verified_at IS NOT NULL AND used_at IS NULL AND expires_at > now()
        RETURNING id`,
      [claims.resetId, email]
    )
    if (consumed.rowCount === 0) {
      res.status(HttpStatusCode.Unauthorized).json({
        message: 'Este código ya se usó o expiró. Pide uno nuevo.'
      })
      return
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)
    await supabase
      .from('User')
      .update({
        password: hashedPassword
      })
      .eq('email', email)
    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (error) {
    // Antes respondía 200 aunque fallara: el front creía que había funcionado.
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error al actualizar la contraseña: ${(error as Error).message}`
    })
  }
}

// ---------------------------------------------------------------------------
//  Confirmación de correo
//
//  El front tenía tres pantallas (/activate, /verification/verify-email y
//  /verify-whatsapp) llamando a endpoints que este API nunca registró: las cuatro
//  rutas respondían 404 "Cannot POST" y la pantalla mostraba un error sin sentido.
//  Aquí quedan implementadas las dos que no dependen de ningún servicio externo.
// ---------------------------------------------------------------------------

/** Marca el correo como confirmado a partir del token del correo de bienvenida. */
async function confirmEmailWithToken(
  rawToken: string | undefined,
  expectedEmail: string | undefined,
  res: Response
) {
  if (!rawToken) {
    res
      .status(HttpStatusCode.BadRequest)
      .json({ message: 'Falta el token de activación' })
    return
  }

  let claims: { email?: string; purpose?: string }
  try {
    claims = jwt.verify(rawToken, JWT_SECRET) as typeof claims
  } catch {
    res.status(HttpStatusCode.BadRequest).json({
      message: 'El enlace de activación no es válido o ya caducó. Pide uno nuevo desde el inicio de sesión.'
    })
    return
  }

  if (claims.purpose !== 'account-activation' || !claims.email) {
    res
      .status(HttpStatusCode.BadRequest)
      .json({ message: 'El enlace de activación no corresponde a una confirmación de cuenta' })
    return
  }

  // La pantalla /verification/verify-email manda también el correo: si no cuadra
  // con el del token, el enlace se está usando sobre otra cuenta.
  if (expectedEmail && expectedEmail !== claims.email) {
    res
      .status(HttpStatusCode.BadRequest)
      .json({ message: 'El enlace no corresponde a este correo' })
    return
  }

  // Idempotente a propósito: reabrir el enlace no puede dar error.
  const updated = await query(
    `UPDATE app."User"
        SET email_verified_at = COALESCE(email_verified_at, now()),
            active = true,
            "updatedAt" = now()
      WHERE email = $1
      RETURNING id, email, email_verified_at`,
    [claims.email]
  )

  if (updated.rowCount === 0) {
    res
      .status(HttpStatusCode.NotFound)
      .json({ message: 'No existe una cuenta con ese correo' })
    return
  }

  res.json({ message: 'Cuenta confirmada correctamente', email: claims.email })
}

/** POST /api/auth/activate — body { token } (pantalla /activate). */
export const activateAccount = async (req: Request, res: Response) => {
  try {
    const { token } = req.body as { token?: string }
    await confirmEmailWithToken(token, undefined, res)
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error al activar la cuenta: ${(error as Error).message}`
    })
  }
}

/** POST /api/auth/verify-email — body { type, code, email } (pantalla /verification/verify-email). */
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    // Esa pantalla llama `code` al token que venía en el enlace del correo.
    const { code, token, email } = req.body as {
      code?: string
      token?: string
      email?: string
    }
    await confirmEmailWithToken(code ?? token, email, res)
  } catch (error) {
    res.status(HttpStatusCode.InternalServerError).json({
      message: `Error al verificar el correo: ${(error as Error).message}`
    })
  }
}

// ---------------------------------------------------------------------------
//  Verificación por WhatsApp
//
//  Enviar un código por WhatsApp exige una línea ya vinculada desde la que salga
//  el mensaje, y en el registro el usuario todavía no tiene ninguna. No hay forma
//  honesta de hacerlo funcionar sin ese servicio, así que estos dos endpoints
//  existen (para no devolver un 404 críptico) y contestan exactamente qué falta.
//  El registro no pasa por aquí mientras NEXT_PUBLIC_REQUIRE_WHATSAPP_VERIFICATION
//  siga en "false" en el front.
// ---------------------------------------------------------------------------
const WHATSAPP_OTP_UNAVAILABLE =
  'La verificación por WhatsApp no está disponible: no hay ninguna línea de WhatsApp vinculada desde la que enviar el código. Vincula un número en Servicios → WhatsApp (escaneando el QR) y configura WHATSAPP_OTP_NUMBER_ID en el servidor, o desactiva este paso con NEXT_PUBLIC_REQUIRE_WHATSAPP_VERIFICATION=false.'

/** POST /api/auth/verify-whatsapp — body { type, phone, code }. */
export const verifyWhatsapp = async (_req: Request, res: Response) => {
  const senderId = process.env.WHATSAPP_OTP_NUMBER_ID
  if (!senderId || !clients[senderId]) {
    res
      .status(HttpStatusCode.ServiceUnavailable)
      .json({ message: WHATSAPP_OTP_UNAVAILABLE })
    return
  }
  // Con línea configurada aún falta decidir el flujo de códigos por WhatsApp;
  // se prefiere decirlo a inventar una verificación que no comprueba nada.
  res.status(HttpStatusCode.NotImplemented).json({
    message:
      'Hay una línea configurada pero el envío de códigos por WhatsApp todavía no está implementado en el servidor.'
  })
}

/** POST /api/auth/resend-otp — body { email, phone }. */
export const resendWhatsappOtp = async (_req: Request, res: Response) => {
  res
    .status(HttpStatusCode.ServiceUnavailable)
    .json({ message: WHATSAPP_OTP_UNAVAILABLE })
}
