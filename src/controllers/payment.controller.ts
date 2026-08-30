import { HttpStatusCode } from 'axios';
import type { Request, Response } from 'express';
import { supabase } from '../config/db.js';
import type { CustomRequest } from '../interfaces/global.js';

// `node-fetch` se importaba sin estar declarado en package.json: hoy resuelve de
// pura casualidad como dependencia transitiva, y el primer `npm install` que la
// pierda tumba el arranque del API entero. Node 20 trae fetch nativo.

// Antes esta URL era siempre la de sandbox, incluso en producción: los cobros
// reales nunca se consultaban contra el entorno real. subscription.controller.ts
// ya conmutaba por NODE_ENV; aquí se hace igual para que los dos coincidan.
const DLOCAL_API_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://api.dlocalgo.com'
    : 'https://api-sbx.dlocalgo.com';

/** Respuesta de DLocal Go: fetch nativo devuelve `unknown`, se acota aquí. */
interface DlocalPaymentResponse {
  status?: string;
  message?: string;
  order_id?: string;
  [key: string]: unknown;
}

export const createPayment = async (req: Request, res: Response): Promise<void> => {
  const { amount, currency, country, order_id, description, success_url, back_url, notification_url } = req.body;

  if (!amount || !order_id) {
    res.status(400).json({ message: 'Faltan campos requeridos' });
    return;
  }

  const auth = `${process.env.API_KEY}:${process.env.API_SECRET}`

  try {
    const response = await fetch(`${DLOCAL_API_BASE}/v1/payments`, {
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

    const data = (await response.json()) as DlocalPaymentResponse;

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
    const response = await fetch(`${DLOCAL_API_BASE}/v1/payments/${payment_id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${auth}`,
        "Content-Type": "application/json",
      },
    });

    const data = (await response.json()) as DlocalPaymentResponse;

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
  const url = `${DLOCAL_API_BASE}/v1/payments/${payment_id}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${auth}`,
        "Content-Type": "application/json",
      },
    });

    const data = (await response.json()) as DlocalPaymentResponse;

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


/**
 * GET /api/payments/latest-success
 *
 * La pantalla /billing/processing la consultaba en bucle cada 3 segundos y siempre
 * recibía 404 (nunca existió), así que el usuario se quedaba mirando un spinner
 * hasta que caducaba la sesión. Lee el estado de la ÚLTIMA suscripción del usuario
 * autenticado en nuestra propia base: no necesita claves de DLocal, porque quien
 * escribe esa fila es el webhook /api/subscriptions/notification.
 */
export const latestSuccess = async (req: CustomRequest, res: Response) => {
  try {
    if (!req.user?.username) {
      res
        .status(HttpStatusCode.Unauthorized)
        .json({ message: 'Sesión no válida' });
      return;
    }

    const { data: user } = await supabase
      .from('User')
      .select('id')
      .eq('username', req.user.username)
      .single();

    if (!user) {
      res
        .status(HttpStatusCode.NotFound)
        .json({ message: 'Usuario no encontrado' });
      return;
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id, status, invoice_id, external_id, plan_name, updated_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!subscription) {
      // No hay ningún intento de cobro: el front deja de esperar y lo dice.
      res.status(200).json({
        status: 'none',
        message: 'Todavía no hemos recibido ningún pago tuyo.'
      });
      return;
    }

    // DLocal usa PAID/PENDING/REJECTED y la fila nace en 'pending' (minúscula).
    const raw = String(subscription.status ?? '').toUpperCase();
    const status =
      raw === 'PAID' ? 'paid' : raw === 'REJECTED' || raw === 'CANCELLED' ? 'rejected' : 'pending';

    res.status(200).json({
      status,
      payment_id: subscription.invoice_id ?? subscription.external_id ?? null,
      plan_name: subscription.plan_name ?? null,
      updated_at: subscription.updated_at ?? subscription.created_at
    });
  } catch (error) {
    console.error('Error consultando el último pago:', error);
    res
      .status(HttpStatusCode.InternalServerError)
      .json({ message: 'No pudimos consultar el estado de tu pago' });
  }
};
