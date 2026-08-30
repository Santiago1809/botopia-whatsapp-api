/**
 * =============================================================================
 *  PARCHE: WhatsApp Web renombró `MsgKey._serialized` a `$1`
 * =============================================================================
 *
 *  QUÉ PASÓ. En julio de 2026 WhatsApp minificó la clase `MsgKey` de su cliente
 *  web: la propiedad que guarda el identificador serializado de un mensaje dejó
 *  de llamarse `_serialized` y pasó a llamarse `$1`. El corte está entre los
 *  builds 2.3000.1042386815 (aún `_serialized`) y 2.3000.1042401057 (ya `$1`).
 *  Hoy Meta sirve la serie 2.3000.1046xxx, así que estamos del lado nuevo.
 *
 *  POR QUÉ NOS ROMPE. whatsapp-web.js lee `_serialized` en tres sitios críticos,
 *  y en los tres recibe `undefined`:
 *
 *    · getChatModel      -> Msg.get(chat.lastReceivedKey._serialized)
 *                           IndexedDB recibe undefined y lanza. Es el error "r"
 *                           que salía al leer CUALQUIER chat, también grupos
 *                           normales sin nada de LID.
 *    · sendMessage       -> Msg.get(newMsgKey._serialized)   -> el error "t".
 *    · Message.id        -> msg.id._serialized queda undefined del lado de Node,
 *                           que es por lo que un mensaje real llegaba y se
 *                           descartaba con "el mensaje no trae id".
 *
 *  POR QUÉ NO SE ARREGLA SOLO. Los parches están escritos —hay seis PRs abiertos
 *  en whatsapp-web.js— pero ninguno fusionado, y el proyecto lleva semanas sin
 *  respuesta de sus mantenedores. Tampoco sirve fijar una versión anterior de
 *  WhatsApp Web: el único build publicado previo al rename es el más antiguo que
 *  queda en el repositorio de versiones, que rota a diario y lo borrarán en días.
 *
 *  QUÉ HACE ESTE PARCHE. Se inyecta en la página ANTES de que cargue WhatsApp Web
 *  (`evalOnNewDoc`, opción pública de whatsapp-web.js) y le devuelve a `MsgKey`
 *  un `_serialized` que funciona, sin tocar node_modules ni instalar nada.
 *
 *  EL DETALLE QUE LA MAYORÍA DE PARCHES DE LA COMUNIDAD HACE MAL: los getters de
 *  prototipo NO cruzan el puente entre el navegador y Node. Un `get _serialized()`
 *  a secas arregla la página pero deja `msg.id._serialized` en undefined aquí,
 *  que es justo la mitad que nos importa. Por eso el `set` define `_serialized`
 *  como propiedad PROPIA y enumerable: así viaja.
 *
 *  Adaptado del arreglo de wa-js (wppconnect), que sí lo absorbió el mismo día.
 */

/**
 * Se ejecuta DENTRO del navegador, no en Node: no puede cerrar sobre nada de
 * este módulo. Por eso es una función autocontenida.
 */
export function parcheMsgKey(): void {
  const instalar = (): boolean => {
    // `globalThis` y no `window`: este archivo lo compila TypeScript con los tipos de
    // Node, donde `window` no existe. En el navegador, que es donde esta función se
    // ejecuta de verdad, `globalThis` ES `window`.
    const w = globalThis as unknown as { require?: (m: string) => unknown }
    const modulo = w.require && w.require('WAWebMsgKey')
    const Clase = (typeof modulo === 'function'
      ? modulo
      : (modulo as { default?: unknown } | undefined)?.default) as
      | { prototype: Record<string, unknown> }
      | undefined
    if (!Clase || !Clase.prototype) return false

    const proto = Clase.prototype

    // El nombre minificado no se adivina: se lee del propio toString() de la
    // clase, que devuelve la propiedad cacheada. Así el parche sobrevive a que
    // WhatsApp lo vuelva a renombrar a `$2` la semana que viene.
    const fuente = Function.prototype.toString.call(
      proto.toString as unknown as () => string
    )
    const cacheada = /\breturn this\.([$A-Za-z_][\w$]*)/.exec(fuente)?.[1]

    if (!cacheada) return false
    if (cacheada === '_serialized') return true // build antiguo: nada que hacer
    if (Object.getOwnPropertyDescriptor(proto, cacheada)) return true // ya parcheado

    const definirPropia = (obj: object, valor: unknown) =>
      Object.defineProperty(obj, '_serialized', {
        value: valor,
        writable: true,
        enumerable: true,
        configurable: true
      })

    // Las claves creadas ANTES de instalar el parche llevan el nombre nuevo como
    // propiedad propia, y una propiedad propia eclipsa al accessor del
    // prototipo. Hay que convertirlas de una en una, la primera vez que se tocan.
    const migrar = (clave: Record<string, unknown>) => {
      const propia = Object.getOwnPropertyDescriptor(clave, cacheada)
      if (propia) {
        delete clave[cacheada]
        definirPropia(clave, propia.value)
      }
    }

    Object.defineProperty(proto, cacheada, {
      configurable: true,
      get(this: Record<string, unknown>) {
        return this._serialized
      },
      set(this: Record<string, unknown>, valor: unknown) {
        definirPropia(this, valor)
      }
    })

    Object.defineProperty(proto, '_serialized', {
      configurable: true,
      get(this: Record<string, unknown>) {
        migrar(this)
        return Object.getOwnPropertyDescriptor(this, '_serialized')?.value
      },
      set(this: Record<string, unknown>, valor: unknown) {
        definirPropia(this, valor)
      }
    })

    const toStringOriginal = proto.toString as () => string
    proto.toString = function (this: Record<string, unknown>) {
      migrar(this)
      return toStringOriginal.call(this)
    }

    return true
  }

  // El módulo no existe hasta que WhatsApp Web termina de cargar sus bundles, así
  // que se reintenta. El corte a los 2 minutos evita dejar un intervalo vivo para
  // siempre en una pestaña que nunca llegó a cargar.
  const reloj = setInterval(() => {
    try {
      if (instalar()) clearInterval(reloj)
    } catch {
      /* la página aún no está lista; se reintenta */
    }
  }, 200)
  setTimeout(() => clearInterval(reloj), 120000)
}
