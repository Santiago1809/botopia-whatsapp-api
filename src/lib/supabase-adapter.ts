/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * =============================================================================
 *  ADAPTADOR supabase-js -> pg
 * =============================================================================
 *
 *  Reproduce la MISMA cadena que ya usa el código (`from().select().eq().single()`,
 *  `.insert()`, `.update()`, `.delete()`, `.upsert()`, `.rpc()`) sobre un pool de
 *  `pg`, para no reescribir los 105 call sites uno por uno.
 *
 *  Dos decisiones de diseño que NO son cosméticas:
 *
 *  1) NUNCA LANZA por un error de la base. Devuelve siempre `{ data, error }`.
 *     Decenas de sitios hacen `const { data: user } = await supabase...` sin mirar
 *     `error`. Con un cliente `pg` desnudo, una consulta mala lanza excepción y
 *     rutas que hoy responden "no encontrado" pasarían a responder 500. Conservar
 *     la semántica de supabase-js es lo que hace que el corte sea seguro.
 *
 *  2) SÍ LANZA, y en el arranque, ante cualquier método de PostgREST que no esté
 *     implementado. Un `.ilike()` nuevo tiene que reventar en desarrollo con un
 *     mensaje claro, no devolver silenciosamente resultados incorrectos en
 *     producción. Por eso los métodos no soportados existen como stubs que lanzan
 *     en vez de simplemente faltar (un `.or is not a function` no dice qué hacer).
 *
 *  Soporta EXACTAMENTE lo que el código usa hoy, ni un método más:
 *    from · select · insert · update · delete · upsert(onConflict)
 *    eq · gte · lte · in · is · order · limit · single · rpc
 *
 *  Lo que deliberadamente NO soporta y hay que escribir en SQL directo con
 *  `query()` de ./db.ts:
 *    · joins embebidos `tabla!inner(...)`  -> PostgREST devuelve un objeto anidado
 *    · `.or('a.eq.x,b.eq.y')`              -> DSL propio; generalizarlo es
 *                                             reimplementar PostgREST
 */

import { query } from './db.js'

// ---------------------------------------------------------------------------
//  Tabla -> identificador calificado.
//  Doble función: fija el esquema (todo vive en `app` en el Postgres unificado)
//  y actúa de lista blanca — una tabla nueva mal escrita revienta al instante en
//  vez de producir un error de SQL confuso.
// ---------------------------------------------------------------------------
const TABLES: Record<string, string> = {
  User: 'app."User"',
  WhatsAppNumber: 'app."WhatsAppNumber"',
  Agent: 'app."Agent"',
  SyncedContactOrGroup: 'app."SyncedContactOrGroup"',
  Unsyncedcontact: 'app."Unsyncedcontact"',
  Telemetry: 'app."Telemetry"',
  PlanLimit: 'app."PlanLimit"',
  UserMessageUsage: 'app."UserMessageUsage"',
  subscriptions: 'app.subscriptions'
}

// ---------------------------------------------------------------------------
//  Funciones RPC. `kind` describe cómo entrega PostgREST el resultado:
//   · 'scalar' -> la función devuelve UN valor; `data` es ese valor pelado.
//   · 'setof'  -> la función devuelve filas; `data` es un array de objetos.
//  Los call sites dependen de esa diferencia: stats.controller.ts:133 hace
//  `result._sum...` (objeto) y messages.controller.ts:169 hace `usageData[0]` (array).
// ---------------------------------------------------------------------------
const RPCS: Record<string, { sql: string; params: string[]; kind: 'scalar' | 'setof' }> = {
  delete_contacts_by_numberid: {
    sql: 'app.delete_contacts_by_numberid',
    params: ['p_numberid'],
    kind: 'scalar'
  },
  telemetry_summary: {
    sql: 'app.telemetry_summary',
    params: ['start_date', 'end_date'],
    kind: 'scalar'
  },
  get_user_message_usage: {
    sql: 'app.get_user_message_usage',
    params: ['p_user_id'],
    kind: 'setof'
  },
  // Chequeo de tope + incremento en UNA sola operación atómica. Reemplaza al
  // leer-decidir-escribir de incrementMessageUsage, que perdía mensajes cuando
  // llegaban dos a la vez y reventaba con 23505 en el primero de cada mes.
  increment_message_usage: {
    sql: 'app.increment_message_usage',
    params: ['p_user_id'],
    kind: 'setof'
  }
  // app.run_retention NO está aquí a propósito: este adaptador liga los
  // parámetros por POSICIÓN, así que una función con argumentos opcionales
  // recibiría NULL en los que no se pasan y perdería sus valores por defecto.
  // Se llama con SQL directo y argumentos nombrados desde src/lib/retention.ts.
}

