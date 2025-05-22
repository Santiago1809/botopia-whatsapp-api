import type { Request, Response } from 'express';
import fetch from 'node-fetch';

export const createPayment = async (req: Request, res: Response): Promise<void> => {
  const { amount, currency, country, order_id, description, success_url, back_url, notification_url } = req.body;

  if (!amount || !order_id) {
    res.status(400).json({ message: 'Faltan campos requeridos' });
    return;
  }

  const auth = `${process.env.API_KEY}:${process.env.API_SECRET}`

  try {
    const response = await fetch('https://api-sbx.dlocalgo.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth}`,
      },
      body: JSON.stringify({
        amount,
        currency: currency || 'COP',
        country: country || 'CO',
        order_id,
        description,
        success_url,
        back_url,
        notification_url,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json({ message: data.message || 'Error en DLocalGo' });
      return;
    }

    res.status(200).json(data); // Incluye redirect_url y demás
  } catch (error) {
    console.error('Error creando pago:', error);
    res.status(500).json({ message: 'Error interno al crear el pago' });
  }
};

export const handleNotification = async (req: Request, res: Response) => {
  const { payment_id } = req.body;

  if (!payment_id) {
    res.status(400).json({ success: false, message: "payment_id faltante" });
    return 
  }

  const auth = `${process.env.API_KEY}:${process.env.API_SECRET}`

  try {
    // 1. Consultar DLocalGo por el estado real del pago
    const response = await fetch(`https://api-sbx.dlocalgo.com/v1/payments/${payment_id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${auth}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Error al consultar el estado del pago:", data);
       res.status(500).json({ success: false });
       return
    }

    const { status } = data;

    if (status === "PAID") {
      // Aquí puedes activar la suscripción en tu base de datos
      // await activateSubscription(order_id, payment_id);
    }

     res.status(200).json({ success: true });
     return
  } catch (err) {
    console.error("Error procesando notificación:", err);
     res.status(500).json({ success: false });
     return
  }
};

export const confirmPayment = async (req: Request, res: Response) => {
  const payment_id = req.query.payment_id as string;

  if (!payment_id) {
    console.error('❌ [confirmPayment] payment_id faltante');
    res.status(400).json({ status: "error", message: "payment_id requerido" });
    return;
  }

  const auth = `${process.env.API_KEY}:${process.env.API_SECRET}`;
  const url = `https://api-sbx.dlocalgo.com/v1/payments/${payment_id}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${auth}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok || !data.status) {
      console.error('❌ [confirmPayment] Fallo al verificar pago:', data.message || data);
      res.status(500).json({ status: "error", message: "No se pudo verificar el estado del pago" });
      return;
    }

    if (data.status === "PAID") {
      // await activateSubscription(data.order_id, payment_id); // si quieres activarlo aquí también
      res.status(200).json({ status: "paid" });
      return;
    }

    console.warn(`⚠️ [confirmPayment] El estado del pago no es PAID: ${data.status}`);
    res.status(200).json({ status: "error" });
    return;

  } catch (error) {
    console.error('💥 [confirmPayment] Error inesperado al consultar el pago:', error);
    res.status(500).json({ status: "error" });
    return;
  }
};

