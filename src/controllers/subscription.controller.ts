import type { Request, Response } from 'express';
// Se quitó `import fetch from 'node-fetch'`: el paquete no estaba declarado en
// package.json y solo resolvía como dependencia transitiva. Node 20 trae fetch.
import { supabase } from '../config/db.js';
import { topesDelPlan } from '../lib/planLimits.js';
import type { CustomRequest } from '../interfaces/global.js';

// ---------------------------------------------------------------------------
//  Dinero
//
//  Las columnas de monto son `numeric` (decimal exacto) y node-postgres las
//  entrega como STRING para no perder precisión — antes había un
//  types.setTypeParser(1700, Number) en src/lib/db.ts que las degradaba a double,
//  y sobre eso se comparaba con `!==`. Un monto como 149900.10 podía dejar de ser
//  igual a sí mismo después de ir y volver de la base.
//
//  Las dos funciones de abajo son la forma correcta de tratarlo:
//    · aCentavos    -> lleva cualquier representación (string, number) a un ENTERO
//                      de centavos, que es exacto y se puede comparar con ===.
//    · aNumeroParaJson -> convierte a number SOLO al serializar la respuesta, para
//                      que el JSON que ve el front siga siendo idéntico al de hoy.
// ---------------------------------------------------------------------------

/** Monto -> entero de centavos. Devuelve null si no es un número reconocible. */
function aCentavos(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
    if (!Number.isFinite(n)) return null;
    // Math.round sobre el producto: 149900.10 * 100 da 14990009.999... en binario;
    // redondear es lo que devuelve el entero exacto que se buscaba.
    return Math.round(n * 100);
}

/** Compara dos montos de forma exacta, sin depender de la coma flotante. */
function montosIguales(a: unknown, b: unknown): boolean {
    const ca = aCentavos(a);
    const cb = aCentavos(b);
    return ca !== null && cb !== null && ca === cb;
}

/** Para la respuesta HTTP: mantiene el JSON como estaba (número, no string). */
function aNumeroParaJson(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = typeof valor === 'number' ? valor : Number(valor);
    return Number.isFinite(n) ? n : null;
}


// ---------------------------------------------------------------------------
//  Catálogo servidor de planes de dLocal Go
//
//  El plan que se activa NO puede salir del body: createSubscription guarda el
//  planName/amount que mande el cliente, y antes activateUserPlan usaba ese
//  plan_name tal cual — pagar el plan más barato con planName "INDUSTRIAL"
//  activaba INDUSTRIAL. La única fuente confiable es lo que dLocal devuelve del
//  pago real (plan_token y amount), cruzado contra ESTA tabla del servidor.
//
//  PENDIENTE_LLENAR: los plan_token reales no aparecen en este código (viven en
//  el panel de dLocal Go / en el front). Hay que reemplazar las claves
//  'PENDIENTE_TOKEN_*' por los tokens reales y poner el precio de cada plan en
//  `amount` (misma moneda que reporta dLocal). Mientras el catálogo esté vacío,
//  todo pago COMPLETED activa BASIC (el plan más bajo de pago) y deja log.error:
//  degradar es reversible; regalar INDUSTRIAL no.
// ---------------------------------------------------------------------------
const CATALOGO_PLANES_DLOCAL: Record<
    string,
    { plan: SubscriptionType; amount: number | null }
> = {
    // PENDIENTE_LLENAR — sustituir claves por los plan_token reales de dLocal Go
    // y `amount: null` por el precio exacto del plan:
    PENDIENTE_TOKEN_BASIC: { plan: 'BASIC', amount: null },
    PENDIENTE_TOKEN_PRO: { plan: 'PRO', amount: null },
    PENDIENTE_TOKEN_INDUSTRIAL: { plan: 'INDUSTRIAL', amount: null }
};

/** Plan de pago más bajo: a lo que se degrada cualquier pago que no cuadre. */
const PLAN_MAS_BAJO: SubscriptionType = 'BASIC';

/**
 * Deriva el plan efectivo del PAGO (datos de dLocal), nunca del body.
 * Token fuera del catálogo o monto que no cuadra => plan más bajo + log.error.
 */
