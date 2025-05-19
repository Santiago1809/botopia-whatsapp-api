const { sendEmail } = require('./src/services/email.service');

(async () => {
  try {
    const result = await sendEmail({
      to: 'stevenplazas77@gmail.com',
      subject: 'Prueba de envío de correo',
      html: '<h2>¡Esto es una prueba de envío de correo desde el script de Node.js!</h2><p>Si ves este mensaje, el sistema de correo funciona correctamente.</p>'
    });
    console.log('Resultado:', result);
  } catch (err) {
    console.error('Error al enviar el correo de prueba:', err);
  }
})(); 