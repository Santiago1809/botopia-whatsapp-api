# Webhooks de Lumintik Agents

Cada vez que ocurre algo en tu cuenta —entra un mensaje, un contacto te
contesta, una línea se cae— te lo mandamos a tu servidor con una petición
`POST` firmada.

Los das de alta en **Conexiones** dentro de la app: pones la dirección, marcas
los eventos que te interesan y te damos un secreto. **Ese secreto se muestra una
sola vez.** Con él verificas que lo que te llega lo mandamos nosotros.

---

## 1. La petición que te llega

```
POST https://tuservidor.com/webhooks/lumintik
Content-Type: application/json
User-Agent: Lumintik-Webhooks/1
X-Lumintik-Event: contact.replied
X-Lumintik-Event-Id: 8f0c6c2a-...       ← el evento (igual en todos los destinos)
X-Lumintik-Delivery: 3b1e9d44-...       ← la entrega (igual en todos los reintentos)
X-Lumintik-Timestamp: 1756483200
X-Lumintik-Signature: v1,mS9c...=
```

El cuerpo siempre tiene la misma forma:

```json
{
  "id": "8f0c6c2a-4e21-4a55-9f0e-2c6b1f7d5a11",
  "type": "contact.replied",
  "occurred_at": "2026-08-30T14:22:07.412Z",
  "api_version": "2026-08-29",
  "account_id": 42,
  "data": { }
}
```

- `id` identifica **el evento**. Si tienes tres webhooks registrados, los tres
  reciben el mismo `id`.
- `X-Lumintik-Delivery` identifica **la entrega a ti**. No cambia entre
  reintentos: **usa este valor para deduplicar.**
- `occurred_at` es el momento del hecho, no el del envío. Puede ser bastante
  anterior si hubo reintentos.

### Qué esperamos de tu servidor

Responde **2xx en menos de 10 segundos**. Cualquier otra cosa la tratamos como
fallo. Lo correcto es guardar el evento y contestar `200` en el acto,
procesándolo después: si haces el trabajo pesado antes de responder, acabarás
recibiendo el mismo evento varias veces por timeout.

**No garantizamos el orden.** Dos eventos pueden llegarte cambiados de orden;
por eso cada uno lleva `occurred_at`. Si el orden te importa, ordena por ese
campo, no por el momento en que lo recibiste.

---

## 2. Cómo verificar la firma

Firmamos con **HMAC-SHA256** el texto:

```
{X-Lumintik-Event-Id}.{X-Lumintik-Timestamp}.{cuerpo crudo}
```

Tres reglas que hay que respetar o no cuadrará nunca:

1. **Usa el cuerpo CRUDO**, tal y como llega por el cable. Si lo parseas a JSON y
   lo vuelves a serializar, cambian el orden de las claves y los escapes, y la
   firma deja de coincidir.
2. **Firma con los bytes del secreto, no con la cadena.** El secreto tiene la
   forma `whsec_<base64>`; hay que quitar el prefijo `whsec_` y **decodificar el
   base64** antes de usarlo como clave del HMAC.
3. **Compara en tiempo constante** (`hmac.compare_digest`, `crypto.timingSafeEqual`).
   Una comparación normal filtra la firma correcta byte a byte por el tiempo de
   respuesta.

La cabecera puede traer **varias firmas separadas por espacio**
(`v1,AAA= v1,BBB=`). Eso ocurre durante las 24 horas siguientes a rotar un
secreto: mandamos la nueva y la anterior para que puedas cambiarlo sin cortar
nada. **Acepta si cuadra CUALQUIERA de ellas.**

Rechaza además lo que llegue con un `X-Lumintik-Timestamp` que se aparte más de
**5 minutos** de tu reloj: es lo que impide que alguien capture una petición
nuestra y la reproduzca más tarde.

### Node.js