function planEfectivoDelPago(
    planTokenPago: unknown,
    amountPago: unknown
): SubscriptionType {
    const token = typeof planTokenPago === 'string' ? planTokenPago : '';
    const entrada = CATALOGO_PLANES_DLOCAL[token];
    if (!entrada) {
        console.error(
            '❌ plan_token del pago no está en CATALOGO_PLANES_DLOCAL: se activa el plan más bajo. Llenar el catálogo (PENDIENTE_LLENAR) con los tokens reales.',
            { planTokenPago, amountPago }
        );
        return PLAN_MAS_BAJO;
    }
    if (entrada.amount !== null && !montosIguales(entrada.amount, amountPago)) {
        console.error(
            '❌ El monto del pago no cuadra con el precio del catálogo: se activa el plan más bajo.',
            { token, esperado: entrada.amount, pagado: amountPago }
        );
        return PLAN_MAS_BAJO;
    }
    return entrada.plan;
}

export const createSubscription = async (req: CustomRequest, res: Response) => {
    try {
        const { planToken, amount, planName } = req.body;

        // Validar campos requeridos
        if (!planToken || !amount || !planName || !req.user?.username) {
            res.status(400).json({
                success: false,
                message: "Faltan campos requeridos o usuario no autenticado"
            });
            return;
        }

        // Validaciones adicionales
        if (!/^[a-zA-Z0-9]+$/.test(planToken)) {
             res.status(400).json({
                success: false,
                message: "Formato de planToken inválido"
            });
            return
        }

        if (amount <= 0) {
            res.status(400).json({
                success: false,
                message: "Monto inválido"
            });
            return;
        }

        const { data: user_id, error: userErrorId } = await supabase
            .from('User')
            .select('id, email')
            .eq('username', req.user.username)
            .single();

        if (userErrorId || !user_id) {
            console.error('Error al obtener ID o email del usuario:', userErrorId);
            res.status(500).json({
                success: false,
                message: "Error al obtener información del usuario"
            });
            return;
        }

        // 1. Crear identificador único para la suscripción
        const externalId = `sub_${user_id.id}_${Date.now()}`;

        // 2. Construir URL de checkout de DLO
        const baseUrl = process.env.NODE_ENV === 'production'
            ? 'https://checkout.dlocalgo.com'
            : 'https://checkout-sbx.dlocalgo.com'; 

        const checkoutUrl = new URL(`${baseUrl}/validate/subscription/${planToken}`);
        checkoutUrl.searchParams.append('email', user_id.email);
        checkoutUrl.searchParams.append('external_id', externalId);

        // 3. Guardar en Supabase
        const { data: subscription, error: dbError } = await supabase
            .from('subscriptions')
            .insert([{
                user_id: user_id.id,
                email: user_id.email,
                plan_token: planToken,
                external_id: externalId,
                amount: amount,
                plan_name: planName,
                status: 'pending',
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (dbError) {
            console.error('Error al crear la suscripción en DB:', dbError);
            res.status(500).json({
                success: false,
                message: "Error al registrar la suscripción"
            });
            return;
        }

        res.status(200).json({
            success: true,
            checkoutUrl: checkoutUrl.toString(),
            subscriptionId: subscription.id
        });

    } catch (error) {
        console.error('Error en createSubscription:', error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor"
        });
    }
};

export const handleNotification = async (req: Request, res: Response) => {
    const { invoiceId, mid, subscriptionId } = req.body;

    if (!subscriptionId || !invoiceId) {
        console.error('❌ Webhook recibido sin datos necesarios:', req.body);
        res.status(400).json({ success: false, message: "Faltan datos requeridos" });
        return;
    }

    try {
        // 1. Consultar DLO para obtener los detalles completos
        const auth = `${process.env.API_KEY}:${process.env.API_SECRET}`;
        // 2. Construir URL de checkout de DLO
        const baseUrl = process.env.NODE_ENV === 'production'
            ? 'https://api.dlocalgo.com'
            : 'https://api-sbx.dlocalgo.com';
        
        const response = await fetch(
            `${baseUrl}/v1/subscription/${subscriptionId}/execution/${invoiceId}`,
            {
                headers: {
                    Authorization: `Bearer ${auth}`,
                    "Content-Type": "application/json",
                },
            }
        );

        if (!response.ok) {
            console.error('❌ Error consultando DLO:', await response.text());
            res.status(500).json({ success: false, message: "Error consultando DLO" });
            return;
        }

        let dloData;
        const responseText = await response.text();
        if (!responseText) {
            console.error("❌ Respuesta vacía de DLO");
            res.status(500).json({ success: false, message: "Respuesta vacía de DLO" });
            return;
        }

        try {
            dloData = JSON.parse(responseText);
        } catch {
            console.error("❌ Error al parsear JSON de DLO:", responseText);
            res.status(500).json({ success: false, message: "Error al procesar respuesta de DLO" });
            return;
        }

        // 2. Buscar la suscripción más reciente pendiente
        const { data: subscriptions, error: fetchError } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('plan_token', dloData.subscription.plan.plan_token)
            .eq('email', dloData.subscription.client_email)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);

        if (fetchError) {
            console.error('❌ Error al buscar la suscripción:', {
                error: fetchError,
                planToken: dloData.subscription.plan.plan_token,
                email: dloData.subscription.client_email
            });
            res.status(500).json({ 
                success: false, 
                message: "Error consultando suscripción",
                details: fetchError.message
            });
            return;
        }

        if (!subscriptions || subscriptions.length === 0) {
            console.error('❌ No se encontró suscripción pendiente:', {
                planToken: dloData.subscription.plan.plan_token,
                email: dloData.subscription.client_email
            });
            res.status(404).json({ 
                success: false, 
                message: "Suscripción no encontrada",
                details: `No se encontró suscripción pendiente para el plan ${dloData.subscription.plan.plan_token} y email ${dloData.subscription.client_email}`
            });
            return;
        }

        // Get the most recent subscription
        const subscription = subscriptions[0];

        // El plan que se va a activar sale del PAGO (plan_token + amount que
        // reporta dLocal, cruzados con el catálogo del servidor), jamás del
        // plan_name/amount que el cliente escribió en el body al crear la fila.
        let planEfectivo = planEfectivoDelPago(
            dloData.subscription.plan.plan_token,
            dloData.subscription.plan.amount
        );

        // Antes esta diferencia solo se avisaba (console.warn) y se activaba
        // igual el plan_name del body. Si el monto guardado no cuadra con lo que
        // dLocal cobró de verdad, el body mintió: se degrada al plan más bajo.
        if (!montosIguales(subscription.amount, dloData.subscription.plan.amount)) {
            const centavosGuardado = aCentavos(subscription.amount);
            const centavosDlo = aCentavos(dloData.subscription.plan.amount);
            console.error('❌ Diferencia en montos: se degrada al plan más bajo.', {
                storedAmount: subscription.amount,
                dloAmount: dloData.subscription.plan.amount,
                subscriptionId: subscription.id,
                difference:
                    centavosGuardado !== null && centavosDlo !== null
                        ? Math.abs(centavosGuardado - centavosDlo) / 100
                        : 'no comparable'
            });
            planEfectivo = PLAN_MAS_BAJO;
        }

        // 3. Actualizar con todos los datos de DLO
        const { error: updateError } = await supabase
            .from('subscriptions')
            .update({
                status: dloData.status === 'COMPLETED' ? 'PAID' : 'PENDING',
                invoice_id: invoiceId,
                dlo_subscription_id: subscriptionId,
                mid: mid,
                amount_paid: dloData.amount_paid,
                amount_received: dloData.amount_received,
                currency: dloData.currency,
                checkout_currency: dloData.checkout_currency,
                balance_currency: dloData.balance_currency,
                payment_method: dloData.subscription.payment_method_code,
                client_name: `${dloData.subscription.client_first_name} ${dloData.subscription.client_last_name}`,
                client_document: dloData.subscription.client_document,
                client_document_type: dloData.subscription.client_document_type,
                external_transaction_id: dloData.external_transaction_id,
                subscription_token: dloData.subscription.subscription_token,
                dlo_status: dloData.status,
                scheduled_date: dloData.subscription.scheduled_date,
                updated_at: new Date().toISOString()
            })
            .eq('id', subscription.id);

        if (updateError) {
            console.error('❌ Error actualizando suscripción:', updateError);
            res.status(500).json({ success: false, message: "Error actualizando suscripción" });
            return;
        }

        // 4. Si el pago fue completado, activar el plan DERIVADO DEL PAGO
        // (nunca subscription.plan_name, que vino del body del cliente).
        if (dloData.status === 'COMPLETED') {
            await activateUserPlan(subscription.user_id, planEfectivo);
        }

        res.status(200).json({ success: true });
    } catch (err) {
        console.error("💥 Error procesando notificación:", err);
        res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
};

type SubscriptionType = 'FREE' | 'BASIC' | 'PRO' | 'INDUSTRIAL' | 'EXPIRED';

// Antes recibía un `planName: string` (el plan_name que el CLIENTE escribió en
// el body de createSubscription) y lo parseaba con regex: pagar el plan barato
// mandando planName "INDUSTRIAL" activaba INDUSTRIAL. Ahora recibe el plan ya
// derivado del pago real via planEfectivoDelPago(); aquí no se interpreta nada.
async function activateUserPlan(userId: string, subscription: SubscriptionType) {

    const { error } = await supabase
        .from('User')
        .update({
            subscription,
            subscription_updated_at: new Date().toISOString()
        })
        .eq('id', userId);

    if (error) {
        console.error('Error activando plan del usuario:', error);
        throw error;
    }
}

/* async function deactivateUserPlan(userId: string) {
    const { error } = await supabase
        .from('User')
        .update({
            subscription: 'EXPIRED',
            subscription_updated_at: new Date().toISOString()
        })
        .eq('id', userId);

    if (error) {
        console.error('Error desactivando plan del usuario:', error);
        throw error;
    }
}

async function handleExpiredSubscription(userId: string) {
    await deactivateUserPlan(userId);
    // Aquí puedes agregar lógica adicional para manejar suscripciones expiradas
}
 */
export const getUserSubscription = async (req: CustomRequest, res: Response) => {
    try {
        if (!req.user?.username) {
            res.status(401).json({
                success: false,
                message: "Usuario no autenticado"
            });
            return;
        }

        // 1. Obtener ID del usuario usando los nombres correctos de las columnas
        const { data: userData, error: userError } = await supabase
            .from('User')
            .select('id, email, subscription, updatedAt, createdAt, subscription_updated_at') // Cambiado a camelCase
            .eq('username', req.user.username)
            .single();

        if (userError || !userData) {
            console.error('Error al obtener información del usuario:', userError);
            res.status(404).json({
                success: false,
                message: "Usuario no encontrado"
            });
            return;
        }

        // 2. Obtener la última suscripción activa
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userData.id)
            .eq('status', 'PAID')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // Si no hay error pero tampoco hay suscripción, significa que el usuario es FREE
        if (subError?.code === 'PGRST116') {
            const subscriptionInfo = {
                currentPlan: 'FREE' as SubscriptionType,
                lastUpdated: userData.createdAt, // Ya está correcto en camelCase
                subscription: null,
                limits: getPlanLimits('FREE'),
                features: getPlanFeatures('FREE')
            };

            res.status(200).json({
                success: true,
                data: subscriptionInfo
            });
            return;
        }

        // Si hay otro tipo de error, lo manejamos
        if (subError) {
            console.error('Error al consultar suscripciones:', subError);
            res.status(500).json({
                success: false,
                message: "Error consultando suscripciones"
            });
            return;
        }

        // 3. Estructurar la respuesta para usuarios con suscripción pagada
        const subscriptionInfo = {
            currentPlan: userData.subscription || 'FREE' as SubscriptionType,
            lastUpdated: userData.subscription_updated_at || userData.updatedAt,
            subscription: subscription ? {
                planName: subscription.plan_name,
                // Conversión explícita AQUÍ, al serializar, y no con un parser
                // global del driver: así el JSON que recibe el front sigue siendo
                // un número igual que siempre, pero el valor viaja exacto por
                // dentro (ver el bloque de "Dinero" arriba).
                amount: aNumeroParaJson(subscription.amount_paid),
                currency: subscription.checkout_currency,
                checkoutCurrency: subscription.checkout_currency,
                balanceCurrency: subscription.balance_currency,
                paymentMethod: subscription.payment_method,
                nextPaymentDate: subscription.scheduled_date,
                lastPaymentDate: subscription.updated_at,
                status: subscription.status,
                details: {
                    clientName: subscription.client_name,
                    documentType: subscription.client_document_type,
                    documentNumber: subscription.client_document,
                }
            } : null,
            limits: getPlanLimits(userData.subscription),
            features: getPlanFeatures(userData.subscription)
        };

        res.status(200).json({
            success: true,
            data: subscriptionInfo
        });

    } catch (error) {
        console.error('Error consultando suscripción:', error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor"
        });
    }
};

