
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model User
 * 
 */
export type User = $Result.DefaultSelection<Prisma.$UserPayload>
/**
 * Model WhatsAppNumber
 * 
 */
export type WhatsAppNumber = $Result.DefaultSelection<Prisma.$WhatsAppNumberPayload>
/**
 * Model Telemetry
 * 
 */
export type Telemetry = $Result.DefaultSelection<Prisma.$TelemetryPayload>
/**
 * Model Payment
 * 
 */
export type Payment = $Result.DefaultSelection<Prisma.$PaymentPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const Role: {
  admin: 'admin',
  user: 'user'
};

export type Role = (typeof Role)[keyof typeof Role]

}

export type Role = $Enums.Role

export const Role: typeof $Enums.Role

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Users
 * const users = await prisma.user.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Users
   * const users = await prisma.user.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.user`: Exposes CRUD operations for the **User** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Users
    * const users = await prisma.user.findMany()
    * ```
    */
  get user(): Prisma.UserDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.whatsAppNumber`: Exposes CRUD operations for the **WhatsAppNumber** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more WhatsAppNumbers
    * const whatsAppNumbers = await prisma.whatsAppNumber.findMany()
    * ```
    */
  get whatsAppNumber(): Prisma.WhatsAppNumberDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.telemetry`: Exposes CRUD operations for the **Telemetry** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Telemetries
    * const telemetries = await prisma.telemetry.findMany()
    * ```
    */
  get telemetry(): Prisma.TelemetryDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.payment`: Exposes CRUD operations for the **Payment** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Payments
    * const payments = await prisma.payment.findMany()
    * ```
    */
  get payment(): Prisma.PaymentDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.6.0
   * Query Engine version: f676762280b54cd07c770017ed3711ddde35f37a
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    User: 'User',
    WhatsAppNumber: 'WhatsAppNumber',
    Telemetry: 'Telemetry',
    Payment: 'Payment'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "user" | "whatsAppNumber" | "telemetry" | "payment"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      User: {
        payload: Prisma.$UserPayload<ExtArgs>
        fields: Prisma.UserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findFirst: {
            args: Prisma.UserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findMany: {
            args: Prisma.UserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          create: {
            args: Prisma.UserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          createMany: {
            args: Prisma.UserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UserCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          delete: {
            args: Prisma.UserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          update: {
            args: Prisma.UserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          deleteMany: {
            args: Prisma.UserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.UserUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          upsert: {
            args: Prisma.UserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          aggregate: {
            args: Prisma.UserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUser>
          }
          groupBy: {
            args: Prisma.UserGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserCountArgs<ExtArgs>
            result: $Utils.Optional<UserCountAggregateOutputType> | number
          }
        }
      }
      WhatsAppNumber: {
        payload: Prisma.$WhatsAppNumberPayload<ExtArgs>
        fields: Prisma.WhatsAppNumberFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WhatsAppNumberFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WhatsAppNumberFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload>
          }
          findFirst: {
            args: Prisma.WhatsAppNumberFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WhatsAppNumberFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload>
          }
          findMany: {
            args: Prisma.WhatsAppNumberFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload>[]
          }
          create: {
            args: Prisma.WhatsAppNumberCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload>
          }
          createMany: {
            args: Prisma.WhatsAppNumberCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WhatsAppNumberCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload>[]
          }
          delete: {
            args: Prisma.WhatsAppNumberDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload>
          }
          update: {
            args: Prisma.WhatsAppNumberUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload>
          }
          deleteMany: {
            args: Prisma.WhatsAppNumberDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WhatsAppNumberUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WhatsAppNumberUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload>[]
          }
          upsert: {
            args: Prisma.WhatsAppNumberUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WhatsAppNumberPayload>
          }
          aggregate: {
            args: Prisma.WhatsAppNumberAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWhatsAppNumber>
          }
          groupBy: {
            args: Prisma.WhatsAppNumberGroupByArgs<ExtArgs>
            result: $Utils.Optional<WhatsAppNumberGroupByOutputType>[]
          }
          count: {
            args: Prisma.WhatsAppNumberCountArgs<ExtArgs>
            result: $Utils.Optional<WhatsAppNumberCountAggregateOutputType> | number
          }
        }
      }
      Telemetry: {
        payload: Prisma.$TelemetryPayload<ExtArgs>
        fields: Prisma.TelemetryFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TelemetryFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TelemetryFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload>
          }
          findFirst: {
            args: Prisma.TelemetryFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TelemetryFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload>
          }
          findMany: {
            args: Prisma.TelemetryFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload>[]
          }
          create: {
            args: Prisma.TelemetryCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload>
          }
          createMany: {
            args: Prisma.TelemetryCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TelemetryCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload>[]
          }
          delete: {
            args: Prisma.TelemetryDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload>
          }
          update: {
            args: Prisma.TelemetryUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload>
          }
          deleteMany: {
            args: Prisma.TelemetryDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TelemetryUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TelemetryUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload>[]
          }
          upsert: {
            args: Prisma.TelemetryUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TelemetryPayload>
          }
          aggregate: {
            args: Prisma.TelemetryAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTelemetry>
          }
          groupBy: {
            args: Prisma.TelemetryGroupByArgs<ExtArgs>
            result: $Utils.Optional<TelemetryGroupByOutputType>[]
          }
          count: {
            args: Prisma.TelemetryCountArgs<ExtArgs>
            result: $Utils.Optional<TelemetryCountAggregateOutputType> | number
          }
        }
      }
      Payment: {
        payload: Prisma.$PaymentPayload<ExtArgs>
        fields: Prisma.PaymentFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PaymentFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PaymentFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload>
          }
          findFirst: {
            args: Prisma.PaymentFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PaymentFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload>
          }
          findMany: {
            args: Prisma.PaymentFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload>[]
          }
          create: {
            args: Prisma.PaymentCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload>
          }
          createMany: {
            args: Prisma.PaymentCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.PaymentCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload>[]
          }
          delete: {
            args: Prisma.PaymentDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload>
          }
          update: {
            args: Prisma.PaymentUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload>
          }
          deleteMany: {
            args: Prisma.PaymentDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PaymentUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.PaymentUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload>[]
          }
          upsert: {
            args: Prisma.PaymentUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PaymentPayload>
          }
          aggregate: {
            args: Prisma.PaymentAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePayment>
          }
          groupBy: {
            args: Prisma.PaymentGroupByArgs<ExtArgs>
            result: $Utils.Optional<PaymentGroupByOutputType>[]
          }
          count: {
            args: Prisma.PaymentCountArgs<ExtArgs>
            result: $Utils.Optional<PaymentCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    user?: UserOmit
    whatsAppNumber?: WhatsAppNumberOmit
    telemetry?: TelemetryOmit
    payment?: PaymentOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type UserCountOutputType
   */

  export type UserCountOutputType = {
    whatsappNumbers: number
    Payment: number
  }

  export type UserCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    whatsappNumbers?: boolean | UserCountOutputTypeCountWhatsappNumbersArgs
    Payment?: boolean | UserCountOutputTypeCountPaymentArgs
  }

  // Custom InputTypes
  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserCountOutputType
     */
    select?: UserCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountWhatsappNumbersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WhatsAppNumberWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountPaymentArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PaymentWhereInput
  }


  /**
   * Models
   */

  /**
   * Model User
   */

  export type AggregateUser = {
    _count: UserCountAggregateOutputType | null
    _avg: UserAvgAggregateOutputType | null
    _sum: UserSumAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  export type UserAvgAggregateOutputType = {
    id: number | null
    AiTokensUse: number | null
    AiTokensLimit: number | null
    tokensPerResponse: number | null
  }

  export type UserSumAggregateOutputType = {
    id: number | null
    AiTokensUse: number | null
    AiTokensLimit: number | null
    tokensPerResponse: number | null
  }

  export type UserMinAggregateOutputType = {
    id: number | null
    username: string | null
    password: string | null
    email: string | null
    role: $Enums.Role | null
    token: string | null
    active: boolean | null
    AiTokensUse: number | null
    AiTokensLimit: number | null
    tokensPerResponse: number | null
  }

  export type UserMaxAggregateOutputType = {
    id: number | null
    username: string | null
    password: string | null
    email: string | null
    role: $Enums.Role | null
    token: string | null
    active: boolean | null
    AiTokensUse: number | null
    AiTokensLimit: number | null
    tokensPerResponse: number | null
  }

  export type UserCountAggregateOutputType = {
    id: number
    username: number
    password: number
    email: number
    role: number
    token: number
    active: number
    AiTokensUse: number
    AiTokensLimit: number
    tokensPerResponse: number
    _all: number
  }


  export type UserAvgAggregateInputType = {
    id?: true
    AiTokensUse?: true
    AiTokensLimit?: true
    tokensPerResponse?: true
  }

  export type UserSumAggregateInputType = {
    id?: true
    AiTokensUse?: true
    AiTokensLimit?: true
    tokensPerResponse?: true
  }

  export type UserMinAggregateInputType = {
    id?: true
    username?: true
    password?: true
    email?: true
    role?: true
    token?: true
    active?: true
    AiTokensUse?: true
    AiTokensLimit?: true
    tokensPerResponse?: true
  }

  export type UserMaxAggregateInputType = {
    id?: true
    username?: true
    password?: true
    email?: true
    role?: true
    token?: true
    active?: true
    AiTokensUse?: true
    AiTokensLimit?: true
    tokensPerResponse?: true
  }

  export type UserCountAggregateInputType = {
    id?: true
    username?: true
    password?: true
    email?: true
    role?: true
    token?: true
    active?: true
    AiTokensUse?: true
    AiTokensLimit?: true
    tokensPerResponse?: true
    _all?: true
  }

  export type UserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which User to aggregate.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Users
    **/
    _count?: true | UserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: UserAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: UserSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserMaxAggregateInputType
  }

  export type GetUserAggregateType<T extends UserAggregateArgs> = {
        [P in keyof T & keyof AggregateUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUser[P]>
      : GetScalarType<T[P], AggregateUser[P]>
  }




  export type UserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
    orderBy?: UserOrderByWithAggregationInput | UserOrderByWithAggregationInput[]
    by: UserScalarFieldEnum[] | UserScalarFieldEnum
    having?: UserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserCountAggregateInputType | true
    _avg?: UserAvgAggregateInputType
    _sum?: UserSumAggregateInputType
    _min?: UserMinAggregateInputType
    _max?: UserMaxAggregateInputType
  }

  export type UserGroupByOutputType = {
    id: number
    username: string
    password: string
    email: string
    role: $Enums.Role
    token: string | null
    active: boolean
    AiTokensUse: number
    AiTokensLimit: number
    tokensPerResponse: number
    _count: UserCountAggregateOutputType | null
    _avg: UserAvgAggregateOutputType | null
    _sum: UserSumAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  type GetUserGroupByPayload<T extends UserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserGroupByOutputType[P]>
            : GetScalarType<T[P], UserGroupByOutputType[P]>
        }
      >
    >


  export type UserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    username?: boolean
    password?: boolean
    email?: boolean
    role?: boolean
    token?: boolean
    active?: boolean
    AiTokensUse?: boolean
    AiTokensLimit?: boolean
    tokensPerResponse?: boolean
    whatsappNumbers?: boolean | User$whatsappNumbersArgs<ExtArgs>
    Payment?: boolean | User$PaymentArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    username?: boolean
    password?: boolean
    email?: boolean
    role?: boolean
    token?: boolean
    active?: boolean
    AiTokensUse?: boolean
    AiTokensLimit?: boolean
    tokensPerResponse?: boolean
  }, ExtArgs["result"]["user"]>

  export type UserSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    username?: boolean
    password?: boolean
    email?: boolean
    role?: boolean
    token?: boolean
    active?: boolean
    AiTokensUse?: boolean
    AiTokensLimit?: boolean
    tokensPerResponse?: boolean
  }, ExtArgs["result"]["user"]>

  export type UserSelectScalar = {
    id?: boolean
    username?: boolean
    password?: boolean
    email?: boolean
    role?: boolean
    token?: boolean
    active?: boolean
    AiTokensUse?: boolean
    AiTokensLimit?: boolean
    tokensPerResponse?: boolean
  }

  export type UserOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "username" | "password" | "email" | "role" | "token" | "active" | "AiTokensUse" | "AiTokensLimit" | "tokensPerResponse", ExtArgs["result"]["user"]>
  export type UserInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    whatsappNumbers?: boolean | User$whatsappNumbersArgs<ExtArgs>
    Payment?: boolean | User$PaymentArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type UserIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type UserIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $UserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "User"
    objects: {
      whatsappNumbers: Prisma.$WhatsAppNumberPayload<ExtArgs>[]
      Payment: Prisma.$PaymentPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      username: string
      password: string
      email: string
      role: $Enums.Role
      token: string | null
      active: boolean
      AiTokensUse: number
      AiTokensLimit: number
      tokensPerResponse: number
    }, ExtArgs["result"]["user"]>
    composites: {}
  }

  type UserGetPayload<S extends boolean | null | undefined | UserDefaultArgs> = $Result.GetResult<Prisma.$UserPayload, S>

  type UserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserCountAggregateInputType | true
    }

  export interface UserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['User'], meta: { name: 'User' } }
    /**
     * Find zero or one User that matches the filter.
     * @param {UserFindUniqueArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserFindUniqueArgs>(args: SelectSubset<T, UserFindUniqueArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one User that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserFindUniqueOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserFindUniqueOrThrowArgs>(args: SelectSubset<T, UserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, UserFindFirstArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserFindFirstOrThrowArgs>(args?: SelectSubset<T, UserFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Users
     * const users = await prisma.user.findMany()
     * 
     * // Get first 10 Users
     * const users = await prisma.user.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userWithIdOnly = await prisma.user.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserFindManyArgs>(args?: SelectSubset<T, UserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a User.
     * @param {UserCreateArgs} args - Arguments to create a User.
     * @example
     * // Create one User
     * const User = await prisma.user.create({
     *   data: {
     *     // ... data to create a User
     *   }
     * })
     * 
     */
    create<T extends UserCreateArgs>(args: SelectSubset<T, UserCreateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Users.
     * @param {UserCreateManyArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserCreateManyArgs>(args?: SelectSubset<T, UserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Users and returns the data saved in the database.
     * @param {UserCreateManyAndReturnArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Users and only return the `id`
     * const userWithIdOnly = await prisma.user.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UserCreateManyAndReturnArgs>(args?: SelectSubset<T, UserCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a User.
     * @param {UserDeleteArgs} args - Arguments to delete one User.
     * @example
     * // Delete one User
     * const User = await prisma.user.delete({
     *   where: {
     *     // ... filter to delete one User
     *   }
     * })
     * 
     */
    delete<T extends UserDeleteArgs>(args: SelectSubset<T, UserDeleteArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one User.
     * @param {UserUpdateArgs} args - Arguments to update one User.
     * @example
     * // Update one User
     * const user = await prisma.user.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserUpdateArgs>(args: SelectSubset<T, UserUpdateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Users.
     * @param {UserDeleteManyArgs} args - Arguments to filter Users to delete.
     * @example
     * // Delete a few Users
     * const { count } = await prisma.user.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserDeleteManyArgs>(args?: SelectSubset<T, UserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserUpdateManyArgs>(args: SelectSubset<T, UserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users and returns the data updated in the database.
     * @param {UserUpdateManyAndReturnArgs} args - Arguments to update many Users.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Users and only return the `id`
     * const userWithIdOnly = await prisma.user.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends UserUpdateManyAndReturnArgs>(args: SelectSubset<T, UserUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one User.
     * @param {UserUpsertArgs} args - Arguments to update or create a User.
     * @example
     * // Update or create a User
     * const user = await prisma.user.upsert({
     *   create: {
     *     // ... data to create a User
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the User we want to update
     *   }
     * })
     */
    upsert<T extends UserUpsertArgs>(args: SelectSubset<T, UserUpsertArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserCountArgs} args - Arguments to filter Users to count.
     * @example
     * // Count the number of Users
     * const count = await prisma.user.count({
     *   where: {
     *     // ... the filter for the Users we want to count
     *   }
     * })
    **/
    count<T extends UserCountArgs>(
      args?: Subset<T, UserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserAggregateArgs>(args: Subset<T, UserAggregateArgs>): Prisma.PrismaPromise<GetUserAggregateType<T>>

    /**
     * Group by User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserGroupByArgs['orderBy'] }
        : { orderBy?: UserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the User model
   */
  readonly fields: UserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for User.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    whatsappNumbers<T extends User$whatsappNumbersArgs<ExtArgs> = {}>(args?: Subset<T, User$whatsappNumbersArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    Payment<T extends User$PaymentArgs<ExtArgs> = {}>(args?: Subset<T, User$PaymentArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the User model
   */
  interface UserFieldRefs {
    readonly id: FieldRef<"User", 'Int'>
    readonly username: FieldRef<"User", 'String'>
    readonly password: FieldRef<"User", 'String'>
    readonly email: FieldRef<"User", 'String'>
    readonly role: FieldRef<"User", 'Role'>
    readonly token: FieldRef<"User", 'String'>
    readonly active: FieldRef<"User", 'Boolean'>
    readonly AiTokensUse: FieldRef<"User", 'Int'>
    readonly AiTokensLimit: FieldRef<"User", 'Int'>
    readonly tokensPerResponse: FieldRef<"User", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * User findUnique
   */
  export type UserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findUniqueOrThrow
   */
  export type UserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findFirst
   */
  export type UserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findFirstOrThrow
   */
  export type UserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findMany
   */
  export type UserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which Users to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User create
   */
  export type UserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to create a User.
     */
    data: XOR<UserCreateInput, UserUncheckedCreateInput>
  }

  /**
   * User createMany
   */
  export type UserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User createManyAndReturn
   */
  export type UserCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User update
   */
  export type UserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to update a User.
     */
    data: XOR<UserUpdateInput, UserUncheckedUpdateInput>
    /**
     * Choose, which User to update.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User updateMany
   */
  export type UserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User updateManyAndReturn
   */
  export type UserUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User upsert
   */
  export type UserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The filter to search for the User to update in case it exists.
     */
    where: UserWhereUniqueInput
    /**
     * In case the User found by the `where` argument doesn't exist, create a new User with this data.
     */
    create: XOR<UserCreateInput, UserUncheckedCreateInput>
    /**
     * In case the User was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserUpdateInput, UserUncheckedUpdateInput>
  }

  /**
   * User delete
   */
  export type UserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter which User to delete.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User deleteMany
   */
  export type UserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Users to delete
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to delete.
     */
    limit?: number
  }

  /**
   * User.whatsappNumbers
   */
  export type User$whatsappNumbersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
    where?: WhatsAppNumberWhereInput
    orderBy?: WhatsAppNumberOrderByWithRelationInput | WhatsAppNumberOrderByWithRelationInput[]
    cursor?: WhatsAppNumberWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WhatsAppNumberScalarFieldEnum | WhatsAppNumberScalarFieldEnum[]
  }

  /**
   * User.Payment
   */
  export type User$PaymentArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
    where?: PaymentWhereInput
    orderBy?: PaymentOrderByWithRelationInput | PaymentOrderByWithRelationInput[]
    cursor?: PaymentWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PaymentScalarFieldEnum | PaymentScalarFieldEnum[]
  }

  /**
   * User without action
   */
  export type UserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
  }


  /**
   * Model WhatsAppNumber
   */

  export type AggregateWhatsAppNumber = {
    _count: WhatsAppNumberCountAggregateOutputType | null
    _avg: WhatsAppNumberAvgAggregateOutputType | null
    _sum: WhatsAppNumberSumAggregateOutputType | null
    _min: WhatsAppNumberMinAggregateOutputType | null
    _max: WhatsAppNumberMaxAggregateOutputType | null
  }

  export type WhatsAppNumberAvgAggregateOutputType = {
    id: number | null
    userId: number | null
  }

  export type WhatsAppNumberSumAggregateOutputType = {
    id: number | null
    userId: number | null
  }

  export type WhatsAppNumberMinAggregateOutputType = {
    id: number | null
    number: string | null
    name: string | null
    aiEnabled: boolean | null
    aiPrompt: string | null
    aiModel: string | null
    responseGroups: boolean | null
    userId: number | null
  }

  export type WhatsAppNumberMaxAggregateOutputType = {
    id: number | null
    number: string | null
    name: string | null
    aiEnabled: boolean | null
    aiPrompt: string | null
    aiModel: string | null
    responseGroups: boolean | null
    userId: number | null
  }

  export type WhatsAppNumberCountAggregateOutputType = {
    id: number
    number: number
    name: number
    aiEnabled: number
    aiPrompt: number
    aiModel: number
    responseGroups: number
    userId: number
    _all: number
  }


  export type WhatsAppNumberAvgAggregateInputType = {
    id?: true
    userId?: true
  }

  export type WhatsAppNumberSumAggregateInputType = {
    id?: true
    userId?: true
  }

  export type WhatsAppNumberMinAggregateInputType = {
    id?: true
    number?: true
    name?: true
    aiEnabled?: true
    aiPrompt?: true
    aiModel?: true
    responseGroups?: true
    userId?: true
  }

  export type WhatsAppNumberMaxAggregateInputType = {
    id?: true
    number?: true
    name?: true
    aiEnabled?: true
    aiPrompt?: true
    aiModel?: true
    responseGroups?: true
    userId?: true
  }

  export type WhatsAppNumberCountAggregateInputType = {
    id?: true
    number?: true
    name?: true
    aiEnabled?: true
    aiPrompt?: true
    aiModel?: true
    responseGroups?: true
    userId?: true
    _all?: true
  }

  export type WhatsAppNumberAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WhatsAppNumber to aggregate.
     */
    where?: WhatsAppNumberWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WhatsAppNumbers to fetch.
     */
    orderBy?: WhatsAppNumberOrderByWithRelationInput | WhatsAppNumberOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WhatsAppNumberWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WhatsAppNumbers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WhatsAppNumbers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned WhatsAppNumbers
    **/
    _count?: true | WhatsAppNumberCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: WhatsAppNumberAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: WhatsAppNumberSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WhatsAppNumberMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WhatsAppNumberMaxAggregateInputType
  }

  export type GetWhatsAppNumberAggregateType<T extends WhatsAppNumberAggregateArgs> = {
        [P in keyof T & keyof AggregateWhatsAppNumber]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWhatsAppNumber[P]>
      : GetScalarType<T[P], AggregateWhatsAppNumber[P]>
  }




  export type WhatsAppNumberGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WhatsAppNumberWhereInput
    orderBy?: WhatsAppNumberOrderByWithAggregationInput | WhatsAppNumberOrderByWithAggregationInput[]
    by: WhatsAppNumberScalarFieldEnum[] | WhatsAppNumberScalarFieldEnum
    having?: WhatsAppNumberScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WhatsAppNumberCountAggregateInputType | true
    _avg?: WhatsAppNumberAvgAggregateInputType
    _sum?: WhatsAppNumberSumAggregateInputType
    _min?: WhatsAppNumberMinAggregateInputType
    _max?: WhatsAppNumberMaxAggregateInputType
  }

  export type WhatsAppNumberGroupByOutputType = {
    id: number
    number: string
    name: string
    aiEnabled: boolean
    aiPrompt: string
    aiModel: string
    responseGroups: boolean
    userId: number
    _count: WhatsAppNumberCountAggregateOutputType | null
    _avg: WhatsAppNumberAvgAggregateOutputType | null
    _sum: WhatsAppNumberSumAggregateOutputType | null
    _min: WhatsAppNumberMinAggregateOutputType | null
    _max: WhatsAppNumberMaxAggregateOutputType | null
  }

  type GetWhatsAppNumberGroupByPayload<T extends WhatsAppNumberGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WhatsAppNumberGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WhatsAppNumberGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WhatsAppNumberGroupByOutputType[P]>
            : GetScalarType<T[P], WhatsAppNumberGroupByOutputType[P]>
        }
      >
    >


  export type WhatsAppNumberSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    number?: boolean
    name?: boolean
    aiEnabled?: boolean
    aiPrompt?: boolean
    aiModel?: boolean
    responseGroups?: boolean
    userId?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["whatsAppNumber"]>

  export type WhatsAppNumberSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    number?: boolean
    name?: boolean
    aiEnabled?: boolean
    aiPrompt?: boolean
    aiModel?: boolean
    responseGroups?: boolean
    userId?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["whatsAppNumber"]>

  export type WhatsAppNumberSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    number?: boolean
    name?: boolean
    aiEnabled?: boolean
    aiPrompt?: boolean
    aiModel?: boolean
    responseGroups?: boolean
    userId?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["whatsAppNumber"]>

  export type WhatsAppNumberSelectScalar = {
    id?: boolean
    number?: boolean
    name?: boolean
    aiEnabled?: boolean
    aiPrompt?: boolean
    aiModel?: boolean
    responseGroups?: boolean
    userId?: boolean
  }

  export type WhatsAppNumberOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "number" | "name" | "aiEnabled" | "aiPrompt" | "aiModel" | "responseGroups" | "userId", ExtArgs["result"]["whatsAppNumber"]>
  export type WhatsAppNumberInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type WhatsAppNumberIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type WhatsAppNumberIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $WhatsAppNumberPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "WhatsAppNumber"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      number: string
      name: string
      aiEnabled: boolean
      aiPrompt: string
      aiModel: string
      responseGroups: boolean
      userId: number
    }, ExtArgs["result"]["whatsAppNumber"]>
    composites: {}
  }

  type WhatsAppNumberGetPayload<S extends boolean | null | undefined | WhatsAppNumberDefaultArgs> = $Result.GetResult<Prisma.$WhatsAppNumberPayload, S>

  type WhatsAppNumberCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WhatsAppNumberFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WhatsAppNumberCountAggregateInputType | true
    }

  export interface WhatsAppNumberDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['WhatsAppNumber'], meta: { name: 'WhatsAppNumber' } }
    /**
     * Find zero or one WhatsAppNumber that matches the filter.
     * @param {WhatsAppNumberFindUniqueArgs} args - Arguments to find a WhatsAppNumber
     * @example
     * // Get one WhatsAppNumber
     * const whatsAppNumber = await prisma.whatsAppNumber.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WhatsAppNumberFindUniqueArgs>(args: SelectSubset<T, WhatsAppNumberFindUniqueArgs<ExtArgs>>): Prisma__WhatsAppNumberClient<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one WhatsAppNumber that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WhatsAppNumberFindUniqueOrThrowArgs} args - Arguments to find a WhatsAppNumber
     * @example
     * // Get one WhatsAppNumber
     * const whatsAppNumber = await prisma.whatsAppNumber.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WhatsAppNumberFindUniqueOrThrowArgs>(args: SelectSubset<T, WhatsAppNumberFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WhatsAppNumberClient<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WhatsAppNumber that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WhatsAppNumberFindFirstArgs} args - Arguments to find a WhatsAppNumber
     * @example
     * // Get one WhatsAppNumber
     * const whatsAppNumber = await prisma.whatsAppNumber.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WhatsAppNumberFindFirstArgs>(args?: SelectSubset<T, WhatsAppNumberFindFirstArgs<ExtArgs>>): Prisma__WhatsAppNumberClient<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WhatsAppNumber that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WhatsAppNumberFindFirstOrThrowArgs} args - Arguments to find a WhatsAppNumber
     * @example
     * // Get one WhatsAppNumber
     * const whatsAppNumber = await prisma.whatsAppNumber.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WhatsAppNumberFindFirstOrThrowArgs>(args?: SelectSubset<T, WhatsAppNumberFindFirstOrThrowArgs<ExtArgs>>): Prisma__WhatsAppNumberClient<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more WhatsAppNumbers that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WhatsAppNumberFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all WhatsAppNumbers
     * const whatsAppNumbers = await prisma.whatsAppNumber.findMany()
     * 
     * // Get first 10 WhatsAppNumbers
     * const whatsAppNumbers = await prisma.whatsAppNumber.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const whatsAppNumberWithIdOnly = await prisma.whatsAppNumber.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WhatsAppNumberFindManyArgs>(args?: SelectSubset<T, WhatsAppNumberFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a WhatsAppNumber.
     * @param {WhatsAppNumberCreateArgs} args - Arguments to create a WhatsAppNumber.
     * @example
     * // Create one WhatsAppNumber
     * const WhatsAppNumber = await prisma.whatsAppNumber.create({
     *   data: {
     *     // ... data to create a WhatsAppNumber
     *   }
     * })
     * 
     */
    create<T extends WhatsAppNumberCreateArgs>(args: SelectSubset<T, WhatsAppNumberCreateArgs<ExtArgs>>): Prisma__WhatsAppNumberClient<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many WhatsAppNumbers.
     * @param {WhatsAppNumberCreateManyArgs} args - Arguments to create many WhatsAppNumbers.
     * @example
     * // Create many WhatsAppNumbers
     * const whatsAppNumber = await prisma.whatsAppNumber.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WhatsAppNumberCreateManyArgs>(args?: SelectSubset<T, WhatsAppNumberCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many WhatsAppNumbers and returns the data saved in the database.
     * @param {WhatsAppNumberCreateManyAndReturnArgs} args - Arguments to create many WhatsAppNumbers.
     * @example
     * // Create many WhatsAppNumbers
     * const whatsAppNumber = await prisma.whatsAppNumber.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many WhatsAppNumbers and only return the `id`
     * const whatsAppNumberWithIdOnly = await prisma.whatsAppNumber.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WhatsAppNumberCreateManyAndReturnArgs>(args?: SelectSubset<T, WhatsAppNumberCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a WhatsAppNumber.
     * @param {WhatsAppNumberDeleteArgs} args - Arguments to delete one WhatsAppNumber.
     * @example
     * // Delete one WhatsAppNumber
     * const WhatsAppNumber = await prisma.whatsAppNumber.delete({
     *   where: {
     *     // ... filter to delete one WhatsAppNumber
     *   }
     * })
     * 
     */
    delete<T extends WhatsAppNumberDeleteArgs>(args: SelectSubset<T, WhatsAppNumberDeleteArgs<ExtArgs>>): Prisma__WhatsAppNumberClient<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one WhatsAppNumber.
     * @param {WhatsAppNumberUpdateArgs} args - Arguments to update one WhatsAppNumber.
     * @example
     * // Update one WhatsAppNumber
     * const whatsAppNumber = await prisma.whatsAppNumber.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WhatsAppNumberUpdateArgs>(args: SelectSubset<T, WhatsAppNumberUpdateArgs<ExtArgs>>): Prisma__WhatsAppNumberClient<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more WhatsAppNumbers.
     * @param {WhatsAppNumberDeleteManyArgs} args - Arguments to filter WhatsAppNumbers to delete.
     * @example
     * // Delete a few WhatsAppNumbers
     * const { count } = await prisma.whatsAppNumber.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WhatsAppNumberDeleteManyArgs>(args?: SelectSubset<T, WhatsAppNumberDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WhatsAppNumbers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WhatsAppNumberUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many WhatsAppNumbers
     * const whatsAppNumber = await prisma.whatsAppNumber.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WhatsAppNumberUpdateManyArgs>(args: SelectSubset<T, WhatsAppNumberUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WhatsAppNumbers and returns the data updated in the database.
     * @param {WhatsAppNumberUpdateManyAndReturnArgs} args - Arguments to update many WhatsAppNumbers.
     * @example
     * // Update many WhatsAppNumbers
     * const whatsAppNumber = await prisma.whatsAppNumber.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more WhatsAppNumbers and only return the `id`
     * const whatsAppNumberWithIdOnly = await prisma.whatsAppNumber.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WhatsAppNumberUpdateManyAndReturnArgs>(args: SelectSubset<T, WhatsAppNumberUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one WhatsAppNumber.
     * @param {WhatsAppNumberUpsertArgs} args - Arguments to update or create a WhatsAppNumber.
     * @example
     * // Update or create a WhatsAppNumber
     * const whatsAppNumber = await prisma.whatsAppNumber.upsert({
     *   create: {
     *     // ... data to create a WhatsAppNumber
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the WhatsAppNumber we want to update
     *   }
     * })
     */
    upsert<T extends WhatsAppNumberUpsertArgs>(args: SelectSubset<T, WhatsAppNumberUpsertArgs<ExtArgs>>): Prisma__WhatsAppNumberClient<$Result.GetResult<Prisma.$WhatsAppNumberPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of WhatsAppNumbers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WhatsAppNumberCountArgs} args - Arguments to filter WhatsAppNumbers to count.
     * @example
     * // Count the number of WhatsAppNumbers
     * const count = await prisma.whatsAppNumber.count({
     *   where: {
     *     // ... the filter for the WhatsAppNumbers we want to count
     *   }
     * })
    **/
    count<T extends WhatsAppNumberCountArgs>(
      args?: Subset<T, WhatsAppNumberCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WhatsAppNumberCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a WhatsAppNumber.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WhatsAppNumberAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WhatsAppNumberAggregateArgs>(args: Subset<T, WhatsAppNumberAggregateArgs>): Prisma.PrismaPromise<GetWhatsAppNumberAggregateType<T>>

    /**
     * Group by WhatsAppNumber.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WhatsAppNumberGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WhatsAppNumberGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WhatsAppNumberGroupByArgs['orderBy'] }
        : { orderBy?: WhatsAppNumberGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WhatsAppNumberGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWhatsAppNumberGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the WhatsAppNumber model
   */
  readonly fields: WhatsAppNumberFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for WhatsAppNumber.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WhatsAppNumberClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the WhatsAppNumber model
   */
  interface WhatsAppNumberFieldRefs {
    readonly id: FieldRef<"WhatsAppNumber", 'Int'>
    readonly number: FieldRef<"WhatsAppNumber", 'String'>
    readonly name: FieldRef<"WhatsAppNumber", 'String'>
    readonly aiEnabled: FieldRef<"WhatsAppNumber", 'Boolean'>
    readonly aiPrompt: FieldRef<"WhatsAppNumber", 'String'>
    readonly aiModel: FieldRef<"WhatsAppNumber", 'String'>
    readonly responseGroups: FieldRef<"WhatsAppNumber", 'Boolean'>
    readonly userId: FieldRef<"WhatsAppNumber", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * WhatsAppNumber findUnique
   */
  export type WhatsAppNumberFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
    /**
     * Filter, which WhatsAppNumber to fetch.
     */
    where: WhatsAppNumberWhereUniqueInput
  }

  /**
   * WhatsAppNumber findUniqueOrThrow
   */
  export type WhatsAppNumberFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
    /**
     * Filter, which WhatsAppNumber to fetch.
     */
    where: WhatsAppNumberWhereUniqueInput
  }

  /**
   * WhatsAppNumber findFirst
   */
  export type WhatsAppNumberFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
    /**
     * Filter, which WhatsAppNumber to fetch.
     */
    where?: WhatsAppNumberWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WhatsAppNumbers to fetch.
     */
    orderBy?: WhatsAppNumberOrderByWithRelationInput | WhatsAppNumberOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WhatsAppNumbers.
     */
    cursor?: WhatsAppNumberWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WhatsAppNumbers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WhatsAppNumbers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WhatsAppNumbers.
     */
    distinct?: WhatsAppNumberScalarFieldEnum | WhatsAppNumberScalarFieldEnum[]
  }

  /**
   * WhatsAppNumber findFirstOrThrow
   */
  export type WhatsAppNumberFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
    /**
     * Filter, which WhatsAppNumber to fetch.
     */
    where?: WhatsAppNumberWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WhatsAppNumbers to fetch.
     */
    orderBy?: WhatsAppNumberOrderByWithRelationInput | WhatsAppNumberOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WhatsAppNumbers.
     */
    cursor?: WhatsAppNumberWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WhatsAppNumbers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WhatsAppNumbers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WhatsAppNumbers.
     */
    distinct?: WhatsAppNumberScalarFieldEnum | WhatsAppNumberScalarFieldEnum[]
  }

  /**
   * WhatsAppNumber findMany
   */
  export type WhatsAppNumberFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
    /**
     * Filter, which WhatsAppNumbers to fetch.
     */
    where?: WhatsAppNumberWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WhatsAppNumbers to fetch.
     */
    orderBy?: WhatsAppNumberOrderByWithRelationInput | WhatsAppNumberOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing WhatsAppNumbers.
     */
    cursor?: WhatsAppNumberWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WhatsAppNumbers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WhatsAppNumbers.
     */
    skip?: number
    distinct?: WhatsAppNumberScalarFieldEnum | WhatsAppNumberScalarFieldEnum[]
  }

  /**
   * WhatsAppNumber create
   */
  export type WhatsAppNumberCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
    /**
     * The data needed to create a WhatsAppNumber.
     */
    data: XOR<WhatsAppNumberCreateInput, WhatsAppNumberUncheckedCreateInput>
  }

  /**
   * WhatsAppNumber createMany
   */
  export type WhatsAppNumberCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many WhatsAppNumbers.
     */
    data: WhatsAppNumberCreateManyInput | WhatsAppNumberCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * WhatsAppNumber createManyAndReturn
   */
  export type WhatsAppNumberCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * The data used to create many WhatsAppNumbers.
     */
    data: WhatsAppNumberCreateManyInput | WhatsAppNumberCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * WhatsAppNumber update
   */
  export type WhatsAppNumberUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
    /**
     * The data needed to update a WhatsAppNumber.
     */
    data: XOR<WhatsAppNumberUpdateInput, WhatsAppNumberUncheckedUpdateInput>
    /**
     * Choose, which WhatsAppNumber to update.
     */
    where: WhatsAppNumberWhereUniqueInput
  }

  /**
   * WhatsAppNumber updateMany
   */
  export type WhatsAppNumberUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update WhatsAppNumbers.
     */
    data: XOR<WhatsAppNumberUpdateManyMutationInput, WhatsAppNumberUncheckedUpdateManyInput>
    /**
     * Filter which WhatsAppNumbers to update
     */
    where?: WhatsAppNumberWhereInput
    /**
     * Limit how many WhatsAppNumbers to update.
     */
    limit?: number
  }

  /**
   * WhatsAppNumber updateManyAndReturn
   */
  export type WhatsAppNumberUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * The data used to update WhatsAppNumbers.
     */
    data: XOR<WhatsAppNumberUpdateManyMutationInput, WhatsAppNumberUncheckedUpdateManyInput>
    /**
     * Filter which WhatsAppNumbers to update
     */
    where?: WhatsAppNumberWhereInput
    /**
     * Limit how many WhatsAppNumbers to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * WhatsAppNumber upsert
   */
  export type WhatsAppNumberUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
    /**
     * The filter to search for the WhatsAppNumber to update in case it exists.
     */
    where: WhatsAppNumberWhereUniqueInput
    /**
     * In case the WhatsAppNumber found by the `where` argument doesn't exist, create a new WhatsAppNumber with this data.
     */
    create: XOR<WhatsAppNumberCreateInput, WhatsAppNumberUncheckedCreateInput>
    /**
     * In case the WhatsAppNumber was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WhatsAppNumberUpdateInput, WhatsAppNumberUncheckedUpdateInput>
  }

  /**
   * WhatsAppNumber delete
   */
  export type WhatsAppNumberDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
    /**
     * Filter which WhatsAppNumber to delete.
     */
    where: WhatsAppNumberWhereUniqueInput
  }

  /**
   * WhatsAppNumber deleteMany
   */
  export type WhatsAppNumberDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WhatsAppNumbers to delete
     */
    where?: WhatsAppNumberWhereInput
    /**
     * Limit how many WhatsAppNumbers to delete.
     */
    limit?: number
  }

  /**
   * WhatsAppNumber without action
   */
  export type WhatsAppNumberDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WhatsAppNumber
     */
    select?: WhatsAppNumberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WhatsAppNumber
     */
    omit?: WhatsAppNumberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WhatsAppNumberInclude<ExtArgs> | null
  }


  /**
   * Model Telemetry
   */

  export type AggregateTelemetry = {
    _count: TelemetryCountAggregateOutputType | null
    _avg: TelemetryAvgAggregateOutputType | null
    _sum: TelemetrySumAggregateOutputType | null
    _min: TelemetryMinAggregateOutputType | null
    _max: TelemetryMaxAggregateOutputType | null
  }

  export type TelemetryAvgAggregateOutputType = {
    id: number | null
    cpuUsageMs: number | null
    ramUsageMB: number | null
    networkEgressKB: number | null
  }

  export type TelemetrySumAggregateOutputType = {
    id: number | null
    cpuUsageMs: number | null
    ramUsageMB: number | null
    networkEgressKB: number | null
  }

  export type TelemetryMinAggregateOutputType = {
    id: number | null
    timeStamp: Date | null
    cpuUsageMs: number | null
    ramUsageMB: number | null
    networkEgressKB: number | null
    ip: string | null
    country: string | null
    city: string | null
  }

  export type TelemetryMaxAggregateOutputType = {
    id: number | null
    timeStamp: Date | null
    cpuUsageMs: number | null
    ramUsageMB: number | null
    networkEgressKB: number | null
    ip: string | null
    country: string | null
    city: string | null
  }

  export type TelemetryCountAggregateOutputType = {
    id: number
    timeStamp: number
    cpuUsageMs: number
    ramUsageMB: number
    networkEgressKB: number
    ip: number
    country: number
    city: number
    _all: number
  }


  export type TelemetryAvgAggregateInputType = {
    id?: true
    cpuUsageMs?: true
    ramUsageMB?: true
    networkEgressKB?: true
  }

  export type TelemetrySumAggregateInputType = {
    id?: true
    cpuUsageMs?: true
    ramUsageMB?: true
    networkEgressKB?: true
  }

  export type TelemetryMinAggregateInputType = {
    id?: true
    timeStamp?: true
    cpuUsageMs?: true
    ramUsageMB?: true
    networkEgressKB?: true
    ip?: true
    country?: true
    city?: true
  }

  export type TelemetryMaxAggregateInputType = {
    id?: true
    timeStamp?: true
    cpuUsageMs?: true
    ramUsageMB?: true
    networkEgressKB?: true
    ip?: true
    country?: true
    city?: true
  }

  export type TelemetryCountAggregateInputType = {
    id?: true
    timeStamp?: true
    cpuUsageMs?: true
    ramUsageMB?: true
    networkEgressKB?: true
    ip?: true
    country?: true
    city?: true
    _all?: true
  }

  export type TelemetryAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Telemetry to aggregate.
     */
    where?: TelemetryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Telemetries to fetch.
     */
    orderBy?: TelemetryOrderByWithRelationInput | TelemetryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TelemetryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Telemetries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Telemetries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Telemetries
    **/
    _count?: true | TelemetryCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TelemetryAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TelemetrySumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TelemetryMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TelemetryMaxAggregateInputType
  }

  export type GetTelemetryAggregateType<T extends TelemetryAggregateArgs> = {
        [P in keyof T & keyof AggregateTelemetry]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTelemetry[P]>
      : GetScalarType<T[P], AggregateTelemetry[P]>
  }




  export type TelemetryGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TelemetryWhereInput
    orderBy?: TelemetryOrderByWithAggregationInput | TelemetryOrderByWithAggregationInput[]
    by: TelemetryScalarFieldEnum[] | TelemetryScalarFieldEnum
    having?: TelemetryScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TelemetryCountAggregateInputType | true
    _avg?: TelemetryAvgAggregateInputType
    _sum?: TelemetrySumAggregateInputType
    _min?: TelemetryMinAggregateInputType
    _max?: TelemetryMaxAggregateInputType
  }

  export type TelemetryGroupByOutputType = {
    id: number
    timeStamp: Date
    cpuUsageMs: number | null
    ramUsageMB: number | null
    networkEgressKB: number | null
    ip: string | null
    country: string | null
    city: string | null
    _count: TelemetryCountAggregateOutputType | null
    _avg: TelemetryAvgAggregateOutputType | null
    _sum: TelemetrySumAggregateOutputType | null
    _min: TelemetryMinAggregateOutputType | null
    _max: TelemetryMaxAggregateOutputType | null
  }

  type GetTelemetryGroupByPayload<T extends TelemetryGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TelemetryGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TelemetryGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TelemetryGroupByOutputType[P]>
            : GetScalarType<T[P], TelemetryGroupByOutputType[P]>
        }
      >
    >


  export type TelemetrySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    timeStamp?: boolean
    cpuUsageMs?: boolean
    ramUsageMB?: boolean
    networkEgressKB?: boolean
    ip?: boolean
    country?: boolean
    city?: boolean
  }, ExtArgs["result"]["telemetry"]>

  export type TelemetrySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    timeStamp?: boolean
    cpuUsageMs?: boolean
    ramUsageMB?: boolean
    networkEgressKB?: boolean
    ip?: boolean
    country?: boolean
    city?: boolean
  }, ExtArgs["result"]["telemetry"]>

  export type TelemetrySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    timeStamp?: boolean
    cpuUsageMs?: boolean
    ramUsageMB?: boolean
    networkEgressKB?: boolean
    ip?: boolean
    country?: boolean
    city?: boolean
  }, ExtArgs["result"]["telemetry"]>

  export type TelemetrySelectScalar = {
    id?: boolean
    timeStamp?: boolean
    cpuUsageMs?: boolean
    ramUsageMB?: boolean
    networkEgressKB?: boolean
    ip?: boolean
    country?: boolean
    city?: boolean
  }

  export type TelemetryOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "timeStamp" | "cpuUsageMs" | "ramUsageMB" | "networkEgressKB" | "ip" | "country" | "city", ExtArgs["result"]["telemetry"]>

  export type $TelemetryPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Telemetry"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: number
      timeStamp: Date
      cpuUsageMs: number | null
      ramUsageMB: number | null
      networkEgressKB: number | null
      ip: string | null
      country: string | null
      city: string | null
    }, ExtArgs["result"]["telemetry"]>
    composites: {}
  }

  type TelemetryGetPayload<S extends boolean | null | undefined | TelemetryDefaultArgs> = $Result.GetResult<Prisma.$TelemetryPayload, S>

  type TelemetryCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TelemetryFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TelemetryCountAggregateInputType | true
    }

  export interface TelemetryDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Telemetry'], meta: { name: 'Telemetry' } }
    /**
     * Find zero or one Telemetry that matches the filter.
     * @param {TelemetryFindUniqueArgs} args - Arguments to find a Telemetry
     * @example
     * // Get one Telemetry
     * const telemetry = await prisma.telemetry.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TelemetryFindUniqueArgs>(args: SelectSubset<T, TelemetryFindUniqueArgs<ExtArgs>>): Prisma__TelemetryClient<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Telemetry that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TelemetryFindUniqueOrThrowArgs} args - Arguments to find a Telemetry
     * @example
     * // Get one Telemetry
     * const telemetry = await prisma.telemetry.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TelemetryFindUniqueOrThrowArgs>(args: SelectSubset<T, TelemetryFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TelemetryClient<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Telemetry that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TelemetryFindFirstArgs} args - Arguments to find a Telemetry
     * @example
     * // Get one Telemetry
     * const telemetry = await prisma.telemetry.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TelemetryFindFirstArgs>(args?: SelectSubset<T, TelemetryFindFirstArgs<ExtArgs>>): Prisma__TelemetryClient<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Telemetry that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TelemetryFindFirstOrThrowArgs} args - Arguments to find a Telemetry
     * @example
     * // Get one Telemetry
     * const telemetry = await prisma.telemetry.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TelemetryFindFirstOrThrowArgs>(args?: SelectSubset<T, TelemetryFindFirstOrThrowArgs<ExtArgs>>): Prisma__TelemetryClient<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Telemetries that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TelemetryFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Telemetries
     * const telemetries = await prisma.telemetry.findMany()
     * 
     * // Get first 10 Telemetries
     * const telemetries = await prisma.telemetry.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const telemetryWithIdOnly = await prisma.telemetry.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TelemetryFindManyArgs>(args?: SelectSubset<T, TelemetryFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Telemetry.
     * @param {TelemetryCreateArgs} args - Arguments to create a Telemetry.
     * @example
     * // Create one Telemetry
     * const Telemetry = await prisma.telemetry.create({
     *   data: {
     *     // ... data to create a Telemetry
     *   }
     * })
     * 
     */
    create<T extends TelemetryCreateArgs>(args: SelectSubset<T, TelemetryCreateArgs<ExtArgs>>): Prisma__TelemetryClient<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Telemetries.
     * @param {TelemetryCreateManyArgs} args - Arguments to create many Telemetries.
     * @example
     * // Create many Telemetries
     * const telemetry = await prisma.telemetry.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TelemetryCreateManyArgs>(args?: SelectSubset<T, TelemetryCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Telemetries and returns the data saved in the database.
     * @param {TelemetryCreateManyAndReturnArgs} args - Arguments to create many Telemetries.
     * @example
     * // Create many Telemetries
     * const telemetry = await prisma.telemetry.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Telemetries and only return the `id`
     * const telemetryWithIdOnly = await prisma.telemetry.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TelemetryCreateManyAndReturnArgs>(args?: SelectSubset<T, TelemetryCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Telemetry.
     * @param {TelemetryDeleteArgs} args - Arguments to delete one Telemetry.
     * @example
     * // Delete one Telemetry
     * const Telemetry = await prisma.telemetry.delete({
     *   where: {
     *     // ... filter to delete one Telemetry
     *   }
     * })
     * 
     */
    delete<T extends TelemetryDeleteArgs>(args: SelectSubset<T, TelemetryDeleteArgs<ExtArgs>>): Prisma__TelemetryClient<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Telemetry.
     * @param {TelemetryUpdateArgs} args - Arguments to update one Telemetry.
     * @example
     * // Update one Telemetry
     * const telemetry = await prisma.telemetry.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TelemetryUpdateArgs>(args: SelectSubset<T, TelemetryUpdateArgs<ExtArgs>>): Prisma__TelemetryClient<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Telemetries.
     * @param {TelemetryDeleteManyArgs} args - Arguments to filter Telemetries to delete.
     * @example
     * // Delete a few Telemetries
     * const { count } = await prisma.telemetry.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TelemetryDeleteManyArgs>(args?: SelectSubset<T, TelemetryDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Telemetries.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TelemetryUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Telemetries
     * const telemetry = await prisma.telemetry.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TelemetryUpdateManyArgs>(args: SelectSubset<T, TelemetryUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Telemetries and returns the data updated in the database.
     * @param {TelemetryUpdateManyAndReturnArgs} args - Arguments to update many Telemetries.
     * @example
     * // Update many Telemetries
     * const telemetry = await prisma.telemetry.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Telemetries and only return the `id`
     * const telemetryWithIdOnly = await prisma.telemetry.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TelemetryUpdateManyAndReturnArgs>(args: SelectSubset<T, TelemetryUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Telemetry.
     * @param {TelemetryUpsertArgs} args - Arguments to update or create a Telemetry.
     * @example
     * // Update or create a Telemetry
     * const telemetry = await prisma.telemetry.upsert({
     *   create: {
     *     // ... data to create a Telemetry
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Telemetry we want to update
     *   }
     * })
     */
    upsert<T extends TelemetryUpsertArgs>(args: SelectSubset<T, TelemetryUpsertArgs<ExtArgs>>): Prisma__TelemetryClient<$Result.GetResult<Prisma.$TelemetryPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Telemetries.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TelemetryCountArgs} args - Arguments to filter Telemetries to count.
     * @example
     * // Count the number of Telemetries
     * const count = await prisma.telemetry.count({
     *   where: {
     *     // ... the filter for the Telemetries we want to count
     *   }
     * })
    **/
    count<T extends TelemetryCountArgs>(
      args?: Subset<T, TelemetryCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TelemetryCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Telemetry.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TelemetryAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TelemetryAggregateArgs>(args: Subset<T, TelemetryAggregateArgs>): Prisma.PrismaPromise<GetTelemetryAggregateType<T>>

    /**
     * Group by Telemetry.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TelemetryGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TelemetryGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TelemetryGroupByArgs['orderBy'] }
        : { orderBy?: TelemetryGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TelemetryGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTelemetryGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Telemetry model
   */
  readonly fields: TelemetryFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Telemetry.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TelemetryClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Telemetry model
   */
  interface TelemetryFieldRefs {
    readonly id: FieldRef<"Telemetry", 'Int'>
    readonly timeStamp: FieldRef<"Telemetry", 'DateTime'>
    readonly cpuUsageMs: FieldRef<"Telemetry", 'Int'>
    readonly ramUsageMB: FieldRef<"Telemetry", 'Int'>
    readonly networkEgressKB: FieldRef<"Telemetry", 'Int'>
    readonly ip: FieldRef<"Telemetry", 'String'>
    readonly country: FieldRef<"Telemetry", 'String'>
    readonly city: FieldRef<"Telemetry", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Telemetry findUnique
   */
  export type TelemetryFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * Filter, which Telemetry to fetch.
     */
    where: TelemetryWhereUniqueInput
  }

  /**
   * Telemetry findUniqueOrThrow
   */
  export type TelemetryFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * Filter, which Telemetry to fetch.
     */
    where: TelemetryWhereUniqueInput
  }

  /**
   * Telemetry findFirst
   */
  export type TelemetryFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * Filter, which Telemetry to fetch.
     */
    where?: TelemetryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Telemetries to fetch.
     */
    orderBy?: TelemetryOrderByWithRelationInput | TelemetryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Telemetries.
     */
    cursor?: TelemetryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Telemetries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Telemetries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Telemetries.
     */
    distinct?: TelemetryScalarFieldEnum | TelemetryScalarFieldEnum[]
  }

  /**
   * Telemetry findFirstOrThrow
   */
  export type TelemetryFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * Filter, which Telemetry to fetch.
     */
    where?: TelemetryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Telemetries to fetch.
     */
    orderBy?: TelemetryOrderByWithRelationInput | TelemetryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Telemetries.
     */
    cursor?: TelemetryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Telemetries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Telemetries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Telemetries.
     */
    distinct?: TelemetryScalarFieldEnum | TelemetryScalarFieldEnum[]
  }

  /**
   * Telemetry findMany
   */
  export type TelemetryFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * Filter, which Telemetries to fetch.
     */
    where?: TelemetryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Telemetries to fetch.
     */
    orderBy?: TelemetryOrderByWithRelationInput | TelemetryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Telemetries.
     */
    cursor?: TelemetryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Telemetries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Telemetries.
     */
    skip?: number
    distinct?: TelemetryScalarFieldEnum | TelemetryScalarFieldEnum[]
  }

  /**
   * Telemetry create
   */
  export type TelemetryCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * The data needed to create a Telemetry.
     */
    data?: XOR<TelemetryCreateInput, TelemetryUncheckedCreateInput>
  }

  /**
   * Telemetry createMany
   */
  export type TelemetryCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Telemetries.
     */
    data: TelemetryCreateManyInput | TelemetryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Telemetry createManyAndReturn
   */
  export type TelemetryCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * The data used to create many Telemetries.
     */
    data: TelemetryCreateManyInput | TelemetryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Telemetry update
   */
  export type TelemetryUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * The data needed to update a Telemetry.
     */
    data: XOR<TelemetryUpdateInput, TelemetryUncheckedUpdateInput>
    /**
     * Choose, which Telemetry to update.
     */
    where: TelemetryWhereUniqueInput
  }

  /**
   * Telemetry updateMany
   */
  export type TelemetryUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Telemetries.
     */
    data: XOR<TelemetryUpdateManyMutationInput, TelemetryUncheckedUpdateManyInput>
    /**
     * Filter which Telemetries to update
     */
    where?: TelemetryWhereInput
    /**
     * Limit how many Telemetries to update.
     */
    limit?: number
  }

  /**
   * Telemetry updateManyAndReturn
   */
  export type TelemetryUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * The data used to update Telemetries.
     */
    data: XOR<TelemetryUpdateManyMutationInput, TelemetryUncheckedUpdateManyInput>
    /**
     * Filter which Telemetries to update
     */
    where?: TelemetryWhereInput
    /**
     * Limit how many Telemetries to update.
     */
    limit?: number
  }

  /**
   * Telemetry upsert
   */
  export type TelemetryUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * The filter to search for the Telemetry to update in case it exists.
     */
    where: TelemetryWhereUniqueInput
    /**
     * In case the Telemetry found by the `where` argument doesn't exist, create a new Telemetry with this data.
     */
    create: XOR<TelemetryCreateInput, TelemetryUncheckedCreateInput>
    /**
     * In case the Telemetry was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TelemetryUpdateInput, TelemetryUncheckedUpdateInput>
  }

  /**
   * Telemetry delete
   */
  export type TelemetryDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
    /**
     * Filter which Telemetry to delete.
     */
    where: TelemetryWhereUniqueInput
  }

  /**
   * Telemetry deleteMany
   */
  export type TelemetryDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Telemetries to delete
     */
    where?: TelemetryWhereInput
    /**
     * Limit how many Telemetries to delete.
     */
    limit?: number
  }

  /**
   * Telemetry without action
   */
  export type TelemetryDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Telemetry
     */
    select?: TelemetrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Telemetry
     */
    omit?: TelemetryOmit<ExtArgs> | null
  }


  /**
   * Model Payment
   */

  export type AggregatePayment = {
    _count: PaymentCountAggregateOutputType | null
    _avg: PaymentAvgAggregateOutputType | null
    _sum: PaymentSumAggregateOutputType | null
    _min: PaymentMinAggregateOutputType | null
    _max: PaymentMaxAggregateOutputType | null
  }

  export type PaymentAvgAggregateOutputType = {
    id: number | null
    amount: number | null
    userId: number | null
  }

  export type PaymentSumAggregateOutputType = {
    id: number | null
    amount: number | null
    userId: number | null
  }

  export type PaymentMinAggregateOutputType = {
    id: number | null
    amount: number | null
    currency: string | null
    status: string | null
    reference: string | null
    createdAt: Date | null
    userId: number | null
  }

  export type PaymentMaxAggregateOutputType = {
    id: number | null
    amount: number | null
    currency: string | null
    status: string | null
    reference: string | null
    createdAt: Date | null
    userId: number | null
  }

  export type PaymentCountAggregateOutputType = {
    id: number
    amount: number
    currency: number
    status: number
    reference: number
    createdAt: number
    userId: number
    _all: number
  }


  export type PaymentAvgAggregateInputType = {
    id?: true
    amount?: true
    userId?: true
  }

  export type PaymentSumAggregateInputType = {
    id?: true
    amount?: true
    userId?: true
  }

  export type PaymentMinAggregateInputType = {
    id?: true
    amount?: true
    currency?: true
    status?: true
    reference?: true
    createdAt?: true
    userId?: true
  }

  export type PaymentMaxAggregateInputType = {
    id?: true
    amount?: true
    currency?: true
    status?: true
    reference?: true
    createdAt?: true
    userId?: true
  }

  export type PaymentCountAggregateInputType = {
    id?: true
    amount?: true
    currency?: true
    status?: true
    reference?: true
    createdAt?: true
    userId?: true
    _all?: true
  }

  export type PaymentAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Payment to aggregate.
     */
    where?: PaymentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Payments to fetch.
     */
    orderBy?: PaymentOrderByWithRelationInput | PaymentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PaymentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Payments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Payments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Payments
    **/
    _count?: true | PaymentCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: PaymentAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: PaymentSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PaymentMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PaymentMaxAggregateInputType
  }

  export type GetPaymentAggregateType<T extends PaymentAggregateArgs> = {
        [P in keyof T & keyof AggregatePayment]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePayment[P]>
      : GetScalarType<T[P], AggregatePayment[P]>
  }




  export type PaymentGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PaymentWhereInput
    orderBy?: PaymentOrderByWithAggregationInput | PaymentOrderByWithAggregationInput[]
    by: PaymentScalarFieldEnum[] | PaymentScalarFieldEnum
    having?: PaymentScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PaymentCountAggregateInputType | true
    _avg?: PaymentAvgAggregateInputType
    _sum?: PaymentSumAggregateInputType
    _min?: PaymentMinAggregateInputType
    _max?: PaymentMaxAggregateInputType
  }

  export type PaymentGroupByOutputType = {
    id: number
    amount: number
    currency: string
    status: string
    reference: string | null
    createdAt: Date
    userId: number | null
    _count: PaymentCountAggregateOutputType | null
    _avg: PaymentAvgAggregateOutputType | null
    _sum: PaymentSumAggregateOutputType | null
    _min: PaymentMinAggregateOutputType | null
    _max: PaymentMaxAggregateOutputType | null
  }

  type GetPaymentGroupByPayload<T extends PaymentGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PaymentGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PaymentGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PaymentGroupByOutputType[P]>
            : GetScalarType<T[P], PaymentGroupByOutputType[P]>
        }
      >
    >


  export type PaymentSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    amount?: boolean
    currency?: boolean
    status?: boolean
    reference?: boolean
    createdAt?: boolean
    userId?: boolean
    user?: boolean | Payment$userArgs<ExtArgs>
  }, ExtArgs["result"]["payment"]>

  export type PaymentSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    amount?: boolean
    currency?: boolean
    status?: boolean
    reference?: boolean
    createdAt?: boolean
    userId?: boolean
    user?: boolean | Payment$userArgs<ExtArgs>
  }, ExtArgs["result"]["payment"]>

  export type PaymentSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    amount?: boolean
    currency?: boolean
    status?: boolean
    reference?: boolean
    createdAt?: boolean
    userId?: boolean
    user?: boolean | Payment$userArgs<ExtArgs>
  }, ExtArgs["result"]["payment"]>

  export type PaymentSelectScalar = {
    id?: boolean
    amount?: boolean
    currency?: boolean
    status?: boolean
    reference?: boolean
    createdAt?: boolean
    userId?: boolean
  }

  export type PaymentOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "amount" | "currency" | "status" | "reference" | "createdAt" | "userId", ExtArgs["result"]["payment"]>
  export type PaymentInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | Payment$userArgs<ExtArgs>
  }
  export type PaymentIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | Payment$userArgs<ExtArgs>
  }
  export type PaymentIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | Payment$userArgs<ExtArgs>
  }

  export type $PaymentPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Payment"
    objects: {
      user: Prisma.$UserPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      amount: number
      currency: string
      status: string
      reference: string | null
      createdAt: Date
      userId: number | null
    }, ExtArgs["result"]["payment"]>
    composites: {}
  }

  type PaymentGetPayload<S extends boolean | null | undefined | PaymentDefaultArgs> = $Result.GetResult<Prisma.$PaymentPayload, S>

  type PaymentCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<PaymentFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: PaymentCountAggregateInputType | true
    }

  export interface PaymentDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Payment'], meta: { name: 'Payment' } }
    /**
     * Find zero or one Payment that matches the filter.
     * @param {PaymentFindUniqueArgs} args - Arguments to find a Payment
     * @example
     * // Get one Payment
     * const payment = await prisma.payment.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PaymentFindUniqueArgs>(args: SelectSubset<T, PaymentFindUniqueArgs<ExtArgs>>): Prisma__PaymentClient<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Payment that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {PaymentFindUniqueOrThrowArgs} args - Arguments to find a Payment
     * @example
     * // Get one Payment
     * const payment = await prisma.payment.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PaymentFindUniqueOrThrowArgs>(args: SelectSubset<T, PaymentFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PaymentClient<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Payment that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PaymentFindFirstArgs} args - Arguments to find a Payment
     * @example
     * // Get one Payment
     * const payment = await prisma.payment.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PaymentFindFirstArgs>(args?: SelectSubset<T, PaymentFindFirstArgs<ExtArgs>>): Prisma__PaymentClient<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Payment that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PaymentFindFirstOrThrowArgs} args - Arguments to find a Payment
     * @example
     * // Get one Payment
     * const payment = await prisma.payment.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PaymentFindFirstOrThrowArgs>(args?: SelectSubset<T, PaymentFindFirstOrThrowArgs<ExtArgs>>): Prisma__PaymentClient<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Payments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PaymentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Payments
     * const payments = await prisma.payment.findMany()
     * 
     * // Get first 10 Payments
     * const payments = await prisma.payment.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const paymentWithIdOnly = await prisma.payment.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PaymentFindManyArgs>(args?: SelectSubset<T, PaymentFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Payment.
     * @param {PaymentCreateArgs} args - Arguments to create a Payment.
     * @example
     * // Create one Payment
     * const Payment = await prisma.payment.create({
     *   data: {
     *     // ... data to create a Payment
     *   }
     * })
     * 
     */
    create<T extends PaymentCreateArgs>(args: SelectSubset<T, PaymentCreateArgs<ExtArgs>>): Prisma__PaymentClient<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Payments.
     * @param {PaymentCreateManyArgs} args - Arguments to create many Payments.
     * @example
     * // Create many Payments
     * const payment = await prisma.payment.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PaymentCreateManyArgs>(args?: SelectSubset<T, PaymentCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Payments and returns the data saved in the database.
     * @param {PaymentCreateManyAndReturnArgs} args - Arguments to create many Payments.
     * @example
     * // Create many Payments
     * const payment = await prisma.payment.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Payments and only return the `id`
     * const paymentWithIdOnly = await prisma.payment.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends PaymentCreateManyAndReturnArgs>(args?: SelectSubset<T, PaymentCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Payment.
     * @param {PaymentDeleteArgs} args - Arguments to delete one Payment.
     * @example
     * // Delete one Payment
     * const Payment = await prisma.payment.delete({
     *   where: {
     *     // ... filter to delete one Payment
     *   }
     * })
     * 
     */
    delete<T extends PaymentDeleteArgs>(args: SelectSubset<T, PaymentDeleteArgs<ExtArgs>>): Prisma__PaymentClient<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Payment.
     * @param {PaymentUpdateArgs} args - Arguments to update one Payment.
     * @example
     * // Update one Payment
     * const payment = await prisma.payment.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PaymentUpdateArgs>(args: SelectSubset<T, PaymentUpdateArgs<ExtArgs>>): Prisma__PaymentClient<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Payments.
     * @param {PaymentDeleteManyArgs} args - Arguments to filter Payments to delete.
     * @example
     * // Delete a few Payments
     * const { count } = await prisma.payment.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PaymentDeleteManyArgs>(args?: SelectSubset<T, PaymentDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Payments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PaymentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Payments
     * const payment = await prisma.payment.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PaymentUpdateManyArgs>(args: SelectSubset<T, PaymentUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Payments and returns the data updated in the database.
     * @param {PaymentUpdateManyAndReturnArgs} args - Arguments to update many Payments.
     * @example
     * // Update many Payments
     * const payment = await prisma.payment.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Payments and only return the `id`
     * const paymentWithIdOnly = await prisma.payment.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends PaymentUpdateManyAndReturnArgs>(args: SelectSubset<T, PaymentUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Payment.
     * @param {PaymentUpsertArgs} args - Arguments to update or create a Payment.
     * @example
     * // Update or create a Payment
     * const payment = await prisma.payment.upsert({
     *   create: {
     *     // ... data to create a Payment
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Payment we want to update
     *   }
     * })
     */
    upsert<T extends PaymentUpsertArgs>(args: SelectSubset<T, PaymentUpsertArgs<ExtArgs>>): Prisma__PaymentClient<$Result.GetResult<Prisma.$PaymentPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Payments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PaymentCountArgs} args - Arguments to filter Payments to count.
     * @example
     * // Count the number of Payments
     * const count = await prisma.payment.count({
     *   where: {
     *     // ... the filter for the Payments we want to count
     *   }
     * })
    **/
    count<T extends PaymentCountArgs>(
      args?: Subset<T, PaymentCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PaymentCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Payment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PaymentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PaymentAggregateArgs>(args: Subset<T, PaymentAggregateArgs>): Prisma.PrismaPromise<GetPaymentAggregateType<T>>

    /**
     * Group by Payment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PaymentGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PaymentGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PaymentGroupByArgs['orderBy'] }
        : { orderBy?: PaymentGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PaymentGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPaymentGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Payment model
   */
  readonly fields: PaymentFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Payment.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PaymentClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends Payment$userArgs<ExtArgs> = {}>(args?: Subset<T, Payment$userArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Payment model
   */
  interface PaymentFieldRefs {
    readonly id: FieldRef<"Payment", 'Int'>
    readonly amount: FieldRef<"Payment", 'Float'>
    readonly currency: FieldRef<"Payment", 'String'>
    readonly status: FieldRef<"Payment", 'String'>
    readonly reference: FieldRef<"Payment", 'String'>
    readonly createdAt: FieldRef<"Payment", 'DateTime'>
    readonly userId: FieldRef<"Payment", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * Payment findUnique
   */
  export type PaymentFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
    /**
     * Filter, which Payment to fetch.
     */
    where: PaymentWhereUniqueInput
  }

  /**
   * Payment findUniqueOrThrow
   */
  export type PaymentFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
    /**
     * Filter, which Payment to fetch.
     */
    where: PaymentWhereUniqueInput
  }

  /**
   * Payment findFirst
   */
  export type PaymentFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
    /**
     * Filter, which Payment to fetch.
     */
    where?: PaymentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Payments to fetch.
     */
    orderBy?: PaymentOrderByWithRelationInput | PaymentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Payments.
     */
    cursor?: PaymentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Payments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Payments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Payments.
     */
    distinct?: PaymentScalarFieldEnum | PaymentScalarFieldEnum[]
  }

  /**
   * Payment findFirstOrThrow
   */
  export type PaymentFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
    /**
     * Filter, which Payment to fetch.
     */
    where?: PaymentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Payments to fetch.
     */
    orderBy?: PaymentOrderByWithRelationInput | PaymentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Payments.
     */
    cursor?: PaymentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Payments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Payments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Payments.
     */
    distinct?: PaymentScalarFieldEnum | PaymentScalarFieldEnum[]
  }

  /**
   * Payment findMany
   */
  export type PaymentFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
    /**
     * Filter, which Payments to fetch.
     */
    where?: PaymentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Payments to fetch.
     */
    orderBy?: PaymentOrderByWithRelationInput | PaymentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Payments.
     */
    cursor?: PaymentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Payments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Payments.
     */
    skip?: number
    distinct?: PaymentScalarFieldEnum | PaymentScalarFieldEnum[]
  }

  /**
   * Payment create
   */
  export type PaymentCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
    /**
     * The data needed to create a Payment.
     */
    data: XOR<PaymentCreateInput, PaymentUncheckedCreateInput>
  }

  /**
   * Payment createMany
   */
  export type PaymentCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Payments.
     */
    data: PaymentCreateManyInput | PaymentCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Payment createManyAndReturn
   */
  export type PaymentCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * The data used to create many Payments.
     */
    data: PaymentCreateManyInput | PaymentCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Payment update
   */
  export type PaymentUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
    /**
     * The data needed to update a Payment.
     */
    data: XOR<PaymentUpdateInput, PaymentUncheckedUpdateInput>
    /**
     * Choose, which Payment to update.
     */
    where: PaymentWhereUniqueInput
  }

  /**
   * Payment updateMany
   */
  export type PaymentUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Payments.
     */
    data: XOR<PaymentUpdateManyMutationInput, PaymentUncheckedUpdateManyInput>
    /**
     * Filter which Payments to update
     */
    where?: PaymentWhereInput
    /**
     * Limit how many Payments to update.
     */
    limit?: number
  }

  /**
   * Payment updateManyAndReturn
   */
  export type PaymentUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * The data used to update Payments.
     */
    data: XOR<PaymentUpdateManyMutationInput, PaymentUncheckedUpdateManyInput>
    /**
     * Filter which Payments to update
     */
    where?: PaymentWhereInput
    /**
     * Limit how many Payments to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Payment upsert
   */
  export type PaymentUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
    /**
     * The filter to search for the Payment to update in case it exists.
     */
    where: PaymentWhereUniqueInput
    /**
     * In case the Payment found by the `where` argument doesn't exist, create a new Payment with this data.
     */
    create: XOR<PaymentCreateInput, PaymentUncheckedCreateInput>
    /**
     * In case the Payment was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PaymentUpdateInput, PaymentUncheckedUpdateInput>
  }

  /**
   * Payment delete
   */
  export type PaymentDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
    /**
     * Filter which Payment to delete.
     */
    where: PaymentWhereUniqueInput
  }

  /**
   * Payment deleteMany
   */
  export type PaymentDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Payments to delete
     */
    where?: PaymentWhereInput
    /**
     * Limit how many Payments to delete.
     */
    limit?: number
  }

  /**
   * Payment.user
   */
  export type Payment$userArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    where?: UserWhereInput
  }

  /**
   * Payment without action
   */
  export type PaymentDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Payment
     */
    select?: PaymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Payment
     */
    omit?: PaymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PaymentInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const UserScalarFieldEnum: {
    id: 'id',
    username: 'username',
    password: 'password',
    email: 'email',
    role: 'role',
    token: 'token',
    active: 'active',
    AiTokensUse: 'AiTokensUse',
    AiTokensLimit: 'AiTokensLimit',
    tokensPerResponse: 'tokensPerResponse'
  };

  export type UserScalarFieldEnum = (typeof UserScalarFieldEnum)[keyof typeof UserScalarFieldEnum]


  export const WhatsAppNumberScalarFieldEnum: {
    id: 'id',
    number: 'number',
    name: 'name',
    aiEnabled: 'aiEnabled',
    aiPrompt: 'aiPrompt',
    aiModel: 'aiModel',
    responseGroups: 'responseGroups',
    userId: 'userId'
  };

  export type WhatsAppNumberScalarFieldEnum = (typeof WhatsAppNumberScalarFieldEnum)[keyof typeof WhatsAppNumberScalarFieldEnum]


  export const TelemetryScalarFieldEnum: {
    id: 'id',
    timeStamp: 'timeStamp',
    cpuUsageMs: 'cpuUsageMs',
    ramUsageMB: 'ramUsageMB',
    networkEgressKB: 'networkEgressKB',
    ip: 'ip',
    country: 'country',
    city: 'city'
  };

  export type TelemetryScalarFieldEnum = (typeof TelemetryScalarFieldEnum)[keyof typeof TelemetryScalarFieldEnum]


  export const PaymentScalarFieldEnum: {
    id: 'id',
    amount: 'amount',
    currency: 'currency',
    status: 'status',
    reference: 'reference',
    createdAt: 'createdAt',
    userId: 'userId'
  };

  export type PaymentScalarFieldEnum = (typeof PaymentScalarFieldEnum)[keyof typeof PaymentScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Role'
   */
  export type EnumRoleFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Role'>
    


  /**
   * Reference to a field of type 'Role[]'
   */
  export type ListEnumRoleFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Role[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type UserWhereInput = {
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    id?: IntFilter<"User"> | number
    username?: StringFilter<"User"> | string
    password?: StringFilter<"User"> | string
    email?: StringFilter<"User"> | string
    role?: EnumRoleFilter<"User"> | $Enums.Role
    token?: StringNullableFilter<"User"> | string | null
    active?: BoolFilter<"User"> | boolean
    AiTokensUse?: IntFilter<"User"> | number
    AiTokensLimit?: IntFilter<"User"> | number
    tokensPerResponse?: IntFilter<"User"> | number
    whatsappNumbers?: WhatsAppNumberListRelationFilter
    Payment?: PaymentListRelationFilter
  }

  export type UserOrderByWithRelationInput = {
    id?: SortOrder
    username?: SortOrder
    password?: SortOrder
    email?: SortOrder
    role?: SortOrder
    token?: SortOrderInput | SortOrder
    active?: SortOrder
    AiTokensUse?: SortOrder
    AiTokensLimit?: SortOrder
    tokensPerResponse?: SortOrder
    whatsappNumbers?: WhatsAppNumberOrderByRelationAggregateInput
    Payment?: PaymentOrderByRelationAggregateInput
  }

  export type UserWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    username?: string
    email?: string
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    password?: StringFilter<"User"> | string
    role?: EnumRoleFilter<"User"> | $Enums.Role
    token?: StringNullableFilter<"User"> | string | null
    active?: BoolFilter<"User"> | boolean
    AiTokensUse?: IntFilter<"User"> | number
    AiTokensLimit?: IntFilter<"User"> | number
    tokensPerResponse?: IntFilter<"User"> | number
    whatsappNumbers?: WhatsAppNumberListRelationFilter
    Payment?: PaymentListRelationFilter
  }, "id" | "username" | "email">

  export type UserOrderByWithAggregationInput = {
    id?: SortOrder
    username?: SortOrder
    password?: SortOrder
    email?: SortOrder
    role?: SortOrder
    token?: SortOrderInput | SortOrder
    active?: SortOrder
    AiTokensUse?: SortOrder
    AiTokensLimit?: SortOrder
    tokensPerResponse?: SortOrder
    _count?: UserCountOrderByAggregateInput
    _avg?: UserAvgOrderByAggregateInput
    _max?: UserMaxOrderByAggregateInput
    _min?: UserMinOrderByAggregateInput
    _sum?: UserSumOrderByAggregateInput
  }

  export type UserScalarWhereWithAggregatesInput = {
    AND?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    OR?: UserScalarWhereWithAggregatesInput[]
    NOT?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"User"> | number
    username?: StringWithAggregatesFilter<"User"> | string
    password?: StringWithAggregatesFilter<"User"> | string
    email?: StringWithAggregatesFilter<"User"> | string
    role?: EnumRoleWithAggregatesFilter<"User"> | $Enums.Role
    token?: StringNullableWithAggregatesFilter<"User"> | string | null
    active?: BoolWithAggregatesFilter<"User"> | boolean
    AiTokensUse?: IntWithAggregatesFilter<"User"> | number
    AiTokensLimit?: IntWithAggregatesFilter<"User"> | number
    tokensPerResponse?: IntWithAggregatesFilter<"User"> | number
  }

  export type WhatsAppNumberWhereInput = {
    AND?: WhatsAppNumberWhereInput | WhatsAppNumberWhereInput[]
    OR?: WhatsAppNumberWhereInput[]
    NOT?: WhatsAppNumberWhereInput | WhatsAppNumberWhereInput[]
    id?: IntFilter<"WhatsAppNumber"> | number
    number?: StringFilter<"WhatsAppNumber"> | string
    name?: StringFilter<"WhatsAppNumber"> | string
    aiEnabled?: BoolFilter<"WhatsAppNumber"> | boolean
    aiPrompt?: StringFilter<"WhatsAppNumber"> | string
    aiModel?: StringFilter<"WhatsAppNumber"> | string
    responseGroups?: BoolFilter<"WhatsAppNumber"> | boolean
    userId?: IntFilter<"WhatsAppNumber"> | number
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
  }

  export type WhatsAppNumberOrderByWithRelationInput = {
    id?: SortOrder
    number?: SortOrder
    name?: SortOrder
    aiEnabled?: SortOrder
    aiPrompt?: SortOrder
    aiModel?: SortOrder
    responseGroups?: SortOrder
    userId?: SortOrder
    user?: UserOrderByWithRelationInput
  }

  export type WhatsAppNumberWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: WhatsAppNumberWhereInput | WhatsAppNumberWhereInput[]
    OR?: WhatsAppNumberWhereInput[]
    NOT?: WhatsAppNumberWhereInput | WhatsAppNumberWhereInput[]
    number?: StringFilter<"WhatsAppNumber"> | string
    name?: StringFilter<"WhatsAppNumber"> | string
    aiEnabled?: BoolFilter<"WhatsAppNumber"> | boolean
    aiPrompt?: StringFilter<"WhatsAppNumber"> | string
    aiModel?: StringFilter<"WhatsAppNumber"> | string
    responseGroups?: BoolFilter<"WhatsAppNumber"> | boolean
    userId?: IntFilter<"WhatsAppNumber"> | number
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
  }, "id">

  export type WhatsAppNumberOrderByWithAggregationInput = {
    id?: SortOrder
    number?: SortOrder
    name?: SortOrder
    aiEnabled?: SortOrder
    aiPrompt?: SortOrder
    aiModel?: SortOrder
    responseGroups?: SortOrder
    userId?: SortOrder
    _count?: WhatsAppNumberCountOrderByAggregateInput
    _avg?: WhatsAppNumberAvgOrderByAggregateInput
    _max?: WhatsAppNumberMaxOrderByAggregateInput
    _min?: WhatsAppNumberMinOrderByAggregateInput
    _sum?: WhatsAppNumberSumOrderByAggregateInput
  }

  export type WhatsAppNumberScalarWhereWithAggregatesInput = {
    AND?: WhatsAppNumberScalarWhereWithAggregatesInput | WhatsAppNumberScalarWhereWithAggregatesInput[]
    OR?: WhatsAppNumberScalarWhereWithAggregatesInput[]
    NOT?: WhatsAppNumberScalarWhereWithAggregatesInput | WhatsAppNumberScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"WhatsAppNumber"> | number
    number?: StringWithAggregatesFilter<"WhatsAppNumber"> | string
    name?: StringWithAggregatesFilter<"WhatsAppNumber"> | string
    aiEnabled?: BoolWithAggregatesFilter<"WhatsAppNumber"> | boolean
    aiPrompt?: StringWithAggregatesFilter<"WhatsAppNumber"> | string
    aiModel?: StringWithAggregatesFilter<"WhatsAppNumber"> | string
    responseGroups?: BoolWithAggregatesFilter<"WhatsAppNumber"> | boolean
    userId?: IntWithAggregatesFilter<"WhatsAppNumber"> | number
  }

  export type TelemetryWhereInput = {
    AND?: TelemetryWhereInput | TelemetryWhereInput[]
    OR?: TelemetryWhereInput[]
    NOT?: TelemetryWhereInput | TelemetryWhereInput[]
    id?: IntFilter<"Telemetry"> | number
    timeStamp?: DateTimeFilter<"Telemetry"> | Date | string
    cpuUsageMs?: IntNullableFilter<"Telemetry"> | number | null
    ramUsageMB?: IntNullableFilter<"Telemetry"> | number | null
    networkEgressKB?: IntNullableFilter<"Telemetry"> | number | null
    ip?: StringNullableFilter<"Telemetry"> | string | null
    country?: StringNullableFilter<"Telemetry"> | string | null
    city?: StringNullableFilter<"Telemetry"> | string | null
  }

  export type TelemetryOrderByWithRelationInput = {
    id?: SortOrder
    timeStamp?: SortOrder
    cpuUsageMs?: SortOrderInput | SortOrder
    ramUsageMB?: SortOrderInput | SortOrder
    networkEgressKB?: SortOrderInput | SortOrder
    ip?: SortOrderInput | SortOrder
    country?: SortOrderInput | SortOrder
    city?: SortOrderInput | SortOrder
  }

  export type TelemetryWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: TelemetryWhereInput | TelemetryWhereInput[]
    OR?: TelemetryWhereInput[]
    NOT?: TelemetryWhereInput | TelemetryWhereInput[]
    timeStamp?: DateTimeFilter<"Telemetry"> | Date | string
    cpuUsageMs?: IntNullableFilter<"Telemetry"> | number | null
    ramUsageMB?: IntNullableFilter<"Telemetry"> | number | null
    networkEgressKB?: IntNullableFilter<"Telemetry"> | number | null
    ip?: StringNullableFilter<"Telemetry"> | string | null
    country?: StringNullableFilter<"Telemetry"> | string | null
    city?: StringNullableFilter<"Telemetry"> | string | null
  }, "id">

  export type TelemetryOrderByWithAggregationInput = {
    id?: SortOrder
    timeStamp?: SortOrder
    cpuUsageMs?: SortOrderInput | SortOrder
    ramUsageMB?: SortOrderInput | SortOrder
    networkEgressKB?: SortOrderInput | SortOrder
    ip?: SortOrderInput | SortOrder
    country?: SortOrderInput | SortOrder
    city?: SortOrderInput | SortOrder
    _count?: TelemetryCountOrderByAggregateInput
    _avg?: TelemetryAvgOrderByAggregateInput
    _max?: TelemetryMaxOrderByAggregateInput
    _min?: TelemetryMinOrderByAggregateInput
    _sum?: TelemetrySumOrderByAggregateInput
  }

  export type TelemetryScalarWhereWithAggregatesInput = {
    AND?: TelemetryScalarWhereWithAggregatesInput | TelemetryScalarWhereWithAggregatesInput[]
    OR?: TelemetryScalarWhereWithAggregatesInput[]
    NOT?: TelemetryScalarWhereWithAggregatesInput | TelemetryScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"Telemetry"> | number
    timeStamp?: DateTimeWithAggregatesFilter<"Telemetry"> | Date | string
    cpuUsageMs?: IntNullableWithAggregatesFilter<"Telemetry"> | number | null
    ramUsageMB?: IntNullableWithAggregatesFilter<"Telemetry"> | number | null
    networkEgressKB?: IntNullableWithAggregatesFilter<"Telemetry"> | number | null
    ip?: StringNullableWithAggregatesFilter<"Telemetry"> | string | null
    country?: StringNullableWithAggregatesFilter<"Telemetry"> | string | null
    city?: StringNullableWithAggregatesFilter<"Telemetry"> | string | null
  }

  export type PaymentWhereInput = {
    AND?: PaymentWhereInput | PaymentWhereInput[]
    OR?: PaymentWhereInput[]
    NOT?: PaymentWhereInput | PaymentWhereInput[]
    id?: IntFilter<"Payment"> | number
    amount?: FloatFilter<"Payment"> | number
    currency?: StringFilter<"Payment"> | string
    status?: StringFilter<"Payment"> | string
    reference?: StringNullableFilter<"Payment"> | string | null
    createdAt?: DateTimeFilter<"Payment"> | Date | string
    userId?: IntNullableFilter<"Payment"> | number | null
    user?: XOR<UserNullableScalarRelationFilter, UserWhereInput> | null
  }

  export type PaymentOrderByWithRelationInput = {
    id?: SortOrder
    amount?: SortOrder
    currency?: SortOrder
    status?: SortOrder
    reference?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    userId?: SortOrderInput | SortOrder
    user?: UserOrderByWithRelationInput
  }

  export type PaymentWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: PaymentWhereInput | PaymentWhereInput[]
    OR?: PaymentWhereInput[]
    NOT?: PaymentWhereInput | PaymentWhereInput[]
    amount?: FloatFilter<"Payment"> | number
    currency?: StringFilter<"Payment"> | string
    status?: StringFilter<"Payment"> | string
    reference?: StringNullableFilter<"Payment"> | string | null
    createdAt?: DateTimeFilter<"Payment"> | Date | string
    userId?: IntNullableFilter<"Payment"> | number | null
    user?: XOR<UserNullableScalarRelationFilter, UserWhereInput> | null
  }, "id">

  export type PaymentOrderByWithAggregationInput = {
    id?: SortOrder
    amount?: SortOrder
    currency?: SortOrder
    status?: SortOrder
    reference?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    userId?: SortOrderInput | SortOrder
    _count?: PaymentCountOrderByAggregateInput
    _avg?: PaymentAvgOrderByAggregateInput
    _max?: PaymentMaxOrderByAggregateInput
    _min?: PaymentMinOrderByAggregateInput
    _sum?: PaymentSumOrderByAggregateInput
  }

  export type PaymentScalarWhereWithAggregatesInput = {
    AND?: PaymentScalarWhereWithAggregatesInput | PaymentScalarWhereWithAggregatesInput[]
    OR?: PaymentScalarWhereWithAggregatesInput[]
    NOT?: PaymentScalarWhereWithAggregatesInput | PaymentScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"Payment"> | number
    amount?: FloatWithAggregatesFilter<"Payment"> | number
    currency?: StringWithAggregatesFilter<"Payment"> | string
    status?: StringWithAggregatesFilter<"Payment"> | string
    reference?: StringNullableWithAggregatesFilter<"Payment"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Payment"> | Date | string
    userId?: IntNullableWithAggregatesFilter<"Payment"> | number | null
  }

  export type UserCreateInput = {
    username: string
    password: string
    email: string
    role?: $Enums.Role
    token?: string | null
    active?: boolean
    AiTokensUse?: number
    AiTokensLimit?: number
    tokensPerResponse?: number
    whatsappNumbers?: WhatsAppNumberCreateNestedManyWithoutUserInput
    Payment?: PaymentCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateInput = {
    id?: number
    username: string
    password: string
    email: string
    role?: $Enums.Role
    token?: string | null
    active?: boolean
    AiTokensUse?: number
    AiTokensLimit?: number
    tokensPerResponse?: number
    whatsappNumbers?: WhatsAppNumberUncheckedCreateNestedManyWithoutUserInput
    Payment?: PaymentUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserUpdateInput = {
    username?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: EnumRoleFieldUpdateOperationsInput | $Enums.Role
    token?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    AiTokensUse?: IntFieldUpdateOperationsInput | number
    AiTokensLimit?: IntFieldUpdateOperationsInput | number
    tokensPerResponse?: IntFieldUpdateOperationsInput | number
    whatsappNumbers?: WhatsAppNumberUpdateManyWithoutUserNestedInput
    Payment?: PaymentUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    username?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: EnumRoleFieldUpdateOperationsInput | $Enums.Role
    token?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    AiTokensUse?: IntFieldUpdateOperationsInput | number
    AiTokensLimit?: IntFieldUpdateOperationsInput | number
    tokensPerResponse?: IntFieldUpdateOperationsInput | number
    whatsappNumbers?: WhatsAppNumberUncheckedUpdateManyWithoutUserNestedInput
    Payment?: PaymentUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateManyInput = {
    id?: number
    username: string
    password: string
    email: string
    role?: $Enums.Role
    token?: string | null
    active?: boolean
    AiTokensUse?: number
    AiTokensLimit?: number
    tokensPerResponse?: number
  }

  export type UserUpdateManyMutationInput = {
    username?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: EnumRoleFieldUpdateOperationsInput | $Enums.Role
    token?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    AiTokensUse?: IntFieldUpdateOperationsInput | number
    AiTokensLimit?: IntFieldUpdateOperationsInput | number
    tokensPerResponse?: IntFieldUpdateOperationsInput | number
  }

  export type UserUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    username?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: EnumRoleFieldUpdateOperationsInput | $Enums.Role
    token?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    AiTokensUse?: IntFieldUpdateOperationsInput | number
    AiTokensLimit?: IntFieldUpdateOperationsInput | number
    tokensPerResponse?: IntFieldUpdateOperationsInput | number
  }

  export type WhatsAppNumberCreateInput = {
    number: string
    name?: string
    aiEnabled?: boolean
    aiPrompt?: string
    aiModel?: string
    responseGroups?: boolean
    user: UserCreateNestedOneWithoutWhatsappNumbersInput
  }

  export type WhatsAppNumberUncheckedCreateInput = {
    id?: number
    number: string
    name?: string
    aiEnabled?: boolean
    aiPrompt?: string
    aiModel?: string
    responseGroups?: boolean
    userId: number
  }

  export type WhatsAppNumberUpdateInput = {
    number?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aiEnabled?: BoolFieldUpdateOperationsInput | boolean
    aiPrompt?: StringFieldUpdateOperationsInput | string
    aiModel?: StringFieldUpdateOperationsInput | string
    responseGroups?: BoolFieldUpdateOperationsInput | boolean
    user?: UserUpdateOneRequiredWithoutWhatsappNumbersNestedInput
  }

  export type WhatsAppNumberUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    number?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aiEnabled?: BoolFieldUpdateOperationsInput | boolean
    aiPrompt?: StringFieldUpdateOperationsInput | string
    aiModel?: StringFieldUpdateOperationsInput | string
    responseGroups?: BoolFieldUpdateOperationsInput | boolean
    userId?: IntFieldUpdateOperationsInput | number
  }

  export type WhatsAppNumberCreateManyInput = {
    id?: number
    number: string
    name?: string
    aiEnabled?: boolean
    aiPrompt?: string
    aiModel?: string
    responseGroups?: boolean
    userId: number
  }

  export type WhatsAppNumberUpdateManyMutationInput = {
    number?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aiEnabled?: BoolFieldUpdateOperationsInput | boolean
    aiPrompt?: StringFieldUpdateOperationsInput | string
    aiModel?: StringFieldUpdateOperationsInput | string
    responseGroups?: BoolFieldUpdateOperationsInput | boolean
  }

  export type WhatsAppNumberUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    number?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aiEnabled?: BoolFieldUpdateOperationsInput | boolean
    aiPrompt?: StringFieldUpdateOperationsInput | string
    aiModel?: StringFieldUpdateOperationsInput | string
    responseGroups?: BoolFieldUpdateOperationsInput | boolean
    userId?: IntFieldUpdateOperationsInput | number
  }

  export type TelemetryCreateInput = {
    timeStamp?: Date | string
    cpuUsageMs?: number | null
    ramUsageMB?: number | null
    networkEgressKB?: number | null
    ip?: string | null
    country?: string | null
    city?: string | null
  }

  export type TelemetryUncheckedCreateInput = {
    id?: number
    timeStamp?: Date | string
    cpuUsageMs?: number | null
    ramUsageMB?: number | null
    networkEgressKB?: number | null
    ip?: string | null
    country?: string | null
    city?: string | null
  }

  export type TelemetryUpdateInput = {
    timeStamp?: DateTimeFieldUpdateOperationsInput | Date | string
    cpuUsageMs?: NullableIntFieldUpdateOperationsInput | number | null
    ramUsageMB?: NullableIntFieldUpdateOperationsInput | number | null
    networkEgressKB?: NullableIntFieldUpdateOperationsInput | number | null
    ip?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TelemetryUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    timeStamp?: DateTimeFieldUpdateOperationsInput | Date | string
    cpuUsageMs?: NullableIntFieldUpdateOperationsInput | number | null
    ramUsageMB?: NullableIntFieldUpdateOperationsInput | number | null
    networkEgressKB?: NullableIntFieldUpdateOperationsInput | number | null
    ip?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TelemetryCreateManyInput = {
    id?: number
    timeStamp?: Date | string
    cpuUsageMs?: number | null
    ramUsageMB?: number | null
    networkEgressKB?: number | null
    ip?: string | null
    country?: string | null
    city?: string | null
  }

  export type TelemetryUpdateManyMutationInput = {
    timeStamp?: DateTimeFieldUpdateOperationsInput | Date | string
    cpuUsageMs?: NullableIntFieldUpdateOperationsInput | number | null
    ramUsageMB?: NullableIntFieldUpdateOperationsInput | number | null
    networkEgressKB?: NullableIntFieldUpdateOperationsInput | number | null
    ip?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TelemetryUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    timeStamp?: DateTimeFieldUpdateOperationsInput | Date | string
    cpuUsageMs?: NullableIntFieldUpdateOperationsInput | number | null
    ramUsageMB?: NullableIntFieldUpdateOperationsInput | number | null
    networkEgressKB?: NullableIntFieldUpdateOperationsInput | number | null
    ip?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type PaymentCreateInput = {
    amount: number
    currency?: string
    status?: string
    reference?: string | null
    createdAt?: Date | string
    user?: UserCreateNestedOneWithoutPaymentInput
  }

  export type PaymentUncheckedCreateInput = {
    id?: number
    amount: number
    currency?: string
    status?: string
    reference?: string | null
    createdAt?: Date | string
    userId?: number | null
  }

  export type PaymentUpdateInput = {
    amount?: FloatFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    reference?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneWithoutPaymentNestedInput
  }

  export type PaymentUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    amount?: FloatFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    reference?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    userId?: NullableIntFieldUpdateOperationsInput | number | null
  }

  export type PaymentCreateManyInput = {
    id?: number
    amount: number
    currency?: string
    status?: string
    reference?: string | null
    createdAt?: Date | string
    userId?: number | null
  }

  export type PaymentUpdateManyMutationInput = {
    amount?: FloatFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    reference?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PaymentUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    amount?: FloatFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    reference?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    userId?: NullableIntFieldUpdateOperationsInput | number | null
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type EnumRoleFilter<$PrismaModel = never> = {
    equals?: $Enums.Role | EnumRoleFieldRefInput<$PrismaModel>
    in?: $Enums.Role[] | ListEnumRoleFieldRefInput<$PrismaModel>
    notIn?: $Enums.Role[] | ListEnumRoleFieldRefInput<$PrismaModel>
    not?: NestedEnumRoleFilter<$PrismaModel> | $Enums.Role
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type WhatsAppNumberListRelationFilter = {
    every?: WhatsAppNumberWhereInput
    some?: WhatsAppNumberWhereInput
    none?: WhatsAppNumberWhereInput
  }

  export type PaymentListRelationFilter = {
    every?: PaymentWhereInput
    some?: PaymentWhereInput
    none?: PaymentWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type WhatsAppNumberOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type PaymentOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type UserCountOrderByAggregateInput = {
    id?: SortOrder
    username?: SortOrder
    password?: SortOrder
    email?: SortOrder
    role?: SortOrder
    token?: SortOrder
    active?: SortOrder
    AiTokensUse?: SortOrder
    AiTokensLimit?: SortOrder
    tokensPerResponse?: SortOrder
  }

  export type UserAvgOrderByAggregateInput = {
    id?: SortOrder
    AiTokensUse?: SortOrder
    AiTokensLimit?: SortOrder
    tokensPerResponse?: SortOrder
  }

  export type UserMaxOrderByAggregateInput = {
    id?: SortOrder
    username?: SortOrder
    password?: SortOrder
    email?: SortOrder
    role?: SortOrder
    token?: SortOrder
    active?: SortOrder
    AiTokensUse?: SortOrder
    AiTokensLimit?: SortOrder
    tokensPerResponse?: SortOrder
  }

  export type UserMinOrderByAggregateInput = {
    id?: SortOrder
    username?: SortOrder
    password?: SortOrder
    email?: SortOrder
    role?: SortOrder
    token?: SortOrder
    active?: SortOrder
    AiTokensUse?: SortOrder
    AiTokensLimit?: SortOrder
    tokensPerResponse?: SortOrder
  }

  export type UserSumOrderByAggregateInput = {
    id?: SortOrder
    AiTokensUse?: SortOrder
    AiTokensLimit?: SortOrder
    tokensPerResponse?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type EnumRoleWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.Role | EnumRoleFieldRefInput<$PrismaModel>
    in?: $Enums.Role[] | ListEnumRoleFieldRefInput<$PrismaModel>
    notIn?: $Enums.Role[] | ListEnumRoleFieldRefInput<$PrismaModel>
    not?: NestedEnumRoleWithAggregatesFilter<$PrismaModel> | $Enums.Role
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumRoleFilter<$PrismaModel>
    _max?: NestedEnumRoleFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type UserScalarRelationFilter = {
    is?: UserWhereInput
    isNot?: UserWhereInput
  }

  export type WhatsAppNumberCountOrderByAggregateInput = {
    id?: SortOrder
    number?: SortOrder
    name?: SortOrder
    aiEnabled?: SortOrder
    aiPrompt?: SortOrder
    aiModel?: SortOrder
    responseGroups?: SortOrder
    userId?: SortOrder
  }

  export type WhatsAppNumberAvgOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
  }

  export type WhatsAppNumberMaxOrderByAggregateInput = {
    id?: SortOrder
    number?: SortOrder
    name?: SortOrder
    aiEnabled?: SortOrder
    aiPrompt?: SortOrder
    aiModel?: SortOrder
    responseGroups?: SortOrder
    userId?: SortOrder
  }

  export type WhatsAppNumberMinOrderByAggregateInput = {
    id?: SortOrder
    number?: SortOrder
    name?: SortOrder
    aiEnabled?: SortOrder
    aiPrompt?: SortOrder
    aiModel?: SortOrder
    responseGroups?: SortOrder
    userId?: SortOrder
  }

  export type WhatsAppNumberSumOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type TelemetryCountOrderByAggregateInput = {
    id?: SortOrder
    timeStamp?: SortOrder
    cpuUsageMs?: SortOrder
    ramUsageMB?: SortOrder
    networkEgressKB?: SortOrder
    ip?: SortOrder
    country?: SortOrder
    city?: SortOrder
  }

  export type TelemetryAvgOrderByAggregateInput = {
    id?: SortOrder
    cpuUsageMs?: SortOrder
    ramUsageMB?: SortOrder
    networkEgressKB?: SortOrder
  }

  export type TelemetryMaxOrderByAggregateInput = {
    id?: SortOrder
    timeStamp?: SortOrder
    cpuUsageMs?: SortOrder
    ramUsageMB?: SortOrder
    networkEgressKB?: SortOrder
    ip?: SortOrder
    country?: SortOrder
    city?: SortOrder
  }

  export type TelemetryMinOrderByAggregateInput = {
    id?: SortOrder
    timeStamp?: SortOrder
    cpuUsageMs?: SortOrder
    ramUsageMB?: SortOrder
    networkEgressKB?: SortOrder
    ip?: SortOrder
    country?: SortOrder
    city?: SortOrder
  }

  export type TelemetrySumOrderByAggregateInput = {
    id?: SortOrder
    cpuUsageMs?: SortOrder
    ramUsageMB?: SortOrder
    networkEgressKB?: SortOrder
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type FloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type UserNullableScalarRelationFilter = {
    is?: UserWhereInput | null
    isNot?: UserWhereInput | null
  }

  export type PaymentCountOrderByAggregateInput = {
    id?: SortOrder
    amount?: SortOrder
    currency?: SortOrder
    status?: SortOrder
    reference?: SortOrder
    createdAt?: SortOrder
    userId?: SortOrder
  }

  export type PaymentAvgOrderByAggregateInput = {
    id?: SortOrder
    amount?: SortOrder
    userId?: SortOrder
  }

  export type PaymentMaxOrderByAggregateInput = {
    id?: SortOrder
    amount?: SortOrder
    currency?: SortOrder
    status?: SortOrder
    reference?: SortOrder
    createdAt?: SortOrder
    userId?: SortOrder
  }

  export type PaymentMinOrderByAggregateInput = {
    id?: SortOrder
    amount?: SortOrder
    currency?: SortOrder
    status?: SortOrder
    reference?: SortOrder
    createdAt?: SortOrder
    userId?: SortOrder
  }

  export type PaymentSumOrderByAggregateInput = {
    id?: SortOrder
    amount?: SortOrder
    userId?: SortOrder
  }

  export type FloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type WhatsAppNumberCreateNestedManyWithoutUserInput = {
    create?: XOR<WhatsAppNumberCreateWithoutUserInput, WhatsAppNumberUncheckedCreateWithoutUserInput> | WhatsAppNumberCreateWithoutUserInput[] | WhatsAppNumberUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WhatsAppNumberCreateOrConnectWithoutUserInput | WhatsAppNumberCreateOrConnectWithoutUserInput[]
    createMany?: WhatsAppNumberCreateManyUserInputEnvelope
    connect?: WhatsAppNumberWhereUniqueInput | WhatsAppNumberWhereUniqueInput[]
  }

  export type PaymentCreateNestedManyWithoutUserInput = {
    create?: XOR<PaymentCreateWithoutUserInput, PaymentUncheckedCreateWithoutUserInput> | PaymentCreateWithoutUserInput[] | PaymentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: PaymentCreateOrConnectWithoutUserInput | PaymentCreateOrConnectWithoutUserInput[]
    createMany?: PaymentCreateManyUserInputEnvelope
    connect?: PaymentWhereUniqueInput | PaymentWhereUniqueInput[]
  }

  export type WhatsAppNumberUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<WhatsAppNumberCreateWithoutUserInput, WhatsAppNumberUncheckedCreateWithoutUserInput> | WhatsAppNumberCreateWithoutUserInput[] | WhatsAppNumberUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WhatsAppNumberCreateOrConnectWithoutUserInput | WhatsAppNumberCreateOrConnectWithoutUserInput[]
    createMany?: WhatsAppNumberCreateManyUserInputEnvelope
    connect?: WhatsAppNumberWhereUniqueInput | WhatsAppNumberWhereUniqueInput[]
  }

  export type PaymentUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<PaymentCreateWithoutUserInput, PaymentUncheckedCreateWithoutUserInput> | PaymentCreateWithoutUserInput[] | PaymentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: PaymentCreateOrConnectWithoutUserInput | PaymentCreateOrConnectWithoutUserInput[]
    createMany?: PaymentCreateManyUserInputEnvelope
    connect?: PaymentWhereUniqueInput | PaymentWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type EnumRoleFieldUpdateOperationsInput = {
    set?: $Enums.Role
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type WhatsAppNumberUpdateManyWithoutUserNestedInput = {
    create?: XOR<WhatsAppNumberCreateWithoutUserInput, WhatsAppNumberUncheckedCreateWithoutUserInput> | WhatsAppNumberCreateWithoutUserInput[] | WhatsAppNumberUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WhatsAppNumberCreateOrConnectWithoutUserInput | WhatsAppNumberCreateOrConnectWithoutUserInput[]
    upsert?: WhatsAppNumberUpsertWithWhereUniqueWithoutUserInput | WhatsAppNumberUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: WhatsAppNumberCreateManyUserInputEnvelope
    set?: WhatsAppNumberWhereUniqueInput | WhatsAppNumberWhereUniqueInput[]
    disconnect?: WhatsAppNumberWhereUniqueInput | WhatsAppNumberWhereUniqueInput[]
    delete?: WhatsAppNumberWhereUniqueInput | WhatsAppNumberWhereUniqueInput[]
    connect?: WhatsAppNumberWhereUniqueInput | WhatsAppNumberWhereUniqueInput[]
    update?: WhatsAppNumberUpdateWithWhereUniqueWithoutUserInput | WhatsAppNumberUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: WhatsAppNumberUpdateManyWithWhereWithoutUserInput | WhatsAppNumberUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: WhatsAppNumberScalarWhereInput | WhatsAppNumberScalarWhereInput[]
  }

  export type PaymentUpdateManyWithoutUserNestedInput = {
    create?: XOR<PaymentCreateWithoutUserInput, PaymentUncheckedCreateWithoutUserInput> | PaymentCreateWithoutUserInput[] | PaymentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: PaymentCreateOrConnectWithoutUserInput | PaymentCreateOrConnectWithoutUserInput[]
    upsert?: PaymentUpsertWithWhereUniqueWithoutUserInput | PaymentUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: PaymentCreateManyUserInputEnvelope
    set?: PaymentWhereUniqueInput | PaymentWhereUniqueInput[]
    disconnect?: PaymentWhereUniqueInput | PaymentWhereUniqueInput[]
    delete?: PaymentWhereUniqueInput | PaymentWhereUniqueInput[]
    connect?: PaymentWhereUniqueInput | PaymentWhereUniqueInput[]
    update?: PaymentUpdateWithWhereUniqueWithoutUserInput | PaymentUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: PaymentUpdateManyWithWhereWithoutUserInput | PaymentUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: PaymentScalarWhereInput | PaymentScalarWhereInput[]
  }

  export type WhatsAppNumberUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<WhatsAppNumberCreateWithoutUserInput, WhatsAppNumberUncheckedCreateWithoutUserInput> | WhatsAppNumberCreateWithoutUserInput[] | WhatsAppNumberUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WhatsAppNumberCreateOrConnectWithoutUserInput | WhatsAppNumberCreateOrConnectWithoutUserInput[]
    upsert?: WhatsAppNumberUpsertWithWhereUniqueWithoutUserInput | WhatsAppNumberUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: WhatsAppNumberCreateManyUserInputEnvelope
    set?: WhatsAppNumberWhereUniqueInput | WhatsAppNumberWhereUniqueInput[]
    disconnect?: WhatsAppNumberWhereUniqueInput | WhatsAppNumberWhereUniqueInput[]
    delete?: WhatsAppNumberWhereUniqueInput | WhatsAppNumberWhereUniqueInput[]
    connect?: WhatsAppNumberWhereUniqueInput | WhatsAppNumberWhereUniqueInput[]
    update?: WhatsAppNumberUpdateWithWhereUniqueWithoutUserInput | WhatsAppNumberUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: WhatsAppNumberUpdateManyWithWhereWithoutUserInput | WhatsAppNumberUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: WhatsAppNumberScalarWhereInput | WhatsAppNumberScalarWhereInput[]
  }

  export type PaymentUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<PaymentCreateWithoutUserInput, PaymentUncheckedCreateWithoutUserInput> | PaymentCreateWithoutUserInput[] | PaymentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: PaymentCreateOrConnectWithoutUserInput | PaymentCreateOrConnectWithoutUserInput[]
    upsert?: PaymentUpsertWithWhereUniqueWithoutUserInput | PaymentUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: PaymentCreateManyUserInputEnvelope
    set?: PaymentWhereUniqueInput | PaymentWhereUniqueInput[]
    disconnect?: PaymentWhereUniqueInput | PaymentWhereUniqueInput[]
    delete?: PaymentWhereUniqueInput | PaymentWhereUniqueInput[]
    connect?: PaymentWhereUniqueInput | PaymentWhereUniqueInput[]
    update?: PaymentUpdateWithWhereUniqueWithoutUserInput | PaymentUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: PaymentUpdateManyWithWhereWithoutUserInput | PaymentUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: PaymentScalarWhereInput | PaymentScalarWhereInput[]
  }

  export type UserCreateNestedOneWithoutWhatsappNumbersInput = {
    create?: XOR<UserCreateWithoutWhatsappNumbersInput, UserUncheckedCreateWithoutWhatsappNumbersInput>
    connectOrCreate?: UserCreateOrConnectWithoutWhatsappNumbersInput
    connect?: UserWhereUniqueInput
  }

  export type UserUpdateOneRequiredWithoutWhatsappNumbersNestedInput = {
    create?: XOR<UserCreateWithoutWhatsappNumbersInput, UserUncheckedCreateWithoutWhatsappNumbersInput>
    connectOrCreate?: UserCreateOrConnectWithoutWhatsappNumbersInput
    upsert?: UserUpsertWithoutWhatsappNumbersInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutWhatsappNumbersInput, UserUpdateWithoutWhatsappNumbersInput>, UserUncheckedUpdateWithoutWhatsappNumbersInput>
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type UserCreateNestedOneWithoutPaymentInput = {
    create?: XOR<UserCreateWithoutPaymentInput, UserUncheckedCreateWithoutPaymentInput>
    connectOrCreate?: UserCreateOrConnectWithoutPaymentInput
    connect?: UserWhereUniqueInput
  }

  export type FloatFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type UserUpdateOneWithoutPaymentNestedInput = {
    create?: XOR<UserCreateWithoutPaymentInput, UserUncheckedCreateWithoutPaymentInput>
    connectOrCreate?: UserCreateOrConnectWithoutPaymentInput
    upsert?: UserUpsertWithoutPaymentInput
    disconnect?: UserWhereInput | boolean
    delete?: UserWhereInput | boolean
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutPaymentInput, UserUpdateWithoutPaymentInput>, UserUncheckedUpdateWithoutPaymentInput>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedEnumRoleFilter<$PrismaModel = never> = {
    equals?: $Enums.Role | EnumRoleFieldRefInput<$PrismaModel>
    in?: $Enums.Role[] | ListEnumRoleFieldRefInput<$PrismaModel>
    notIn?: $Enums.Role[] | ListEnumRoleFieldRefInput<$PrismaModel>
    not?: NestedEnumRoleFilter<$PrismaModel> | $Enums.Role
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedEnumRoleWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.Role | EnumRoleFieldRefInput<$PrismaModel>
    in?: $Enums.Role[] | ListEnumRoleFieldRefInput<$PrismaModel>
    notIn?: $Enums.Role[] | ListEnumRoleFieldRefInput<$PrismaModel>
    not?: NestedEnumRoleWithAggregatesFilter<$PrismaModel> | $Enums.Role
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumRoleFilter<$PrismaModel>
    _max?: NestedEnumRoleFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedFloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type WhatsAppNumberCreateWithoutUserInput = {
    number: string
    name?: string
    aiEnabled?: boolean
    aiPrompt?: string
    aiModel?: string
    responseGroups?: boolean
  }

  export type WhatsAppNumberUncheckedCreateWithoutUserInput = {
    id?: number
    number: string
    name?: string
    aiEnabled?: boolean
    aiPrompt?: string
    aiModel?: string
    responseGroups?: boolean
  }

  export type WhatsAppNumberCreateOrConnectWithoutUserInput = {
    where: WhatsAppNumberWhereUniqueInput
    create: XOR<WhatsAppNumberCreateWithoutUserInput, WhatsAppNumberUncheckedCreateWithoutUserInput>
  }

  export type WhatsAppNumberCreateManyUserInputEnvelope = {
    data: WhatsAppNumberCreateManyUserInput | WhatsAppNumberCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type PaymentCreateWithoutUserInput = {
    amount: number
    currency?: string
    status?: string
    reference?: string | null
    createdAt?: Date | string
  }

  export type PaymentUncheckedCreateWithoutUserInput = {
    id?: number
    amount: number
    currency?: string
    status?: string
    reference?: string | null
    createdAt?: Date | string
  }

  export type PaymentCreateOrConnectWithoutUserInput = {
    where: PaymentWhereUniqueInput
    create: XOR<PaymentCreateWithoutUserInput, PaymentUncheckedCreateWithoutUserInput>
  }

  export type PaymentCreateManyUserInputEnvelope = {
    data: PaymentCreateManyUserInput | PaymentCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type WhatsAppNumberUpsertWithWhereUniqueWithoutUserInput = {
    where: WhatsAppNumberWhereUniqueInput
    update: XOR<WhatsAppNumberUpdateWithoutUserInput, WhatsAppNumberUncheckedUpdateWithoutUserInput>
    create: XOR<WhatsAppNumberCreateWithoutUserInput, WhatsAppNumberUncheckedCreateWithoutUserInput>
  }

  export type WhatsAppNumberUpdateWithWhereUniqueWithoutUserInput = {
    where: WhatsAppNumberWhereUniqueInput
    data: XOR<WhatsAppNumberUpdateWithoutUserInput, WhatsAppNumberUncheckedUpdateWithoutUserInput>
  }

  export type WhatsAppNumberUpdateManyWithWhereWithoutUserInput = {
    where: WhatsAppNumberScalarWhereInput
    data: XOR<WhatsAppNumberUpdateManyMutationInput, WhatsAppNumberUncheckedUpdateManyWithoutUserInput>
  }

  export type WhatsAppNumberScalarWhereInput = {
    AND?: WhatsAppNumberScalarWhereInput | WhatsAppNumberScalarWhereInput[]
    OR?: WhatsAppNumberScalarWhereInput[]
    NOT?: WhatsAppNumberScalarWhereInput | WhatsAppNumberScalarWhereInput[]
    id?: IntFilter<"WhatsAppNumber"> | number
    number?: StringFilter<"WhatsAppNumber"> | string
    name?: StringFilter<"WhatsAppNumber"> | string
    aiEnabled?: BoolFilter<"WhatsAppNumber"> | boolean
    aiPrompt?: StringFilter<"WhatsAppNumber"> | string
    aiModel?: StringFilter<"WhatsAppNumber"> | string
    responseGroups?: BoolFilter<"WhatsAppNumber"> | boolean
    userId?: IntFilter<"WhatsAppNumber"> | number
  }

  export type PaymentUpsertWithWhereUniqueWithoutUserInput = {
    where: PaymentWhereUniqueInput
    update: XOR<PaymentUpdateWithoutUserInput, PaymentUncheckedUpdateWithoutUserInput>
    create: XOR<PaymentCreateWithoutUserInput, PaymentUncheckedCreateWithoutUserInput>
  }

  export type PaymentUpdateWithWhereUniqueWithoutUserInput = {
    where: PaymentWhereUniqueInput
    data: XOR<PaymentUpdateWithoutUserInput, PaymentUncheckedUpdateWithoutUserInput>
  }

  export type PaymentUpdateManyWithWhereWithoutUserInput = {
    where: PaymentScalarWhereInput
    data: XOR<PaymentUpdateManyMutationInput, PaymentUncheckedUpdateManyWithoutUserInput>
  }

  export type PaymentScalarWhereInput = {
    AND?: PaymentScalarWhereInput | PaymentScalarWhereInput[]
    OR?: PaymentScalarWhereInput[]
    NOT?: PaymentScalarWhereInput | PaymentScalarWhereInput[]
    id?: IntFilter<"Payment"> | number
    amount?: FloatFilter<"Payment"> | number
    currency?: StringFilter<"Payment"> | string
    status?: StringFilter<"Payment"> | string
    reference?: StringNullableFilter<"Payment"> | string | null
    createdAt?: DateTimeFilter<"Payment"> | Date | string
    userId?: IntNullableFilter<"Payment"> | number | null
  }

  export type UserCreateWithoutWhatsappNumbersInput = {
    username: string
    password: string
    email: string
    role?: $Enums.Role
    token?: string | null
    active?: boolean
    AiTokensUse?: number
    AiTokensLimit?: number
    tokensPerResponse?: number
    Payment?: PaymentCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutWhatsappNumbersInput = {
    id?: number
    username: string
    password: string
    email: string
    role?: $Enums.Role
    token?: string | null
    active?: boolean
    AiTokensUse?: number
    AiTokensLimit?: number
    tokensPerResponse?: number
    Payment?: PaymentUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutWhatsappNumbersInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutWhatsappNumbersInput, UserUncheckedCreateWithoutWhatsappNumbersInput>
  }

  export type UserUpsertWithoutWhatsappNumbersInput = {
    update: XOR<UserUpdateWithoutWhatsappNumbersInput, UserUncheckedUpdateWithoutWhatsappNumbersInput>
    create: XOR<UserCreateWithoutWhatsappNumbersInput, UserUncheckedCreateWithoutWhatsappNumbersInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutWhatsappNumbersInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutWhatsappNumbersInput, UserUncheckedUpdateWithoutWhatsappNumbersInput>
  }

  export type UserUpdateWithoutWhatsappNumbersInput = {
    username?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: EnumRoleFieldUpdateOperationsInput | $Enums.Role
    token?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    AiTokensUse?: IntFieldUpdateOperationsInput | number
    AiTokensLimit?: IntFieldUpdateOperationsInput | number
    tokensPerResponse?: IntFieldUpdateOperationsInput | number
    Payment?: PaymentUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutWhatsappNumbersInput = {
    id?: IntFieldUpdateOperationsInput | number
    username?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: EnumRoleFieldUpdateOperationsInput | $Enums.Role
    token?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    AiTokensUse?: IntFieldUpdateOperationsInput | number
    AiTokensLimit?: IntFieldUpdateOperationsInput | number
    tokensPerResponse?: IntFieldUpdateOperationsInput | number
    Payment?: PaymentUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateWithoutPaymentInput = {
    username: string
    password: string
    email: string
    role?: $Enums.Role
    token?: string | null
    active?: boolean
    AiTokensUse?: number
    AiTokensLimit?: number
    tokensPerResponse?: number
    whatsappNumbers?: WhatsAppNumberCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutPaymentInput = {
    id?: number
    username: string
    password: string
    email: string
    role?: $Enums.Role
    token?: string | null
    active?: boolean
    AiTokensUse?: number
    AiTokensLimit?: number
    tokensPerResponse?: number
    whatsappNumbers?: WhatsAppNumberUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutPaymentInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutPaymentInput, UserUncheckedCreateWithoutPaymentInput>
  }

  export type UserUpsertWithoutPaymentInput = {
    update: XOR<UserUpdateWithoutPaymentInput, UserUncheckedUpdateWithoutPaymentInput>
    create: XOR<UserCreateWithoutPaymentInput, UserUncheckedCreateWithoutPaymentInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutPaymentInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutPaymentInput, UserUncheckedUpdateWithoutPaymentInput>
  }

  export type UserUpdateWithoutPaymentInput = {
    username?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: EnumRoleFieldUpdateOperationsInput | $Enums.Role
    token?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    AiTokensUse?: IntFieldUpdateOperationsInput | number
    AiTokensLimit?: IntFieldUpdateOperationsInput | number
    tokensPerResponse?: IntFieldUpdateOperationsInput | number
    whatsappNumbers?: WhatsAppNumberUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutPaymentInput = {
    id?: IntFieldUpdateOperationsInput | number
    username?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: EnumRoleFieldUpdateOperationsInput | $Enums.Role
    token?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    AiTokensUse?: IntFieldUpdateOperationsInput | number
    AiTokensLimit?: IntFieldUpdateOperationsInput | number
    tokensPerResponse?: IntFieldUpdateOperationsInput | number
    whatsappNumbers?: WhatsAppNumberUncheckedUpdateManyWithoutUserNestedInput
  }

  export type WhatsAppNumberCreateManyUserInput = {
    id?: number
    number: string
    name?: string
    aiEnabled?: boolean
    aiPrompt?: string
    aiModel?: string
    responseGroups?: boolean
  }

  export type PaymentCreateManyUserInput = {
    id?: number
    amount: number
    currency?: string
    status?: string
    reference?: string | null
    createdAt?: Date | string
  }

  export type WhatsAppNumberUpdateWithoutUserInput = {
    number?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aiEnabled?: BoolFieldUpdateOperationsInput | boolean
    aiPrompt?: StringFieldUpdateOperationsInput | string
    aiModel?: StringFieldUpdateOperationsInput | string
    responseGroups?: BoolFieldUpdateOperationsInput | boolean
  }

  export type WhatsAppNumberUncheckedUpdateWithoutUserInput = {
    id?: IntFieldUpdateOperationsInput | number
    number?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aiEnabled?: BoolFieldUpdateOperationsInput | boolean
    aiPrompt?: StringFieldUpdateOperationsInput | string
    aiModel?: StringFieldUpdateOperationsInput | string
    responseGroups?: BoolFieldUpdateOperationsInput | boolean
  }

  export type WhatsAppNumberUncheckedUpdateManyWithoutUserInput = {
    id?: IntFieldUpdateOperationsInput | number
    number?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    aiEnabled?: BoolFieldUpdateOperationsInput | boolean
    aiPrompt?: StringFieldUpdateOperationsInput | string
    aiModel?: StringFieldUpdateOperationsInput | string
    responseGroups?: BoolFieldUpdateOperationsInput | boolean
  }

  export type PaymentUpdateWithoutUserInput = {
    amount?: FloatFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    reference?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PaymentUncheckedUpdateWithoutUserInput = {
    id?: IntFieldUpdateOperationsInput | number
    amount?: FloatFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    reference?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PaymentUncheckedUpdateManyWithoutUserInput = {
    id?: IntFieldUpdateOperationsInput | number
    amount?: FloatFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    reference?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}