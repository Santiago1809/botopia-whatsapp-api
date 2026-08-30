export const PRICE_PER_GB_RAM = 0.000231 // USD por GB
export const PRICE_PER_VCPU = 0.000463 // USD por vCPU
export const PRICE_PER_MB_NETWORK = 0.0054

export const MS_IN_VCPU_MONTH = 2_592_000_000 // 30 días en milisegundos

export const notifyNewPassword = (password: string) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperación de contraseña</title>
  <style>
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background-color: #FAECD4;
      margin: 0;
      padding: 20px;
      text-align: center;
      color: #FAECD4;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: linear-gradient(145deg, #050044, #0a0050);
      padding: 0;
      border-radius: 12px;
      box-shadow: 0 5px 20px rgba(65, 30, 138, 0.3);
      overflow: hidden;
      border: 1px solid rgba(250, 236, 212, 0.1);
    }
    .header {
      background: linear-gradient(145deg, #411E8A, #362075);
      padding: 25px 20px;
      color: #FAECD4;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 0.5px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      border-bottom: 2px solid rgba(250, 236, 212, 0.1);
    }
    .content {
      margin: 30px 25px;
      font-size: 16px;
      color: #FAECD4;
      line-height: 1.6;
    }
    .otp {
      font-size: 28px;
      font-weight: bold;
      color: #010009;
      background: linear-gradient(145deg, #F3E8FF, #E8DDFA);
      padding: 15px;
      border-radius: 8px;
      display: inline-block;
      margin: 15px 0;
      min-width: 150px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      letter-spacing: 2px;
      border: 1px solid rgba(65, 30, 138, 0.1);
    }
    .footer {
      margin-top: 25px;
      padding: 15px;
      font-size: 14px;
      color: rgba(250, 236, 212, 0.7);
      border-top: 1px solid rgba(250, 236, 212, 0.1);
      background-color: rgba(5, 0, 68, 0.8);
    }
    /* Global anchor style to ensure color is applied in all email clients */
    a {
      color: #FAECD4 !important;
      text-decoration: none;
      transition: color 0.3s ease;
    }
    a:hover {
      color: #F3E8FF !important;
      text-decoration: underline;
    }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      background: linear-gradient(145deg, #411E8A, #362075);
      color: #FAECD4 !important;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      margin-top: 5px;
      border: 1px solid rgba(250, 236, 212, 0.15);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
    }
    .btn:hover {
      background: linear-gradient(145deg, #4C2A99, #411E8A);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      text-decoration: none;
    }
    p {
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">🔐 Nueva contraseña</div>
    <div class="content">
      <p>Hola,</p>
      <p>El administrador ha restablecido tu contraseña, la cual ahora es:</p>
      <div class="otp">${password}</div>
      <p style="font-size: 14px; opacity: 0.8;">Por favor, cambia esta contraseña después de iniciar sesión por motivos de seguridad.</p>
    </div>
    <div class="footer">Powered by <a href="https://lumintik.com" class="btn">Lumintik</a></div>
  </div>
</body>
</html>
`
export const resetPasswordTemplate = (otp: string | number) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperación de contraseña</title>
  <style>
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background-color: #FAECD4;
      margin: 0;
      padding: 20px;
      text-align: center;
      color: #FAECD4;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: linear-gradient(145deg, #050044, #0a0050);
      padding: 0;
      border-radius: 12px;
      box-shadow: 0 5px 20px rgba(65, 30, 138, 0.3);
      overflow: hidden;
      border: 1px solid rgba(250, 236, 212, 0.1);
    }
    .header {
      background: linear-gradient(145deg, #411E8A, #362075);
      padding: 25px 20px;
      color: #FAECD4;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 0.5px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      border-bottom: 2px solid rgba(250, 236, 212, 0.1);
    }
    .content {
      margin: 30px 25px;
      font-size: 16px;
      color: #FAECD4;
      line-height: 1.6;
    }
    .otp {
      font-size: 28px;
      font-weight: bold;
      color: #010009;
      background: linear-gradient(145deg, #F3E8FF, #E8DDFA);
      padding: 15px;
      border-radius: 8px;
      display: inline-block;
      margin: 15px 0;
      min-width: 150px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      letter-spacing: 2px;
      border: 1px solid rgba(65, 30, 138, 0.1);
    }
    .footer {
      margin-top: 25px;
      padding: 15px;
      font-size: 14px;
      color: rgba(250, 236, 212, 0.7);
      border-top: 1px solid rgba(250, 236, 212, 0.1);
      background-color: rgba(5, 0, 68, 0.8);
    }
    /* Global anchor style to ensure color is applied in all email clients */
    a {
      color: #FAECD4 !important;
      text-decoration: none;
      transition: color 0.3s ease;
    }
    a:hover {
      color: #F3E8FF !important;
      text-decoration: underline;
    }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      background: linear-gradient(145deg, #411E8A, #362075);
      color: #FAECD4 !important;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      margin-top: 5px;
      border: 1px solid rgba(250, 236, 212, 0.15);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
    }
    .btn:hover {
      background: linear-gradient(145deg, #4C2A99, #411E8A);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      text-decoration: none;
    }
    p {
      margin: 10px 0;
    }
    .note {
      font-size: 14px;
      opacity: 0.8;
      font-style: italic;
      margin-top: 15px;
      padding: 10px;
      background-color: rgba(250, 236, 212, 0.05);
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">🔐 Recuperación de Contraseña</div>
    <div class="content">
      <p>Hola,</p>
      <p>Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código OTP:</p>
      <div class="otp">${otp}</div>
      <p class="note">Si no solicitaste esto, puedes ignorar este mensaje o contactar con soporte.</p>
    </div>
    <div class="footer">Powered by <a href="https://lumintik.com" class="btn">Lumintik</a></div>
  </div>
</body>
</html>
`

export const welcomeUserTemplate = (name: string) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a Lumintik Agents</title>
  <style>
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background-color: #FAECD4;
      margin: 0;
      padding: 20px;
      text-align: center;
      color: #FAECD4 !important;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: linear-gradient(145deg, #050044, #0a0050);
      padding: 0;
      border-radius: 12px;
      box-shadow: 0 5px 20px rgba(65, 30, 138, 0.3);
      overflow: hidden;
      border: 1px solid rgba(250, 236, 212, 0.1);
    }
    .header {
      background: linear-gradient(145deg, #411E8A, #362075);
      padding: 25px 20px;
      color: #FAECD4 !important;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 0.5px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      border-bottom: 2px solid rgba(250, 236, 212, 0.1);
    }
    .content {
      margin: 30px 25px;
      font-size: 16px;
      color: #FAECD4 !important;
      line-height: 1.6;
    }
    .feature {
      display: inline-block;
      margin: 10px 5px;
      padding: 10px 15px;
      background-color: rgba(65, 30, 138, 0.4);
      border-radius: 8px;
      font-size: 14px;
      border: 1px solid rgba(250, 236, 212, 0.1);
    }
    .footer {
      margin-top: 25px;
      padding: 15px;
      font-size: 14px;
      color: rgba(250, 236, 212, 0.7);
      border-top: 1px solid rgba(250, 236, 212, 0.1);
      background-color: rgba(5, 0, 68, 0.8);
    }
    /* Global anchor style to ensure color is applied in all email clients */
    a {
      color: #FAECD4 !important;
      text-decoration: none;
      transition: color 0.3s ease;
    }
    a:hover {
      color: #F3E8FF !important;
      text-decoration: underline;
    }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      background: linear-gradient(145deg, #411E8A, #362075);
      color: #FAECD4 !important;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      margin-top: 5px;
      border: 1px solid rgba(250, 236, 212, 0.15);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
    }
    .btn:hover {
      background: linear-gradient(145deg, #4C2A99, #411E8A);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      text-decoration: none;
    }
    .highlight {
      font-weight: bold;
      color: #F3E8FF !important;
    }
    .welcome-emoji {
      font-size: 35px;
      margin-bottom: 10px;
    }
    p {
      margin: 10px 0;
    }
    .features-container {
      margin: 20px 0;
      padding: 10px;
      background-color: rgba(250, 236, 212, 0.05);
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="welcome-emoji">🎉</div>
      ¡Bienvenido a Lumintik Agents!
    </div>
    <div class="content">
      <p>Hola${name ? ` <span class="highlight">${name}</span>` : ''} 👋</p>
      <p>¡Gracias por registrarte en nuestra plataforma! Ahora puedes disfrutar de todos nuestros servicios y herramientas.</p>
      
      <div class="features-container">
        <p>Algunos servicios que podemos ofrecerte:</p>
        <div class="feature">✅ WhatsApp API</div>
        <div class="feature">🤖 Chatbots</div>
        <div class="feature">📊 Análisis</div>
        <div class="feature">👷🏻‍♂️ Equipo de ingenieros</div>
      </div>

      <p>Con tu registro, tienes 10,000 créditos gratis para que conozcas nuestro potencial y te animes a adquirir nuestros planes y juntos construir el futuro ⚡.</p>
      
      <p>Si tienes alguna duda o necesitas ayuda, no dudes en contactarnos.</p>
    </div>
    <div class="footer">Powered by <a href="https://lumintik.com" class="btn">Lumintik</a></div>
  </div>
</body>
</html>
`

export const limitReachedEmailTemplate = (
  plan: string,
  usage: number,
  limit: number
) => {
  let upgradeContent = ''

  switch (plan) {
    case 'FREE':
      upgradeContent = `
        <div style="background: linear-gradient(145deg, #F3E8FF, #E8DDFA); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(65, 30, 138, 0.1);">
          <h3 style="color: #411E8A; margin-top: 0;">🚀 ¡Actualiza a BASIC!</h3>
          <p style="color: #010009; margin: 10px 0;"><strong>Beneficios del plan BASIC:</strong></p>
          <ul style="color: #010009; margin: 10px 0; padding-left: 20px;">
            <li>1,000 mensajes mensuales</li>
            <li>Todas las funciones de IA</li>
            <li>Soporte prioritario</li>
            <li>Sin interrupciones</li>
          </ul>
          <p style="color: #411E8A; font-weight: bold;">¡Actualiza ahora y sigue conversando sin límites!</p>
        </div>`
      break

    case 'EXPIRED':
      upgradeContent = `
        <div style="background: linear-gradient(145deg, #FFE5E5, #FDD); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(220, 38, 38, 0.2);">
          <h3 style="color: #DC2626; margin-top: 0;">⚠️ Renueva tu suscripción</h3>
          <p style="color: #7F1D1D; margin: 10px 0;"><strong>Tu plan ha expirado</strong> y solo tienes acceso limitado.</p>
          <p style="color: #010009; margin: 10px 0;"><strong>Renueva para obtener:</strong></p>
          <ul style="color: #010009; margin: 10px 0; padding-left: 20px;">
            <li>Miles de mensajes mensuales</li>
            <li>IA avanzada sin interrupciones</li>
            <li>Todas las funcionalidades premium</li>
            <li>Soporte completo</li>
          </ul>
          <p style="color: #DC2626; font-weight: bold;">¡Renueva ahora y continúa sin límites!</p>
        </div>`
      break

    case 'BASIC':
      upgradeContent = `
        <div style="background: linear-gradient(145deg, #F3E8FF, #E8DDFA); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(65, 30, 138, 0.1);">
          <h3 style="color: #411E8A; margin-top: 0;">📈 ¡Actualiza a PRO!</h3>
          <p style="color: #010009; margin: 10px 0;">Tu negocio está creciendo, es hora de crecer con él.</p>
          <p style="color: #010009; margin: 10px 0;"><strong>Beneficios del plan PRO:</strong></p>
          <ul style="color: #010009; margin: 10px 0; padding-left: 20px;">
            <li>5,000 mensajes mensuales</li>
            <li>Hasta 3 números de WhatsApp</li>
            <li>Funciones avanzadas para grupos</li>
            <li>Soporte VIP</li>
          </ul>
          <p style="color: #411E8A; font-weight: bold;">¡Potencia tu comunicación al siguiente nivel!</p>
        </div>`
      break

    case 'PRO':
      upgradeContent = `
        <div style="background: linear-gradient(145deg, #F3E8FF, #E8DDFA); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(65, 30, 138, 0.1);">
          <h3 style="color: #411E8A; margin-top: 0;">🏭 ¡Actualiza a INDUSTRIAL!</h3>
          <p style="color: #010009; margin: 10px 0;">Tu empresa está en pleno crecimiento.</p>
          <p style="color: #010009; margin: 10px 0;"><strong>Beneficios del plan INDUSTRIAL:</strong></p>
          <ul style="color: #010009; margin: 10px 0; padding-left: 20px;">
            <li>10,000 mensajes mensuales</li>
            <li>Hasta 10 números de WhatsApp</li>
            <li>Máxima capacidad empresarial</li>
            <li>Soporte 24/7 dedicado</li>
          </ul>
          <p style="color: #411E8A; font-weight: bold;">¡Lleva tu negocio al nivel industrial!</p>
        </div>`
      break

    default:
      upgradeContent = `
        <div style="background: linear-gradient(145deg, #F3E8FF, #E8DDFA); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(65, 30, 138, 0.1);">
          <h3 style="color: #411E8A, #362075; margin-top: 0;">📋 Límite de mensajes alcanzado</h3>
          <p style="color: #010009; margin: 10px 0;">Para continuar usando nuestro servicio sin interrupciones, considera actualizar tu plan.</p>
          <p style="color: #010009; margin: 10px 0;">Visita nuestro sitio web para conocer los planes disponibles y sus beneficios.</p>
          <p style="color: #411E8A; font-weight: bold;">¡Gracias por confiar en nosotros!</p>
        </div>`
  }

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Límite de mensajes alcanzado - Lumintik</title>
  <style>
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background-color: #FAECD4;
      margin: 0;
      padding: 20px;
      text-align: center;
      color: #FAECD4;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: linear-gradient(145deg, #050044, #0a0050);
      padding: 0;
      border-radius: 12px;
      box-shadow: 0 5px 20px rgba(65, 30, 138, 0.3);
      overflow: hidden;
      border: 1px solid rgba(250, 236, 212, 0.1);
    }
    .header {
      background: linear-gradient(145deg, #411E8A, #362075);
      padding: 25px 20px;
      color: #FAECD4;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 0.5px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      border-bottom: 2px solid rgba(250, 236, 212, 0.1);
    }
    .content {
      margin: 30px 25px;
      font-size: 16px;
      color: #FAECD4;
      line-height: 1.6;
      text-align: left;
    }
    .usage-stats {
      background-color: rgba(250, 236, 212, 0.1);
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
      border: 1px solid rgba(250, 236, 212, 0.2);
    }
    .footer {
      margin-top: 25px;
      padding: 15px;
      font-size: 14px;
      color: rgba(250, 236, 212, 0.7);
      border-top: 1px solid rgba(250, 236, 212, 0.1);
      background-color: rgba(5, 0, 68, 0.8);
    }
    a {
      color: #FAECD4 !important;
      text-decoration: none;
      transition: color 0.3s ease;
    }
    a:hover {
      color: #F3E8FF !important;
      text-decoration: underline;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background: linear-gradient(145deg, #411E8A, #362075);
      color: #FAECD4 !important;
      text-decoration: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      margin: 10px 5px;
      border: 1px solid rgba(250, 236, 212, 0.15);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
    }
    .btn:hover {
      background: linear-gradient(145deg, #4C2A99, #411E8A);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      text-decoration: none;
    }
    p {
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">🚨 Límite de mensajes alcanzado</div>
    <div class="content">
      <p>Estimado usuario,</p>
      <p>Te escribimos para informarte que has alcanzado el límite mensual de mensajes de tu plan <strong>${plan}</strong>.</p>
      
      <div class="usage-stats">
        <h4 style="margin-top: 0; color: #F3E8FF;">📊 Estadísticas de uso:</h4>
        <p><strong>Mensajes utilizados:</strong> ${usage}/${limit}</p>
        <p><strong>Plan actual:</strong> ${plan}</p>
        <p><strong>Porcentaje usado:</strong> ${Math.round(
          (usage / limit) * 100
        )}%</p>
      </div>

      ${upgradeContent}

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://app.botopia.online/billing" class="btn">Ver Planes</a>
      </div>

      <p>Si tienes alguna duda o necesitas asistencia, nuestro equipo de soporte está disponible para ayudarte.</p>
      
      <p style="font-size: 14px; opacity: 0.8;">Este es un mensaje automático del sistema. No respondas a este correo.</p>
    </div>
    <div class="footer">Powered by <a href="https://lumintik.com" class="btn">Lumintik</a></div>
  </div>
</body>
</html>
`
}

export const advisorRequestEmailTemplate = (
  clientMessage: string,
  fecha: string,
  clientNumber: string,
  botNumber: string,
  agentTitle: string,
  conversationHistory: string
) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solicitud de asesor - ${agentTitle}</title>
  <style>
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background-color: #FAECD4;
      margin: 0;
      padding: 20px;
      text-align: center;
      color: #FAECD4;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: linear-gradient(145deg, #050044, #0a0050);
      padding: 0;
      border-radius: 12px;
      box-shadow: 0 5px 20px rgba(65, 30, 138, 0.3);
      overflow: hidden;
      border: 1px solid rgba(250, 236, 212, 0.1);
    }
    .header {
      background: linear-gradient(145deg, #411E8A, #362075);
      padding: 25px 20px;
      color: #FAECD4;
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 0.5px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      border-bottom: 2px solid rgba(250, 236, 212, 0.1);
    }
    .content {
      margin: 30px 25px;
      font-size: 16px;
      color: #FAECD4;
      line-height: 1.6;
      text-align: left;
    }
    .info-table {
      background-color: rgba(250, 236, 212, 0.1);
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
      border: 1px solid rgba(250, 236, 212, 0.2);
    }
    .info-table table {
      width: 100%;
      border-collapse: collapse;
    }
    .info-table td {
      padding: 8px 0;
      font-size: 15px;
      color: #FAECD4;
      vertical-align: top;
    }
    .info-table td:first-child {
      font-weight: bold;
      width: 150px;
    }
    .conversation-history {
      background-color: rgba(250, 236, 212, 0.05);
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
      border: 1px solid rgba(250, 236, 212, 0.1);
    }
    .conversation-history table {
      width: 100%;
      border-collapse: collapse;
    }
    .conversation-history td {
      padding: 5px 8px;
      font-size: 15px;
      color: #FAECD4;
      vertical-align: top;
    }
    .conversation-history td:first-child {
      font-weight: bold;
      width: 80px;
    }
    .warning {
      background: linear-gradient(145deg, #DC2626, #B91C1C);
      color: #FAECD4;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
      font-size: 15px;
      font-weight: bold;
      border: 1px solid rgba(220, 38, 38, 0.3);
    }
    .footer {
      margin-top: 25px;
      padding: 15px;
      font-size: 14px;
      color: rgba(250, 236, 212, 0.7);
      border-top: 1px solid rgba(250, 236, 212, 0.1);
      background-color: rgba(5, 0, 68, 0.8);
    }
    a {
      color: #FAECD4 !important;
      text-decoration: none;
      transition: color 0.3s ease;
    }
    a:hover {
      color: #F3E8FF !important;
      text-decoration: underline;
    }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      background: linear-gradient(145deg, #411E8A, #362075);
      color: #FAECD4 !important;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      margin-top: 5px;
      border: 1px solid rgba(250, 236, 212, 0.15);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
    }
    .btn:hover {
      background: linear-gradient(145deg, #4C2A99, #411E8A);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      text-decoration: none;
    }
    p {
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">🙋‍♂️ Solicitud de Asesor - ${agentTitle}</div>
    <div class="content">
      <p><strong>Un cliente ha solicitado hablar con un asesor en WhatsApp.</strong></p>
      
      <div class="info-table">
        <h4 style="margin-top: 0; color: #F3E8FF;">📋 Información del cliente:</h4>
        <table>
          <tr><td><strong>Mensaje del cliente:</strong></td><td>${clientMessage}</td></tr>
          <tr><td><strong>Fecha y hora:</strong></td><td>${fecha}</td></tr>
          <tr><td><strong>Número del cliente:</strong></td><td>${clientNumber}</td></tr>
          <tr><td><strong>Número destino (bot):</strong></td><td>${botNumber}</td></tr>
        </table>
      </div>

      <div class="conversation-history">
        <h4 style="margin-top: 0; color: #F3E8FF;">💬 Historial reciente de la conversación:</h4>
        <table>
          ${conversationHistory}
        </table>
      </div>

      <div class="warning">
        ⚠️ La IA ha sido desactivada para este contacto. Recuerda volver a activarla manualmente si deseas que la IA siga respondiendo a este cliente.
      </div>

      <p>Por favor, atiende a este cliente lo antes posible para brindarle la mejor experiencia de servicio.</p>
    </div>
    <div class="footer">Powered by <a href="https://lumintik.com" class="btn">Lumintik</a></div>
  </div>
</body>
</html>
`
