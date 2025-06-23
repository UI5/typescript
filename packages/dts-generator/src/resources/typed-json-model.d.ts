declare module "sap/ui/model/json/TypedJSONModel" {
  import JSONModel from "sap/ui/model/json/JSONModel";
  import TypedJSONContext from "sap/ui/model/json/TypedJSONContext";

  /**
   * TypedJSONModel is a subclass of JSONModel that provides type-safe access to the model data. It is only available when using UI5 with TypeScript.
   *
   * @since 1.138.0
   */
  export default class TypedJSONModel<Data extends object> extends JSONModel {
    constructor(oData?: Data, bObserve?: boolean);

    getData(): Data;

    getProperty<Path extends AbsoluteBindingPath<Data>>(
      sPath: Path,
    ): PropertyByAbsoluteBindingPath<Data, Path>;
    getProperty<
      Path extends RelativeBindingPath<Data, Root>,
      Root extends AbsoluteBindingPath<Data>,
    >(
      sPath: Path,
      oContext: TypedJSONContext<Data, Root>,
    ): PropertyByRelativeBindingPath<Data, Root, Path>;
    getProperty<
      Path extends AbsoluteBindingPath<Data> | RelativeBindingPath<Data, Root>,
      Root extends AbsoluteBindingPath<Data>,
    >(
      sPath: Path,
      oContext?: TypedJSONContext<Data, Root>,
    ):
      | PropertyByAbsoluteBindingPath<Data, Path>
      | PropertyByRelativeBindingPath<Data, Root, Path>;

    setData(data: Data): void;

    setProperty<Path extends AbsoluteBindingPath<Data>>(
      sPath: Path,
      oValue: PropertyByAbsoluteBindingPath<Data, Path>,
      oContext?: undefined,
      bAsyncUpdate?: boolean,
    ): boolean;
    setProperty<
      Path extends RelativeBindingPath<Data, Root>,
      Root extends AbsoluteBindingPath<Data>,
    >(
      sPath: Path extends RelativeBindingPath<Data, Root> ? Path : never,
      oValue: PropertyByRelativeBindingPath<Data, Root, Path>,
      oContext: TypedJSONContext<Data, Root>,
      bAsyncUpdate?: boolean,
    ): boolean;
    setProperty<
      Path extends AbsoluteBindingPath<Data> | RelativeBindingPath<Data, Root>,
      Root extends AbsoluteBindingPath<Data>,
    >(
      sPath: Path,
      oValue: Path extends AbsoluteBindingPath<Data>
        ? PropertyByAbsoluteBindingPath<Data, Path>
        : PropertyByRelativeBindingPath<Data, Root, Path>,
      oContext?: TypedJSONContext<Data, Root>,
      bAsyncUpdate?: boolean,
    ): boolean;
  }

  /**
   * Valid absolute binding in a JSONModel with the underlying type `Type`.
   * Counterpart to {@link PropertyByAbsoluteBindingPath}
   * @example
   * type Person = { name: string, id: number };
   * type PersonNamePath = PathInJSONModel<Person>; // "/name" | "/id"
   * let path: PersonNamePath = "/name"; // ok
   * path = "/firstName"; // error
   */
  export type AbsoluteBindingPath<Type> =
    Type extends Array<unknown>
      ? // if Type is an array:
        | `/${number}` // /0 -> first element of array
          | `/${number}${AbsoluteBindingPath<Type[number]>}` // /0/{NestedPath}
      : // if Type is not an array:
        Type extends object
        ?
            | {
                [Key in keyof Type]: Type[Key] extends Array<unknown>
                  ? // Type[Key] is an array:
                    | `/${string & Key}/${number}` // items/0 -> elem of array
                      // path can end there or:
                      | `/${string & Key}/${number}${AbsoluteBindingPath<Type[Key][number]>}` // items/0/{NestedPath}
                  : // Type[Key] is NOT an array:
                    `/${string & Key}${AbsoluteBindingPath<Type[Key]>}`;
              }[keyof Type]
            | `/${string & PropertiesOf<Type>}` // /items/0/id -> last part of path
        : // if T is not of type object:
          never;

  /**
   * Valid relative binding path in a JSONModel.
   * The root of the path is defined by the given root string.
   *
   * @example
   * type PersonWrapper = { person: { name: string, id: number } };
   * type PersonNamePath = RelativeBindingPath<PersonWrapper, "/person">; // "name" | "id"
   */
  export type RelativeBindingPath<
    Type,
    Root extends AbsoluteBindingPath<Type>,
  > =
    AbsoluteBindingPath<TypeAtPath<Type, Root>> extends `/${infer Rest}`
      ? Rest
      : never;

  /**
   * The type of a property in a JSONModel identified by the given path.
   * Counterpart to {@link AbsoluteBindingPath}.
   * @example
   * type Person = { name: string, id: number };
   * type PersonName = PropertyInJSONModel<Person, "/name">; // string
   * const name: PersonName = "John"; // ok
   */
  export type PropertyByAbsoluteBindingPath<
    Type,
    Path extends string,
  > = Path extends `/${number}`
    ? Type extends Array<infer U>
      ? U
      : never
    : Path extends `/${number}${infer Rest}`
      ? Type extends Array<infer U>
        ? PropertyByAbsoluteBindingPath<U, Rest>
        : never
      : Path extends `/${infer Key}/${number}/${infer Rest}`
        ? Key extends keyof Type
          ? FromArrayWithSubPath<Type, Key, Rest>
          : never
        : Path extends `/${infer Key}/${number}`
          ? Key extends keyof Type
            ? FromArrayElement<Type, Key>
            : never
          : Path extends `/${infer Key}/${infer Rest}`
            ? Key extends keyof Type
              ? FromNestedProperty<Type, Key, Rest>
              : never
            : Path extends `/${infer Key}`
              ? Key extends keyof Type
                ? FromTopLevelProperty<Type, Key>
                : never
              : never;

  /**
   * The type of a property in a JSONModel identified by the given relative path and root.
   * Counterpart to {@link RelativeBindingPath}.
   * @example
   * type PersonWrapper = { person: { name: string, id: number } };
   * type PersonName = PropertyByRelativeBindingPath<PersonWrapper, "/person", "name">;
   * const name: PersonName = "John"; // ok
   */
  export type PropertyByRelativeBindingPath<
    Type,
    Root extends string,
    RelativePath extends string,
  > = PropertyByAbsoluteBindingPath<Type, `${Root}/${RelativePath}`>;

  /***********************************************************************************************************************
   * Helper types to split the types above into separate parts
   * to make it easier to read and understand.
  /**********************************************************************************************************************/

  /**
   * Helper type to handle paths that point to an array with a subpath.
   * @example const path = "/orders/0/items"
   */
  type FromArrayWithSubPath<Type, Key extends keyof Type, Rest extends string> =
    Type[Key] extends Array<infer U>
      ? PropertyByAbsoluteBindingPath<U, `/${Rest}`>
      : never;

  /**
   * Helper type to handle paths that point to an array element.
   * @example const path = "/orders/0"
   */
  type FromArrayElement<Type, Key extends keyof Type> =
    Type[Key] extends Array<infer U> ? U : never;

  /**
   * Helper type to handle paths that point to a nested property.
   * @example const path = "/customer/address/street"
   */
  type FromNestedProperty<
    Type,
    Key extends keyof Type,
    Rest extends string,
  > = PropertyByAbsoluteBindingPath<Type[Key], `/${Rest}`>;

  /**
   * Helper type to handle paths that point to a top-level property.
   * @example const path = "/customer"
   */
  type FromTopLevelProperty<Type, Key extends keyof Type> = Type[Key];

  /**
   * Helper type to navigate along a nested path.
   * Navigates from the root type along the path to determine the sub-type.
   */
  type TypeAtPath<
    Type,
    Path extends string,
  > = Path extends `/${infer Key}/${infer Rest}`
    ? Key extends keyof Type
      ? TypeAtPath<Type[Key], `/${Rest}`>
      : never
    : Path extends `/${infer Key}`
      ? Key extends keyof Type
        ? Type[Key]
        : never
      : never;

  /**
   * Helper type to extract the names of the properties of a given type.
   * Excludes properties that are of the type `Function` or `symbol`.
   * @example
   * type Person = { name: string, id: number };
   * type PersonProperties = PropertiesOf<Person>; // "name" | "id"
   * let property: PersonProperties = "name"; // ok
   * property = "firstName"; // error
   */
  type PropertiesOf<Type> = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    [Key in keyof Type]: Type[Key] extends Function
      ? never
      : Type[Key] extends symbol
        ? never
        : Key;
  }[keyof Type];

  export {}; // this prevents the non-exported types like PropertiesOf from being visible for applications
}

declare module "sap/ui/model/json/TypedJSONContext" {
  import Context from "sap/ui/model/Context";
  import TypedJSONModel from "sap/ui/model/json/TypedJSONModel";
  import {
    AbsoluteBindingPath,
    RelativeBindingPath,
    PropertyByRelativeBindingPath,
  } from "sap/ui/model/json/TypedJSONModel";

  /**
   * TypedJSONContext is a subclass of Context that provides type-safe access to the model data. It is only available when using UI5 with TypeScript.
   *
   * @since 1.138.0
   */
  export default class TypedJSONContext<
    Data extends object,
    Root extends AbsoluteBindingPath<Data>,
  > extends Context {
    constructor(oModel: TypedJSONModel<Data>, sPath: Root);

    getModel(): TypedJSONModel<Data>;

    getProperty<P extends RelativeBindingPath<Data, Root>>(
      sPath: P extends RelativeBindingPath<Data, Root> ? P : never,
    ): PropertyByRelativeBindingPath<Data, Root, P>;
  }
}
