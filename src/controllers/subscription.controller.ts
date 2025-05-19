import type { Request, Response } from 'express';
import fetch from 'node-fetch';
import { supabase } from '../config/db';
import type { CustomRequest } from '../interfaces/global';

//Preguntas a Santigo si hay una mejor forma de hacer esto
interface CreateSubscriptionBody {
    planToken: string;
    amount: number; // Ahora acepta decimales
    planName: string;
    userId: string;
    email: string;
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
        
        const response = await fetch(
            `https://api-sbx.dlocalgo.com/v1/subscription/${subscriptionId}/execution/${invoiceId}`,
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

        const dloData = await response.json();

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

        // Validación adicional
        if (subscription.amount !== dloData.subscription.plan.amount) {
            console.warn('⚠️ Diferencia en montos:', {
                storedAmount: subscription.amount,
                dloAmount: dloData.subscription.plan.amount,
                subscriptionId: subscription.id,
                difference: Math.abs(subscription.amount - dloData.subscription.plan.amount)
            });
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

        // 4. Si el pago fue completado, activar el plan
        if (dloData.status === 'COMPLETED') {
            await activateUserPlan(subscription.user_id, subscription.plan_name);
        }

        res.status(200).json({ success: true });
    } catch (err) {
        console.error("💥 Error procesando notificación:", err);
        res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
};

// Funciones auxiliares
type SubscriptionType = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE' | 'EXPIRED';

async function activateUserPlan(userId: string, planName: string) {
    // Normalize plan name: remove special chars, convert to uppercase, and trim
    const normalizedPlanName = planName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
        .toUpperCase()
        .trim();

    // Convert the plan name to the subscription type
    let subscription: SubscriptionType;
    switch (true) {
        case /PLAN\s*BASIC/.test(normalizedPlanName):
        case /BASICO/.test(normalizedPlanName):
        case /BÁSICO/.test(normalizedPlanName):
            subscription = 'BASIC';
            break;
        case /PLAN\s*PRO/.test(normalizedPlanName):
        case /PRO/.test(normalizedPlanName):
            subscription = 'PRO';
            break;
        case /PLAN\s*ENTERPRISE/.test(normalizedPlanName):
        case /ENTERPRISE/.test(normalizedPlanName):
            subscription = 'ENTERPRISE';
            break;
        default:
            console.error('Plan no reconocido:', {
                original: planName,
                normalized: normalizedPlanName
            });
            // Instead of throwing, we could set a default plan
            subscription = 'BASIC';
            console.warn(`⚠️ Plan no reconocido, usando BASIC como valor por defecto para: ${planName}`);
    }

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

async function deactivateUserPlan(userId: string) {
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
            .select('id, email, subscription, updatedAt, createdAt') // Cambiado a camelCase
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
            lastUpdated: userData.updatedAt || userData.createdAt,
            subscription: subscription ? {
                planName: subscription.plan_name,
                amount: subscription.amount_paid,
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

// Funciones auxiliares para límites y características por plan
function getPlanLimits(plan: SubscriptionType | null): Record<string, number | boolean> {
    switch (plan) {
        case 'BASIC':
            return {
                maxWhatsappNumbers: 1,
                maxMessages: 1000,
                aiEnabled: false
            };
        case 'PRO':
            return {
                maxWhatsappNumbers: 3,
                maxMessages: 5000,
                aiEnabled: true
            };
        case 'ENTERPRISE':
            return {
                maxWhatsappNumbers: 10,
                maxMessages: 50000,
                aiEnabled: true
            };
        case 'FREE':
        default:
            return {
                maxWhatsappNumbers: 1,
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
        case 'ENTERPRISE':
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

// Agregar una función helper para comparar montos
function areAmountsEqual(amount1: number, amount2: number, tolerance = 0.01): boolean {
    return Math.abs(amount1 - amount2) < tolerance;
}