export interface PostgrestError {
  message: string
  details: string
  hint: string
  code: string
}

/**
 * Unión discriminada, igual que la de supabase-js. No es cosmética: es lo que
 * hace que `if (error) throw error` estreche `data` a `any[]` y que los
 * `.map()/.filter()` de los call sites sigan tipando sus parámetros bajo
 * `noImplicitAny`. Con un simple `{ data: any }` el compilador pierde ese contexto.
 */
export type PostgrestResponse =
  | { data: any[]; error: null }
  | { data: null; error: PostgrestError }

/** Lo que devuelve una cadena terminada en `.single()`: un objeto, no un array. */
export type PostgrestSingleResponse =
  | { data: any; error: null }
  | { data: null; error: PostgrestError }

/** Error que devuelve PostgREST cuando `.single()` no obtiene exactamente 1 fila. */
function notSingleError(rowCount: number): PostgrestError {
  return {
    code: 'PGRST116',
    message: 'JSON object requested, multiple (or no) rows returned',
    details: `The result contains ${rowCount} rows`,
    hint: ''
  }
}

function toPostgrestError(err: any): PostgrestError {
  return {
    code: err?.code ?? 'PGERR',
    message: err?.message ?? String(err),
    details: err?.detail ?? '',
    hint: err?.hint ?? ''
  }
}

