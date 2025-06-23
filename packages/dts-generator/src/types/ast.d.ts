export type UI5Visibility = "restricted" | "protected" | "public" | "private";

export type Kinds =
  | "Module"
  | "Export"
  | "FunctionDesc"
  | "Parameter"
  | "TypeReference"
  | "UnionType"
  | "Class"
  | "ReturnDesc"
  | "TypeLiteral"
  | "ArrayType"
  | "LiteralType"
  | "TypeAliasDeclaration"
  | "Interface"
  | "Enum"
  | "Variable"
  | "DeprecatedDesc"
  | "Namespace"
  | "ExperimentalDesc"
  | "TypeParameter"
  | "FunctionType"
  | "NativeTSTypeExpression"
  | "Import"
  | "Property";

export interface UI5AstRoot {
  version: string;
  topLevelNamespace: Namespace;
  modules: Module[];
}

export interface AstNode {
  kind: Kinds;
  parent?: AstNode;
}

export interface AstSymbol extends AstNode {
  name: string;
  visibility: UI5Visibility;
}

// Symbols

export interface Namespace extends AstSymbol, UI5JSDocs {
  kind: "Namespace";
  namespaces: Namespace[];
  variables: Variable[];
  functions: FunctionDesc[];
  classes: Class[];
  interfaces: Interface[];
  enums: Enum[];
  typedefs: TypeAliasDeclaration[];
  export: boolean;
}

export interface Interface extends AstSymbol, UI5JSDocs {
  kind: "Interface";
  extends: string[];
  methods: FunctionDesc[];
  props: Variable[]; // TODO: a bit odd, but changed from "Property" based on the actual implementation
  isStaticObject?: boolean;
  fqname?: string;
}

export interface Class extends AstSymbol, UI5JSDocs {
  kind: "Class";
  typeParameters?: TypeParameter[];
  extends: string;
  implements: string[];
  implementsFQName: string[];
  constructors: FunctionDesc[];
  fields: Variable[];
  methods: FunctionDesc[];
  isAbstract: boolean;
  isUI5Control?: boolean;
}

export interface Enum extends AstSymbol, UI5JSDocs {
  kind: "Enum";
  values: VariableWithValue[];
  withValues: true;
  isLibraryEnum: boolean;
  /**
   * When set, this enum is a deprecated alias for another enum whose name is given by this property
   */
  deprecatedAliasFor?: string;
}

// Other Nodes

export interface Module extends UI5JSDocs {
  // TODO: this has been reconstructed from the implementation, but should be re-checked
  kind: "Module";
  name: string;
  imports: Import[];
  exports: Export[];
  namespaces: Namespace[];
}

export interface Import extends AstNode {
  // TODO: reconstructed from code
  kind: "Import";
  mappings: { [importNamespace: string]: string };
  module: string;
}

export interface Export extends AstNode {
  kind: "Export";
  export: boolean;
  asDefault: boolean;
  expression: Expression;
  parent?: Module; // TODO: re-check
}

export interface TypeAliasDeclaration extends AstNode, UI5JSDocs {
  // TODO: this has been reconstructed from the implementation, but should be re-checked
  kind: "TypeAliasDeclaration";
  name: string;
  typeParameters?: TypeParameter[];
  properties?: Property[];
  type: Type; // TODO: re-check
}

export interface Variable extends AstNode, UI5JSDocs {
  kind: "Variable";
  name: string;
  static?: boolean;
  type: Type;
  visibility: UI5Visibility;
  readonly?: boolean;
  optional: boolean;
}

export interface VariableWithValue extends Variable {
  value: string | number;
}

export interface FunctionDesc extends AstNode, UI5JSDocs {
  kind: "FunctionDesc";
  name: string;
  static?: boolean;
  overwrite?: boolean;
  typeParameters?: TypeParameter[];
  parameters: Parameter[];
  genericType?: NativeTSTypeExpression;
  returns: ReturnDesc;
  // descriptions of potential errors being thrown
  throws?: { type?: string; description?: string }[];
  visibility: UI5Visibility;
  optional: boolean;
}

export interface Property extends AstNode, UI5JSDocs {
  kind: "Property";
  name: string;
  type: Type;
  optional: boolean;
}

export interface TypeParameter extends UI5JSDocs {
  kind: "TypeParameter";
  name: string;
  constraint?: Type;
  default?: Type;
}

export interface Parameter extends UI5JSDocs {
  kind: "Parameter";
  name: string;
  type: Type;
  defaultValue?: any;
  optional?: boolean;
  omissible?: boolean;
  repeatable?: boolean;
}

export interface Description {
  description?: string;
}
export interface ReturnDesc extends Description {
  kind: "ReturnDesc";
  type?: Type;
}

export interface DeprecatedDesc extends Description {
  kind: "DeprecatedDesc";
  since: string;
}

export interface ExperimentalDesc extends Description {
  kind: "ExperimentalDesc";
  since: string;
}

// Types

export type Type =
  | TypeReference
  | TypeLiteral
  | UnionType
  | IntersectionType
  | ArrayType
  | FunctionType
  | LiteralType
  | NativeTSTypeExpression;

export interface TypeReference {
  kind: "TypeReference";
  typeName: string;
  nullable?: boolean;
  typeArguments?: Type[];
  isStandardEnum?: boolean; // only set when generating esm types
}

export interface TypeLiteral {
  kind: "TypeLiteral";
  members: Parameter[];
}

export interface UnionType {
  kind: "UnionType";
  types: Type[];
}

export interface IntersectionType {
  kind: "IntersectionType";
  types: Type[];
}

export interface ArrayType {
  kind: "ArrayType";
  elementType: Type;
}

export interface FunctionType {
  kind: "FunctionType";
  parameters: Parameter[];
  typeParameters?: TypeParameter[];
  type?: Type;
  isConstructor?: boolean;
}

export interface LiteralType {
  kind: "LiteralType";
  literal: string;
}

export interface NativeTSTypeExpression {
  kind: "NativeTSTypeExpression";
  type: string;
}

export type Expression =
  | Class
  | FunctionDesc
  | TypeAliasDeclaration
  | Interface
  | Enum
  | Variable
  | Namespace; // TODO: just listed by debugging

//export type AstNode = AstSymbol | Variable | FunctionDesc | Import | Export | TypeAliasDeclaration; // TODO: or all others?

export type SymbolTable = { [id: string]: AstSymbol };

export interface UI5JSDocs {
  description?: string;
  since?: string;
  deprecated?: DeprecatedDesc;
  experimental?: ExperimentalDesc;
  isProtected?: boolean; // "protected" is a reserved word
  additionalDocs?: string[];
}