```js
const crypto = require('node:crypto')
const express = require('express')

const app = express()
const SECRETO = process.env.LUMINTIK_WEBHOOK_SECRET // whsec_...

// express.raw y NO express.json: hace falta el cuerpo tal cual llegó.
app.post(
  '/webhooks/lumintik',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const id = req.get('X-Lumintik-Event-Id') || ''
    const ts = req.get('X-Lumintik-Timestamp') || ''
    const firmas = req.get('X-Lumintik-Signature') || ''

    // Anti-replay: ±5 minutos.
    const ahora = Math.floor(Date.now() / 1000)
    if (!/^\d+$/.test(ts) || Math.abs(ahora - Number(ts)) > 300) {
      return res.status(400).send('timestamp fuera de ventana')
    }

    // whsec_XXXX -> bytes de XXXX
    const clave = Buffer.from(SECRETO.slice(SECRETO.indexOf('_') + 1), 'base64')
    const esperada = crypto
      .createHmac('sha256', clave)
      .update(`${id}.${ts}.${req.body.toString('utf8')}`)
      .digest('base64')
    const esperadaBuf = Buffer.from(esperada)

    const valida = firmas.split(' ').some((parte) => {
      const firma = Buffer.from(parte.slice(parte.indexOf(',') + 1))
      return (
        firma.length === esperadaBuf.length &&
        crypto.timingSafeEqual(firma, esperadaBuf)
      )
    })
    if (!valida) return res.status(401).send('firma inválida')

    const evento = JSON.parse(req.body.toString('utf8'))

    // Deduplica por la entrega y responde YA; procesa después.
    // if (yaProcesado(req.get('X-Lumintik-Delivery'))) return res.sendStatus(200)
    res.sendStatus(200)

    manejar(evento)
  }
)

app.listen(3000)
```

### Python (Flask)

```python
import base64, hashlib, hmac, os, time
from flask import Flask, request, abort

app = Flask(__name__)
SECRETO = os.environ["LUMINTIK_WEBHOOK_SECRET"]  # whsec_...


@app.post("/webhooks/lumintik")
def lumintik():
    id_evento = request.headers.get("X-Lumintik-Event-Id", "")
    ts = request.headers.get("X-Lumintik-Timestamp", "")
    firmas = request.headers.get("X-Lumintik-Signature", "")

    # Anti-replay: ±5 minutos.
    if not ts.isdigit() or abs(int(time.time()) - int(ts)) > 300:
        abort(400, "timestamp fuera de ventana")

    crudo = request.get_data()  # bytes tal cual llegaron
    clave = base64.b64decode(SECRETO.split("_", 1)[-1])
    esperada = base64.b64encode(
        hmac.new(clave, f"{id_evento}.{ts}.".encode() + crudo, hashlib.sha256).digest()
    ).decode()

    valida = any(
        hmac.compare_digest(parte.split(",", 1)[1], esperada)
        for parte in firmas.split(" ")
        if "," in parte
    )
    if not valida:
        abort(401, "firma inválida")

    evento = request.get_json(force=True)

    # Deduplica por X-Lumintik-Delivery y procesa en segundo plano.
    encolar(evento, request.headers.get("X-Lumintik-Delivery"))
    return "", 200
```

---

## 3. Reintentos

Si no respondes 2xx, reintentamos hasta **6 veces en total**:

| Intento | Espera desde el anterior | Acumulado |
| ------- | ------------------------ | --------- |
| 1       | —                        | 0         |
| 2       | 30 s                     | 30 s      |
| 3       | 5 min                    | ~5,5 min  |
| 4       | 30 min                   | ~36 min   |
| 5       | 2 h                      | ~2,6 h    |
| 6       | 6 h                      | ~8,6 h    |

Con un ±20 % de variación aleatoria, para no golpear todos a la vez cuando un
hosting compartido vuelve a la vida.

Qué hacemos según lo que respondas:

| Respuesta                                     | Qué hacemos                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `2xx`                                         | Entregado. Se reinicia el contador de fallos.                                  |
| `429`                                         | Esperamos lo que digas en `Retry-After` (hasta 6 h). **No cuenta como fallo.**  |
| `408`, `5xx`, timeout, DNS, TLS, corte        | Reintentamos con el calendario de arriba.                                      |
| `410 Gone`                                    | **Desactivamos el webhook al instante.** Nos estás diciendo que ya no existe.  |
| Otros `4xx` (`400`, `401`, `403`, `404`, `422`) | No reintentamos: el cuerpo sería idéntico, la respuesta también.              |
| `3xx`                                         | No seguimos redirecciones. Se registra como fallo.                             |

**Desactivación automática:** si acumulas **20 entregas seguidas** sin poder
completarse, desactivamos el webhook, lo marcamos en Conexiones y te avisamos por
correo. Reactivarlo es un botón. Reactivar **no** reenvía lo que se perdió: para
eso hay un botón de *Reenviar* en cada entrega del historial.