function unsupported(what: string): never {
  throw new Error(
    `no soportado por el adaptador: ${what}. ` +
      'Reescribe este call site con SQL directo usando query() de src/lib/db.ts, ' +
      'o añade el método al adaptador si es una necesidad general.'
  )
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Entrecomilla un identificador. Rechaza cualquier cosa que no sea un nombre simple. */
function ident(name: string): string {
  const clean = name.trim()
  if (!IDENT.test(clean)) {
    unsupported(`el identificador "${name}"`)
  }
  return `"${clean}"`
}

/**
 * Traduce la lista de columnas de PostgREST a una lista SELECT de SQL.
 * Rechaza lo que PostgREST resolvía con sintaxis propia: joins embebidos
 * (`lines!inner(...)`) y alias (`col:otra`, y el `col as otra` que ni siquiera es
 * sintaxis válida de PostgREST — ver conversationService.ts:27).
 */
function selectList(cols: string): string {
  const raw = cols.trim()
  if (raw === '' || raw === '*') return '*'

  if (raw.includes('(') || raw.includes('!')) {
    unsupported(`el join embebido select('${raw}')`)
  }

  // El health check del arranque pide `select('count')`. En PostgREST eso era un
  // agregado; aquí se traduce explícitamente para que el chequeo siga sirviendo.
  if (raw === 'count') return 'count(*)::int AS "count"'

  return raw
    .split(',')
    .map((c) => {
      const item = c.trim()
      if (item === '*') return '*'
      if (/\sas\s/i.test(item) || item.includes(':')) {
        unsupported(`el alias de columna "${item}"`)
      }
      return ident(item)
    })
    .join(', ')
}

/**
 * Codifica un valor JS para `pg`.
 * Arrays y objetos planos van a jsonb (contacts.tags, lines.tags, events.datos):
 * si se pasaran crudos, node-postgres los serializaría como array de Postgres
 * (`{a,b}`) y el INSERT en una columna jsonb fallaría.
 */
function encode(value: unknown): unknown {
  if (value === undefined) return null
  if (value === null) return null
  if (value instanceof Date) return value
  if (Buffer.isBuffer(value)) return value
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

type FilterKind = 'eq' | 'gte' | 'lte' | 'in' | 'isNull'
interface Filter {
  kind: FilterKind
  column: string
  value?: unknown
}

class QueryBuilder implements PromiseLike<PostgrestResponse> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | null = null
  private selectCols = '*'
  private returning = false
  private returningCols = '*'
  private rows: Record<string, unknown>[] = []
  private patch: Record<string, unknown> = {}
  private conflictColumns: string[] = []
  private conflictDoNothing = false
  private filters: Filter[] = []
  private orders: { column: string; ascending: boolean }[] = []
  private limitCount: number | null = null
  private wantsSingle = false

  constructor(private readonly table: string) {}

  // ----- operaciones -------------------------------------------------------

  select(cols = '*'): this {
    if (this.op === null) {
      this.op = 'select'
      this.selectCols = cols
    } else {
      // .insert(...).select() / .update(...).eq(...).select(): en PostgREST esto
      // pide que la mutación devuelva las filas afectadas -> RETURNING.
      this.returning = true
      this.returningCols = cols
    }
    return this
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.op = 'insert'
    this.rows = Array.isArray(values) ? values : [values]
    return this
  }

  update(values: Record<string, unknown>): this {
    this.op = 'update'
    this.patch = values
    return this
  }

  delete(): this {
    this.op = 'delete'
    return this
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean }
  ): this {
    if (!options?.onConflict) {
      unsupported('.upsert() sin onConflict')
    }
    this.op = 'upsert'
    this.rows = Array.isArray(values) ? values : [values]
    this.conflictColumns = options.onConflict.split(',').map((c) => c.trim())
    this.conflictDoNothing = options.ignoreDuplicates === true
    return this
  }

  // ----- filtros -----------------------------------------------------------

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: 'eq', column, value })
    return this
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ kind: 'gte', column, value })
    return this
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ kind: 'lte', column, value })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ kind: 'in', column, value: values })
    return this
  }

  is(column: string, value: null): this {
    // El código solo usa .is(col, null) (databaseService.ts del CRM). Cualquier
    // otro valor sería .is(col, true/false), que aquí no se implementa.
    if (value !== null) unsupported(`.is('${column}', ${String(value)})`)
    this.filters.push({ kind: 'isNull', column })
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending !== false })
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  // `.single()` es terminal en todo el código. Devuelve un thenable con el tipo
  // "un objeto" en vez de "un array", igual que supabase-js.
  single(): PromiseLike<PostgrestSingleResponse> {
    this.wantsSingle = true
    return this as unknown as PromiseLike<PostgrestSingleResponse>
  }

  // ----- métodos de PostgREST deliberadamente NO implementados -------------
  // Existen para que un uso nuevo falle en desarrollo con un mensaje accionable.

  or(filter: string): never {
    return unsupported(`.or('${filter}')`)
  }
  neq(): never {
    return unsupported('.neq()')
  }
  gt(): never {
    return unsupported('.gt()')
  }
  lt(): never {
    return unsupported('.lt()')
  }
  like(): never {
    return unsupported('.like()')
  }
  ilike(): never {
    return unsupported('.ilike()')
  }
  not(): never {
    return unsupported('.not()')
  }
  match(): never {
    return unsupported('.match()')
  }
  filter(): never {
    return unsupported('.filter()')
  }
  contains(): never {
    return unsupported('.contains()')
  }
  containedBy(): never {
    return unsupported('.containedBy()')
  }
  overlaps(): never {
    return unsupported('.overlaps()')
  }
  textSearch(): never {
    return unsupported('.textSearch()')
  }
  range(): never {
    return unsupported('.range()')
  }
  maybeSingle(): never {
    return unsupported('.maybeSingle()')
  }
  csv(): never {
    return unsupported('.csv()')
  }
  throwOnError(): never {
    return unsupported('.throwOnError()')
  }

  // ----- ejecución ---------------------------------------------------------

  private buildWhere(params: unknown[]): string {
    if (this.filters.length === 0) return ''
    const parts = this.filters.map((f) => {
      const col = ident(f.column)
      switch (f.kind) {
        case 'isNull':
          return `${col} IS NULL`
        case 'in':
          params.push(f.value)
          return `${col} = ANY($${params.length})`
        case 'gte':
          params.push(encode(f.value))
          return `${col} >= $${params.length}`
        case 'lte':
          params.push(encode(f.value))
          return `${col} <= $${params.length}`
        case 'eq':
        default:
          params.push(encode(f.value))
          return `${col} = $${params.length}`
      }
    })
    return ` WHERE ${parts.join(' AND ')}`
  }

  private buildTail(): string {
    let tail = ''
    if (this.orders.length > 0) {
      const parts = this.orders.map(
        (o) => `${ident(o.column)} ${o.ascending ? 'ASC' : 'DESC'}`
      )
      tail += ` ORDER BY ${parts.join(', ')}`
    }
    if (this.limitCount !== null) {
      tail += ` LIMIT ${Number(this.limitCount)}`
    }
    return tail
  }

  private buildSql(): { text: string; params: unknown[] } {
    const params: unknown[] = []

    switch (this.op) {
      case 'select': {
        const where = this.buildWhere(params)
        return {
          text: `SELECT ${selectList(this.selectCols)} FROM ${this.table}${where}${this.buildTail()}`,
          params
        }
      }

      case 'insert':
      case 'upsert': {
        if (this.rows.length === 0) {
          // PostgREST acepta un insert vacío sin tocar nada; se replica.
          return { text: 'SELECT 1 WHERE false', params }
        }
        // Unión de claves de todas las filas: si una fila no trae una columna, va
        // NULL. Sin esto, un lote heterogéneo generaría VALUES de distinto largo.
        const columns = Array.from(new Set(this.rows.flatMap((r) => Object.keys(r))))
        const tuples = this.rows.map((row) => {
          const placeholders = columns.map((c) => {
            params.push(encode(row[c]))
            return `$${params.length}`
          })
          return `(${placeholders.join(', ')})`
        })

        let text =
          `INSERT INTO ${this.table} (${columns.map(ident).join(', ')}) ` +
          `VALUES ${tuples.join(', ')}`

        if (this.op === 'upsert') {
          const target = this.conflictColumns.map(ident).join(', ')
          if (this.conflictDoNothing) {
            text += ` ON CONFLICT (${target}) DO NOTHING`
          } else {
            const updatable = columns.filter((c) => !this.conflictColumns.includes(c))
            const sets = updatable.map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`)
            text +=
              sets.length > 0
                ? ` ON CONFLICT (${target}) DO UPDATE SET ${sets.join(', ')}`
                : ` ON CONFLICT (${target}) DO NOTHING`
          }
        }

        if (this.returning || this.wantsSingle) {
          text += ` RETURNING ${selectList(this.returningCols)}`
        }
        return { text, params }
      }

      case 'update': {
        const columns = Object.keys(this.patch)
        if (columns.length === 0) {
          return { text: 'SELECT 1 WHERE false', params }
        }
        const sets = columns.map((c) => {
          params.push(encode(this.patch[c]))
          return `${ident(c)} = $${params.length}`
        })
        const where = this.buildWhere(params)
        // Guardia dura: un UPDATE sin WHERE toca TODAS las filas. Ya hay un sitio
        // así en el código (admin.controller.ts:207, .update({password}) sin .eq),
        // que con PostgREST fallaba y con SQL crudo habría reseteado la contraseña
        // de todos los usuarios. Aquí se rechaza en vez de ejecutarse.
        if (where === '') {
          return {
            text: '__NO_FILTER__',
            params: ['UPDATE']
          }
        }
        let text = `UPDATE ${this.table} SET ${sets.join(', ')}${where}`
        if (this.returning || this.wantsSingle) {
          text += ` RETURNING ${selectList(this.returningCols)}`
        }
        return { text, params }
      }

      case 'delete': {
        const where = this.buildWhere(params)
        if (where === '') {
          return { text: '__NO_FILTER__', params: ['DELETE'] }
        }
        let text = `DELETE FROM ${this.table}${where}`
        if (this.returning || this.wantsSingle) {
          text += ` RETURNING ${selectList(this.returningCols)}`
        }
        return { text, params }
      }

      default:
        unsupported('una consulta sin operación (falta .select/.insert/.update/.delete)')
    }
  }

  private async run(): Promise<PostgrestResponse> {
    // buildSql() puede lanzar por `unsupported()`, y eso SÍ debe propagarse: es
    // un error de programación que hay que ver en desarrollo, no el resultado de
    // una consulta. Por eso queda fuera del try/catch de abajo.
    const built = this.buildSql()

    if (built.text === '__NO_FILTER__') {
      return {
        data: null,
        error: {
          code: 'ADAPTER_NO_FILTER',
          message: `${String(built.params[0])} sin filtros: el adaptador lo bloquea para no afectar la tabla entera`,
          details: `tabla ${this.table}`,
          hint: 'Añade un .eq()/.in() antes de ejecutar la mutación'
        }
      }
    }

    try {
      const res = await query(built.text, built.params)

      const returnsRows =
        this.op === 'select' || this.returning || this.wantsSingle

      if (!returnsRows) {
        // PostgREST devuelve data: null en una mutación sin `select()`. El tipo
        // público declara data: any[] en el caso de éxito porque es lo que hace
        // falta para que los .map()/.filter() de los call sites tipen; aquí el
        // valor real es null y ningún llamador lo lee.
        return { data: null, error: null } as unknown as PostgrestResponse
      }

      if (this.wantsSingle) {
        if (res.rows.length !== 1) {
          return { data: null, error: notSingleError(res.rows.length) }
        }
        // El tipo lo ve el llamador como PostgrestSingleResponse (ver .single()).
        return { data: res.rows[0], error: null } as unknown as PostgrestResponse
      }

      return { data: res.rows, error: null }
    } catch (err) {
      // Nunca lanza: el código llamante espera { data, error }.
      return { data: null, error: toPostgrestError(err) }
    }
  }

  then<TResult1 = PostgrestResponse, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected)
  }
}

function rejectFeature(feature: string): never {
  throw new Error(
    `no soportado por el adaptador: ${feature}. ` +
      'Esta app no usa esa función de Supabase; si empieza a usarla, hay que ' +
      'resolverla contra Postgres (ver db/schema.sql y src/lib/db.ts).'
  )
}

/**
 * Cliente con la misma superficie que `createClient()` de supabase-js,
 * limitada a lo que este repo usa.
 */
export const supabase = {
  from(table: string): QueryBuilder {
    const qualified = TABLES[table]
    if (!qualified) {
      unsupported(`la tabla from('${table}')`)
    }
    return new QueryBuilder(qualified)
  },

  async rpc(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<PostgrestSingleResponse> {
    const spec = RPCS[name]
    if (!spec) {
      unsupported(`la función rpc('${name}')`)
    }
    const params = spec.params.map((p) => encode(args[p]))
    const placeholders = spec.params.map((_, i) => `$${i + 1}`).join(', ')

    try {
      if (spec.kind === 'scalar') {
        // Una función escalar nombra su columna de salida como la función.
        const res = await query(
          `SELECT ${spec.sql}(${placeholders}) AS result`,
          params
        )
        const first = res.rows[0] as Record<string, unknown> | undefined
        return { data: first ? first['result'] : null, error: null }
      }
      const res = await query(`SELECT * FROM ${spec.sql}(${placeholders})`, params)
      return { data: res.rows, error: null }
    } catch (err) {
      return { data: null, error: toPostgrestError(err) }
    }
  },

  // Funciones de Supabase que esta app nunca usó. Existen como stubs que lanzan
  // para que nadie las introduzca por accidente creyendo que siguen disponibles.
  get auth(): never {
    return rejectFeature('supabase.auth (la autenticación es propia: bcrypt + JWT)')
  },
  get storage(): never {
    return rejectFeature('supabase.storage (las imágenes van por Cloudinary)')
  },
  channel(name: string): never {
    return rejectFeature(
      `supabase.channel('${name}') — el realtime se reemplazó por triggers + LISTEN/NOTIFY (ver db/schema.sql)`
    )
  }
}

export type SupabaseAdapter = typeof supabase
