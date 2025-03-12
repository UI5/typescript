// Types describing a UI5 api.json file
// NOTE: this file has been mostly generated and is not perfect

import type { FunctionType, TypeReference } from "./ast.d.ts";

/**
 * The structure of a UI5 library's api.json file content.
 * @public
 */
export type ApiJSON = {
  library: string;
  version: string;
  symbols: ConcreteSymbol[];
};

export type ReturnValue = {
  type?: TypeReference; // a string in the original api.json files, but parsed into an object in one of the prepare steps before json-to-ast sees it
  description?: string;
};

export type ResolvedType = TypeReference | FunctionType;

export type ObjectSymbol = SymbolBase & {
  kind: "object";
};

//
// Everything below taken from https://raw.githubusercontent.com/petermuessig/ui5-language-assistant/97295afa61808b785ab98ca03683e52231fb1d06/packages/semantic-model/src/api-json.d.ts
//

export type LibraryVersion = string;
export type ConcreteSymbol =
  | TypedefSymbol
  | NamespaceSymbol
  | DatatypeSymbol
  | InterfaceSymbol
  | EnumSymbol
  | ClassSymbol
  | FunctionSymbol
  | ObjectSymbol; // modification
export type TypedefSymbol = SymbolBase & {
  // modification: the entire TypedefSymbol has been changed and simplified
  kind?: "typedef";
  extends?: string; // NOTE: never seems to happen
  "ui5-metamodel"?: boolean; // present only in 0.1% of cases
  type?: TypeReference; // a string in the original api.json files, but parsed into an object in one of the prepare steps before json-to-ast sees it
  [k: string]: any;
} & (
    | {
        properties?: Ui5Property[];
      }
    | {
        returnValue: ReturnValue;
        parameters: ObjCallableParameter[];
      }
  );
/**
 * ( package '/' )* name
 */
export type ModuleName = string;
/**
 * Version with which the documented entity has been introduced the first time, no matter in what state it has been introduced
 */
export type Since = LibraryVersion | "undefined";
/**
 * references to internal or external sources of information that are related to the documented entity. References can be URLs, absolute or relative JSDoc symbol names. Relative JSDoc symbols usually are meant to be relative to the documented entity
 */
export type References = string[];
export type Examples = {
  caption?: string;
  text?: string;
}[];
export type Ui5SettingName = string;
// begin modification - defined a single ObjCallableParameter instead of only the array
export type ObjCallableParameter = {
  name: string;
  type: ResolvedType; // a string in the original api.json files, but parsed into an object in one of the prepare steps before json-to-ast sees it
  //type: string;
  optional?: boolean;
  omissible?: boolean;
  defaultValue?: any;
  parameterProperties?: NestedProperties;
  description?: string;
  since?: Since;
  experimental?: Experimental;
  deprecated?: Deprecated;
  repeatable?: boolean;
};
export type ObjCallableParameters = ObjCallableParameter[];
// end modification
/**
 * With this element, a callable (constructor, method) can document the exceptions that may occur during its execution
 */
export type Exceptions = {
  type: string;
  description?: string;
  [k: string]: any;
}[];
/**
 * Namespaces can have the common symbol properties and extend another symbol
 */
export type NamespaceSymbol = SymbolBase & {
  kind?: "namespace" | "member";
  extends?: string;
  implements?: string[];
  properties?: ObjProperty[];
  methods?: ObjMethod[];
  events?: ObjEvent[];
  abstract?: boolean;
  final?: boolean;
  "ui5-metamodel"?: boolean;
  "ui5-metadata"?: Ui5Metadata;
  [k: string]: any;
};
/**
 * Namespaces can have the common symbol properties and extend another symbol
 */
export type DatatypeSymbol = SymbolBase & {
  kind?: "namespace";
  final?: boolean;
  "ui5-metamodel"?: boolean;
  "ui5-metadata": {
    stereotype?: "datatype";
    basetype?: "string" | "int" | "any" | "float[]";
    pattern?: string;
    range?: {
      minExclusive?: number;
      maxInclusive?: number;
      minInclusive?: number;
      maxExclusive?: number;
    };
  };
  examples?: Examples;
  [k: string]: any;
};
/**
 * Interfaces can have the common symbol properties and extend another symbol
 */
export type InterfaceSymbol = SymbolBase & {
  kind?: "interface";
  extends?: string;
  "ui5-metamodel"?: boolean;
  methods?: (ObjMethod & {
    optional?: boolean;
    [k: string]: any;
  })[];
  events?: ObjEvent[];
  [k: string]: any; // TODO: this hides issues with access to non-existing properties
};
/**
 * An enum has the standard symbol properties and may contain a set of properties
 */