---

## 4. Requisitos de la URL

- **`https://` obligatorio.** La firma autentica el contenido pero no lo cifra.
- Puerto **443** (o 8443).
- Un **nombre de dominio**, no una IP escrita a mano.
- Tiene que resolver a una **dirección pública**. Rechazamos rangos privados,
  loopback, link-local y direcciones de metadata de nube.
- **Sin redirecciones.** Apunta directamente al endpoint final.

Esto se comprueba al guardar **y otra vez antes de cada envío**, porque un DNS
puede cambiar después de haber pasado la validación. Si tu dirección es legítima
pero la rechazamos, el botón **Enviar evento de prueba** de Conexiones te dice el
motivo exacto (por ejemplo: *"el nombre resuelve a 10.0.1.4, una dirección
privada"*).

---

## 5. Catálogo de eventos

Los nombres **no cambian nunca**. Si algún día el contenido tiene que romper,
nacerá `message.received.v2` y los dos convivirán.

| Evento                           | Cuándo se dispara                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `message.received`               | Entró un mensaje de un contacto.                                                                           |
| `message.sent`                   | Salió un mensaje (bot, agente o plantilla).                                                                |
| `contact.created`                | Alguien escribió por primera vez.                                                                          |
| `contact.replied`                | El contacto **respondió** a un mensaje nuestro. Exige que exista un mensaje anterior del bot o de un agente. |
| `contact.stage_changed`          | Una tarjeta cambió de columna en el embudo. Trae la etapa anterior.                                        |
| `contact.ai_disabled`            | Se apagó la IA de ese contacto.                                                                            |
| `contact.deleted`                | Se borró el contacto. Solo viajan identificadores.                                                         |
| `conversation.handoff_requested` | La IA escaló la conversación a una persona.                                                                |
| `line.connected`                 | Una línea quedó operativa.                                                                                 |
| `line.disconnected`              | Una línea dejó de estar operativa.                                                                         |
| `line.qr_pending`                | Hay un QR esperando a que alguien lo escanee.                                                              |
| `usage.limit_reached`            | La cuenta agotó el cupo mensual de su plan.                                                                |
| `daily.summary`                  | Un resumen por cuenta y día.                                                                               |

### Ejemplo: `contact.replied`

```json
{
  "id": "8f0c6c2a-4e21-4a55-9f0e-2c6b1f7d5a11",
  "type": "contact.replied",
  "occurred_at": "2026-08-30T14:22:07.412Z",
  "api_version": "2026-08-29",
  "account_id": 42,
  "data": {
    "contact": {
      "id": "b2d1f0a3-77c4-4e8b-9a10-5f2e3c4d6b71",
      "phone": "573005554444",
      "name": "Ana Pérez",
      "funnel_stage": "en-contacto",
      "priority": "media",
      "tags": []
    },
    "line": {
      "id": "1e7a2b90-3c44-4f21-8d55-0a9b7c6e5d32",
      "label": "Clínica Norte",
      "channel": "meta"
    },
    "message": {
      "id": "6c9d0e1f-2a3b-4c5d-8e7f-9a0b1c2d3e4f",
      "preview": "Sí, cuéntame más sobre el tratamiento",
      "sent_at": "2026-08-30T14:22:07.412Z"
    },
    "replied_to": { "sent_at": "2026-08-27T14:22:07.412Z", "sender": "bot" },
    "silence_seconds": 259200
  }
}
```

`silence_seconds` es lo que hace útil el evento: *contestó a los 3 días* no es
lo mismo que *contestó a los 40 segundos*.

### Ejemplo: `contact.stage_changed`

```json
{
  "type": "contact.stage_changed",
  "data": {
    "contact": { "id": "b2d1...", "phone": "573005554444", "name": "Ana Pérez",
                 "funnel_stage": "cita-agendada", "priority": "alta", "tags": [] },
    "line": { "id": "1e7a...", "label": "Clínica Norte", "channel": "meta" },
    "from_stage": "en-contacto",
    "to_stage": "cita-agendada",
    "changed_at": "2026-08-30T15:01:44.220Z"
  }
}
```

`from_stage` sale del valor anterior que ve la base de datos en el momento del
cambio. No incluimos quién lo movió: hoy el sistema no registra el autor de un
cambio de etapa, y preferimos no mandar un dato que no tenemos.

### Ejemplo: `daily.summary`

```json
{
  "type": "daily.summary",
  "data": {
    "date": "2026-08-29",
    "timezone": "America/Bogota",
    "totales": {
      "messages_in": 148, "messages_out": 131, "new_contacts": 12,
      "replies": 27, "handoffs": 3, "stage_changes": 9,
      "ai_disabled": 3, "lines_down": 1, "lines_up": 1
    },
    "lines_down": [
      { "label": "Clínica Norte", "reason": "credentials_invalid",
        "at": "2026-08-29T03:11:02.000Z" }
    ],
    "replied": [
      { "name": "Ana Pérez", "phone": "573005554444",
        "preview": "Sí, cuéntame más", "at": "2026-08-29T14:22:07.412Z" }
    ]
  }
}
```

El resumen cubre el **día local completo anterior** (00:00 a 24:00 en tu zona
horaria), y sale a la hora que configures. Nunca un día a medias, para que los
números se puedan comparar entre sí.

---

## 6. Qué NO te mandamos nunca

Ni en el payload ni en ningún otro sitio:

- Las credenciales de WhatsApp Business (token de Meta, `NUMBER_ID`, `WABA_ID`).
- Los teléfonos internos de tu equipo configurados en la línea.
- Contraseñas, códigos de recuperación o datos de pago.
- Los prompts de tus agentes de IA.
- El código QR de una línea: es una credencial de sesión — quien lo escanee se
  apodera de la línea. `line.qr_pending` te avisa de que hay uno esperando, pero
  el código solo se ve en la app.

### El texto de los mensajes

Por defecto **no enviamos el contenido completo de las conversaciones**: viaja
`preview`, un recorte de 140 caracteres. Si necesitas el texto íntegro, actívalo
en el webhook con *Incluir el texto completo de los mensajes* y a partir de
entonces cada payload traerá también `body`.

Está apagado por defecto a propósito: el contenido de las conversaciones con tus
clientes es el dato más sensible que maneja la plataforma, y sacarlo de nuestra
frontera tiene que ser una decisión explícita tuya, no algo que ocurra sin que te
enteres.

---

## 7. Rotar el secreto

Desde Conexiones, botón **Rotar**. Te damos el secreto nuevo (una sola vez) y
durante **24 horas** firmamos con el nuevo *y* con el anterior, mandando las dos
firmas en la cabecera. Cambias el secreto en tu servidor cuando te venga bien,
dentro de esa ventana, sin coordinar nada y sin perder ni un evento.

Si pierdes un secreto, no se puede recuperar: lo guardamos cifrado y ni nosotros
lo mostramos dos veces. La salida es rotarlo.

---

## 8. Preguntas frecuentes

**¿Puedo recibir el mismo evento dos veces?**
Sí. Un timeout tuyo al que le sigue un reintento nuestro entrega dos veces algo
que quizá ya procesaste. Deduplica por `X-Lumintik-Delivery`, que no cambia
entre reintentos.

**¿Llegan en orden?**
No hay garantía de orden global. Ordena por `occurred_at`.

**¿Qué pasa si mi servidor está caído una noche entera?**
Reintentamos hasta ~8,6 horas por evento. Lo que caiga fuera de esa ventana se
puede reenviar a mano desde el historial de entregas.

**¿Puedo apuntar dos webhooks a la misma URL?**
No. Sería recibirlo todo duplicado, y es el fallo más común en integraciones de
webhooks; la app lo impide.

**¿Cómo pruebo antes de tener nada montado?**
Crea el webhook apuntando a un receptor de pruebas (por ejemplo webhook.site) y
usa el botón **Enviar evento de prueba**. Es una petición firmada de verdad, para
que compruebes tu verificación, pero no pasa por la cola ni aparece en tu
historial. Se distingue de un evento real en dos sitios:

- lleva la cabecera `X-Lumintik-Test: true`
- su `type` es `webhook.test`, que **no existe en el catálogo** y por lo tanto
  nunca lo vas a recibir por otra vía

Así, un `switch (evento.type)` en tu código no puede confundir una prueba con un
hecho real y disparar una automatización con datos falsos.