// Funciones auxiliares para límites y características por plan.
//
// maxWhatsappNumbers y maxAgents SALEN de topesDelPlan (src/lib/planLimits.ts),
// que es la misma tabla que APLICA los topes en addWhatsAppNumber y addAgent:
// tenerlos aquí duplicados es como se llegó a mostrar un límite que nadie
// cobraba. maxMessages se queda literal porque su fuente de verdad es
// app."PlanLimit" en la base (que es la que cobra); estos números son la copia
// para pintar en pantalla y coinciden con la semilla de db/schema.sql.
function getPlanLimits(plan: SubscriptionType | null): Record<string, number | boolean> {
    const topes = topesDelPlan(plan);
    switch (plan) {
        case 'BASIC':
            return {
                maxWhatsappNumbers: topes.maxLineas,
                maxAgents: topes.maxAgentes,
                maxMessages: 1000,
                aiEnabled: false
            };
        case 'PRO':
            return {
                maxWhatsappNumbers: topes.maxLineas,
                maxAgents: topes.maxAgentes,
                maxMessages: 5000,
                aiEnabled: true
            };
        case 'INDUSTRIAL':
            return {
                maxWhatsappNumbers: topes.maxLineas,
                maxAgents: topes.maxAgentes,
                maxMessages: 50000,
                aiEnabled: true
            };
        case 'FREE':
        default:
            return {
                maxWhatsappNumbers: topes.maxLineas,
                maxAgents: topes.maxAgentes,
                maxMessages: 100,
                aiEnabled: false
            };
    }
}