export type EnumSymbol = SymbolBase & {
  kind?: "enum";
  "ui5-metamodel"?: boolean;
  properties?: EnumProperty[];
  "ui5-metadata"?: {
    stereotype?: "enum";
  };
  deprecatedAliasFor?: string;
  [k: string]: any;
};
/**
 * A class is the basic building block of our user interfaces; it is a reusable entity with properties, events, methods, and relations. The most important relations are aggregations to other elements, and in this way a tree structure of elements can be created. Note that the term 'control' is used both for the individual instance (object) and for the type (class) of all such instances; sometimes the distinction will be made explicit, sometimes it becomes clear from the context.
 */
export type ClassSymbol = SymbolBase & {
  kind?: "class";
  /**
   * any other class, control or element type, incl. the predefined types sap.ui.core/Element and sap.ui.core/Control
   */
  extends?: string;
  /**
   * interfaces that this class implements
   */
  implements?: string[];
  abstract?: boolean;
  final?: boolean;
  "ui5-metadata"?: Ui5Metadata;
  "ui5-metamodel"?: boolean;
  constructor?: ObjConstructor;
  /**
   * Whether the constructor shall be hidden/private, so it cannot be called
   */
  hideconstructor?: boolean;
  properties?: ObjProperty[];
  events?: Ui5Event[];
  methods?: (ObjMethod & {
    [k: string]: any;
  })[];
  [k: string]: any;
};
/**
 * A function can be a top-level symbol when exported from a module
 */
export type FunctionSymbol = SymbolBase &
  ObjMethod & {
    kind?: "function";
    [k: string]: any;
  };

/**
 * Schema that describes the structure of the api.json files that the 'sapui5-jsdoc3' template can generate for each UI5 library
 */
export interface SchemaForApiJsonFiles {
  /**
   * A reference to this schema to make the structure of the file obvious.
   */
  "$schema-ref": "http://schemas.sap.com/sapui5/designtime/api.json/1.0";
  library?: string;
  version?: LibraryVersion;
  symbols?: ConcreteSymbol[];
}
export interface SymbolBase {
  kind?:
    | "namespace"
    | "member"
    | "class"
    | "interface"
    | "enum"
    | "typedef"
    | "function"
    | "object"; // modification
  name: string;
  basename: string;
  resource?: string;
  module?: ModuleName;
  export?: string;
  static?: boolean;
  visibility?: "public" | "protected" | "private" | "restricted";
  description?: string;
  since?: Since;
  experimental?: Experimental;
  deprecated?: Deprecated;
  references?: References;
  allowedFor?: string[];
  [k: string]: any; // TODO: this hides issues with access to non-existing properties
}
/**
 * Describes whether the documented entity is still experimental and should not be used in productive apps. The since attribute describes since when the library is in that state, it must be equal or higher than the since version of the entity, but not higher than the current version of the whole delivery unit.
 */
export interface Experimental {
  since?: LibraryVersion;
  text?: string;
  [k: string]: any;
}
/**
 * If the entity has been deprecated, this element should contain information about when and why this happened and should describe any potential alternatives
 */
