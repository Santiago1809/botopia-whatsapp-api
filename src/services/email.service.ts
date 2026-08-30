import nodemailer from 'nodemailer'
import { config } from 'dotenv'

config()

// Verificar variables de entorno requeridas
const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName])

// NO hacer process.exit - solo advertir y crear transporter si está disponible
let transporter: nodemailer.Transporter | null = null

if (missingEnvVars.length > 0) {
  console.warn('⚠️ Faltan variables de entorno para el servicio de correo:', missingEnvVars)
  console.warn('⚠️ El servicio de email estará deshabilitado. Las funciones que requieran email fallarán.')
} else {
  // Crear el transporter con configuración mejorada solo si todas las variables están presentes
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false // Permite certificados autofirmados
      }
    })
    console.log('✅ Servicio de correo configurado correctamente')
  } catch (error) {
    console.error('❌ Error al configurar el servicio de correo:', error)
    transporter = null
  }
}

// Exportar transporter (puede ser null si no está configurado)
export { transporter }

// Función auxiliar para enviar correos con mejor manejo de errores
export const sendEmail = async (options: {
  to: string
  subject: string
  html: string
}) => {
  // Verificar si el transporter está configurado
  if (!transporter) {
    const error = new Error('Servicio de correo no configurado. Faltan variables de entorno SMTP.')
    console.error('❌ Error al enviar correo:', error.message)
    throw error
  }

  try {
    const mailOptions = {
      // MAIL_FROM separado de SMTP_USER: con un proveedor transaccional (Resend,
      // SES, Postmark) y dominio verificado, la cuenta con la que uno se
      // autentica deja de valer como remitente. Se conserva SMTP_USER como
      // respaldo para no cambiar el comportamiento de quien no la configure.
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      ...options
    }
    
    console.log('📧 Intentando enviar correo a:', options.to)
    const info = await transporter.sendMail(mailOptions)
    console.log('✅ Correo enviado exitosamente:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('❌ Error al enviar correo:', error)
    throw error
  }
}