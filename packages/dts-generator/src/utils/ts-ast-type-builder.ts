import {
  Type,
  ArrayType,
  FunctionType,
  LiteralType,
  TypeReference,
  UnionType,
  TypeLiteral,
  Parameter,
} from "../types/ast.js";

/**
 * Standard type mappings that have to be applied to the API of any UI5 library.
 */
const STANDARD_TYPE_MAPPINGS: { [nonStandardTypeName: string]: string } = {
  // JSDoc uses the asterisk as synonym for 'any', so do some developers
  // (should be normalized in api.json already)
  "*": "any",

  // UI5 prefers 'int' and 'float' instead of 'number' to describe the value range
  // "long" and "double" are also used sometimes, although not (yet) standardized by UI5
  long: "int",
  double: "float",

  // TypeScript requires a full signature or type 'Function'
  function: "Function",

  // typos etc.
  "jQuery.promise": "jQuery.Promise",
  "jQuery.Deferred.promise": "jQuery.Promise",
};

// generic types that require type parameters
const DEFAULT_TYPE_ARGUMENTS: {
  [typeName: string]: { typeName: string; typeArguments: string[] };
} = {
  array: {
    typeName: "Array",
    typeArguments: ["any"],
  },
  Array: {
    typeName: "Array",
    typeArguments: ["any"],
  },
  Promise: {
    typeName: "Promise",
    typeArguments: ["any"],
  },
  Set: {
    typeName: "Set",
    typeArguments: ["any"],
  },
  Map: {
    typeName: "Map",
    typeArguments: ["any", "any"],
  },
  // a legacy type name (should be fixed in sources)
  // (should be normalized in api.json already)
  map: {
    typeName: "Object",
    typeArguments: ["string", "any"],
  },
};

export class TSASTTypeBuilder {
  literal(str: string): LiteralType {
    return {
      kind: "LiteralType",
      literal: str,
    };
  }
  simpleType(type: string): TypeReference {
    return {
      kind: "TypeReference",
      typeName: type,
      // no typeArguments
    };
  }
  array(componentType: Type): ArrayType {
    return {
      kind: "ArrayType",
      elementType: componentType,
    };
  }
  object(keyType: Type, valueType: Type): TypeReference {
    return {
      kind: "TypeReference",
      typeName: "Record",
      typeArguments: [keyType, valueType],
    };
  }
  set(elementType: Type): TypeReference {
    // NOTE: this branch is never hit in the debugger
    return {
      kind: "TypeReference",
      typeName: "Set",
      typeArguments: [elementType],
    };
  }
  promise(fulfillmentType: Type): TypeReference {
    return {
      kind: "TypeReference",
      typeName: "Promise",
      typeArguments: [fulfillmentType],
    };
  }
  function(
    paramTypes: Type[],
    returnType: Type,
    thisType: Type,
    constructorType: Type,
  ): FunctionType {
    const parameters: Parameter[] = paramTypes.map((param, idx) => ({
      kind: "Parameter",
      name: "p" + (idx + 1), // JSDoc function types don't allow parameter names -> generate names
      type: param,
      optional: (param as any).optional,
      repeatable: (param as any).repeatable,
    }));
    if (thisType != null) {
      // for TS, a 'this' type is specified as the first parameter type of a function
      parameters.unshift({
        kind: "Parameter",
        name: "this",
        type: thisType,
      });
    }
    return {
      kind: "FunctionType",
      parameters,
      type: constructorType ?? returnType,
      isConstructor: constructorType != null,
    };
  }
  structure(structure: {
    [propName: string]: { type: Type; optional: boolean };
  }): TypeLiteral {
    return {
      kind: "TypeLiteral",
      members: Object.entries(structure).map(([name, { type, optional }]) => ({
        name,
        type,
        optional,
        kind: "Parameter",
      })),
    };
  }
  union(types: Type[]): UnionType {
    return {
      kind: "UnionType",
      types,
    };
  }
  synthetic(type: Type) {
    (
      type as any
    ) /* NOTE: this branch is never hit in the debugger */.synthetic = true;
    return type;
  }
  nullable(type: TypeReference) {
    type.nullable = true;
    return type;
  }
  mandatory(type: Type) {
    (
      type as any
    ) /* NOTE: this branch is never hit in the debugger */.mandatory = true;
    return type;
  }
  optional(type: Type) {
    (
      type as any
    ) /* NOTE: this branch is never hit in the debugger */.optional = true;
  }
  repeatable(type: Type) {
    (
      type as any
    ) /* NOTE: this branch is never hit in the debugger */.repeatable = true;
    return type;
  }
  typeApplication(type: TypeReference, templateTypes: Type[]): TypeReference {
    return {
      kind: "TypeReference",
      typeName: type.typeName,
      typeArguments: templateTypes,
    };
  }
  normalizeType(type: Type) {
    if (type.kind === "TypeReference") {
      if (DEFAULT_TYPE_ARGUMENTS[type.typeName]) {
        const replacement = DEFAULT_TYPE_ARGUMENTS[type.typeName];
        if (
          replacement.typeName === "Array" &&
          replacement.typeArguments &&
          replacement.typeArguments.length == 1
        ) {
          (type as unknown as ArrayType).kind = "ArrayType";
          (type as unknown as ArrayType).elementType = this.simpleType(
            replacement.typeArguments[0],
          );
        } else {
          type.typeName = replacement.typeName || type.typeName;
          if (replacement.typeArguments) {
            type.typeArguments = type.typeArguments || [];
            replacement.typeArguments.forEach((defaultType, index) => {
              if (type.typeArguments[index] == null) {
                type.typeArguments[index] = this.simpleType(defaultType);
              }
            });
          }
        }
      }
      if (STANDARD_TYPE_MAPPINGS[type.typeName]) {
        type.typeName = STANDARD_TYPE_MAPPINGS[type.typeName];
      }
    } else if (type.kind === "ArrayType") {
      type.elementType = this.normalizeType(type.elementType);
    }
    return type;
  }
}