export interface Deprecated {
  since?: LibraryVersion;
  text?: string;
  [k: string]: any;
}
export interface ObjProperty {
  name: string;
  module?: ModuleName;
  export?: string;
  resource?: string;
  visibility?: "public" | "protected" | "private" | "restricted";
  readonly?: boolean;
  static?: boolean;
  type: string;
  description?: string;
  since?: Since;
  experimental?: Experimental;
  deprecated?: Deprecated;
  examples?: Examples;
  references?: References;
  optional?: boolean;
  allowedFor?: string[];
  properties?: {
    [k: string]: any;
  };
}
export interface Ui5Property {
  name: Ui5SettingName;
  type?: TypeReference; // a string in the original api.json files, but parsed into an object in one of the prepare steps before json-to-ast sees it
  defaultValue?: any;
  group?: string;
  visibility?: "public" | "hidden" | "restricted";
  description?: string;
  since?: Since;
  bindable?: boolean;
  experimental?: Experimental;
  deprecated?: Deprecated;
  methods?: string[];
  optional?: boolean;
  static?: boolean;
  allowedFor?: string[];
}
export interface NestedProperties {
  [k: string]: {
    name: string;
    type: TypeReference; // a string in the original api.json files, but parsed into an object in one of the prepare steps before json-to-ast sees it
    parameterProperties?: NestedProperties;
    description?: string;
    optional?: boolean;
    defaultValue?: any;
    since?: Since;
    experimental?: Experimental;
    deprecated?: Deprecated;
  };
}
export interface ObjMethod {
  name: string;
  module?: ModuleName;
  export?: string;
  resource?: string;
  visibility?: "public" | "protected" | "private" | "restricted";
  static?: boolean;
  parameters?: ObjCallableParameters;
  returnValue?: ReturnValue;
  throws?: Exceptions;
  description?: string;
  since?: Since;
  experimental?: Experimental;
  deprecated?: Deprecated;
  examples?: Examples;
  references?: References;
  "ui5-metamodel"?: boolean;
  allowedFor?: string[];
  [k: string]: any;
}
export interface ObjEvent {
  name: string;
  module?: ModuleName;
  resource?: string;
  visibility?: "public" | "protected" | "private" | "restricted";
  static?: boolean;
  parameters?: {
    name: string;
    type: TypeReference; // a string in the original api.json files, but parsed into an object in one of the prepare steps before json-to-ast sees it
    parameterProperties?: NestedProperties;
    description?: string;
    since?: Since;
    experimental?: Experimental;
    deprecated?: Deprecated;
  }[];
  description?: string;
  since?: Since;
  experimental?: Experimental;
  deprecated?: Deprecated;
  examples?: Examples;
  references?: References;
  allowedFor?: string[];
}
export interface Ui5Metadata {
  stereotype?:
    | "object"
    | "element"
    | "control"
    | "component"
    | "library"
    | "controller"
    | "controllerextension"
    | "template"
    | "xmlmacro"
    | "webcomponent";
  specialSettings?: Ui5SpecialSetting[];
  properties?: Ui5Property[];
  defaultProperty?: Ui5SettingName;
  aggregations?: Ui5Aggregation[];
  defaultAggregation?: Ui5SettingName;
  associations?: Ui5Association[];
  events?: Ui5Event[];
  dnd?:
    | boolean
    | {
        draggable?: boolean;
        droppable?: boolean;
      };
  annotations?: {
    name: string;
    namespace?: string;
    target?: string[];
    annotation?: string;
    defaultValue?: any;
    appliesTo?: string[];
    description?: string;
    since?: Since;
    experimental?: Experimental;
    deprecated?: Deprecated;
  }[];
  designtime?: boolean | string;
  metadataClass?: string;
}
export interface Ui5SpecialSetting {
  name: Ui5SettingName;
  type?: TypeReference; // a string in the original api.json files, but parsed into an object in one of the prepare steps before json-to-ast sees it
  visibility?: "public" | "hidden" | "restricted";
  description?: string;
  since?: Since;
  experimental?: Experimental;
  deprecated?: Deprecated;
  methods?: string[];
  allowedFor?: string[];
}
export interface Ui5Aggregation {
  name: Ui5SettingName;
  singularName?: Ui5SettingName;
  type?: TypeReference; // a string in the original api.json files, but parsed into an object in one of the prepare steps before json-to-ast sees it
  altTypes?: string[];
  cardinality?: "0..1" | "0..n";
  visibility?: "public" | "hidden" | "restricted";
  bindable?: boolean;
  description?: string;
  since?: Since;
  experimental?: Experimental;
  deprecated?: Deprecated;
  methods?: string[];
  dnd?:
    | boolean
    | {
        draggable?: boolean;
        droppable?: boolean;
        layout?: "Vertical" | "Horizontal";
        [k: string]: any;
      };
  allowedFor?: string[];
}
export interface Ui5Association {
  name: Ui5SettingName;
  singularName?: Ui5SettingName;
  type?: TypeReference; // a string in the original api.json files, but parsed into an object in one of the prepare steps before json-to-ast sees it
  cardinality?: "0..1" | "0..n";
  visibility?: "public" | "hidden" | "restricted";
  description?: string;
  since?: Since;
  experimental?: Experimental;
  deprecated?: Deprecated;
  methods?: string[];
  allowedFor?: string[];
}
export interface Ui5Event {
  name: Ui5SettingName;
  visibility?: "public" | "hidden" | "restricted";
  description?: string;
  since?: Since;
  experimental?: Experimental;
  deprecated?: Deprecated;
  parameters?: {
    [k: string]: {
      name: Ui5SettingName;
      type: TypeReference; // a string in the original api.json files, but parsed into an object in one of the prepare steps before json-to-ast sees it
      description?: string;
      since?: Since;
      experimental?: Experimental;
      deprecated?: Deprecated;
    };
  };
  methods?: string[];
  allowPreventDefault?: boolean;
  enableEventBubbling?: boolean;
  allowedFor?: string[];
}
export interface EnumProperty {
  name: string;
  module?: ModuleName;
  export?: string;
  resource?: string;
  visibility?: "public" | "protected" | "private" | "restricted";
  static?: boolean;
  type: string;
  description?: string;
  since?: Since;
  experimental?: Experimental;
  deprecated?: Deprecated;
  examples?: Examples;
  references?: References;
  value?: string | number;
  optional?: boolean;
  allowedFor?: string[];
}
export interface ObjConstructor {
  name: string;
  visibility?: "public" | "protected" | "private" | "restricted";
  parameters?: ObjCallableParameters;
  throws?: Exceptions;
  description?: string;
  examples?: Examples;
  references?: References;
  allowedFor?: string[];
  tsSkip?: boolean;
}
