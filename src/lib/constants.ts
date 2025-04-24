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
    <div class="footer">Powered by <a href="https://botopia.tech" class="btn">Botopia</a></div>
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
    <div class="footer">Powered by <a href="https://botopia.tech" class="btn">Botopia</a></div>
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
  <title>Bienvenido a Botopia</title>
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
      ¡Bienvenido a Botopia!
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
    <div class="footer">Powered by <a href="https://botopia.tech" class="btn">Botopia</a></div>
  </div>
</body>
</html>
`