function getPlanFeatures(plan: SubscriptionType | null): Record<string, boolean> {
    switch (plan) {
        case 'BASIC':
            return {
                canAddWhatsapp: true,
                canSendMessages: true,
                canUseAI: false,
                canCreateTemplates: true
            };
        case 'PRO':
            return {
                canAddWhatsapp: true,
                canSendMessages: true,
                // Decía false y contradecía a getPlanLimits (PRO aiEnabled=true)
                // y al comportamiento real: los grupos con IA piden justamente
                // plan PRO o INDUSTRIAL (messages.controller.ts). La pantalla de
                // facturación mostraba "Usar IA" tachado a quien sí la tiene.
                canUseAI: true,
                canCreateTemplates: true
            };
        case 'INDUSTRIAL':
            return {
                canAddWhatsapp: true,
                canSendMessages: true,
                canUseAI: true,
                canCreateTemplates: true
            };
        case 'FREE':
        default:
            return {
                canAddWhatsapp: true,
                canSendMessages: true,
                canUseAI: false,
                canCreateTemplates: true
            };
    }
}
/* 
// Agregar una función helper para comparar montos
function areAmountsEqual(amount1: number, amount2: number, tolerance = 0.01): boolean {
    return Math.abs(amount1 - amount2) < tolerance;
} */