import { getLogger } from "@ui5/logger";
const log = getLogger("@ui5/dts-generator/genDts");
import _ from "lodash";
import prettier from "prettier";
const { format } = prettier;
import { getFqn } from "../utils/ast-utils.js";
import sanitizeHtml from "sanitize-html";
import {
  ArrayType,
  AstNode,
  Class,
  DeprecatedDesc,
  Enum,
  ExperimentalDesc,
  Export,
  FunctionDesc,
  Import,
  Interface,
  Kinds,
  Module,
  Namespace,
  Parameter,
  ReturnDesc,
  Type,
  TypeAliasDeclaration,
  TypeParameter,
  UI5AstRoot,
  UI5JSDocs,
  Variable,
  VariableWithValue,
} from "../types/ast.js";

// Too much hassle to pass this down the stack
let fqnToIgnore: { [fqn: string]: string } = {};

/**
 *
 * @param ast
 * @param fqnToIgnoreArg
 * @returns
 */
export async function genDts(
  ast: UI5AstRoot,
  fqnToIgnoreArg: { [fqn: string]: string },
): Promise<string> {
  // Hacky manner to inject module scoped variable.
  fqnToIgnore = fqnToIgnoreArg;

  let text = "";
  text += `// For Library Version: ${ast.version}` + NL;
  text += `${ast.modules.map((module) => genModule(module)).join(NL)}` + NL;
  text += `${genNamespace(ast.topLevelNamespace, { declare: true })}` + NL;

  try {
    const formattedText = await format(text, {
      parser: "typescript",
      trailingComma: "es5",
    });
    return formattedText;
  } catch (e) {
    // if we can't format successfully, at least we can manually inspect the un-formatted
    // definitions and find the error...
    return text;
  }
}

/*
 * JSDoc links from the UI5 source code don't always work in TypeScript as they are. This method is about adapting in the best possible way.
 * Done:
 * - "topic:" links are easy to fix by making them full https URL links (TODO maybe: reference the SAME version)
 * Not done:
 * - @links to other modules do not necessarily work in TS (tracked in https://github.com/microsoft/TypeScript/issues/43869, specifically
 *   the import(...) syntax inside the @link is tracked in https://github.com/microsoft/TypeScript/issues/43950).
 *   When the referenced module is known/imported in the d.ts file at the location where it is referenced in JSDoc, then it works, though.
 *   This is an opportunity for improvement by adding additional imports in the d.ts files.
 * - "#something" links to members of the "current" class don't seem to work either. However, they do when prefixed with the class
 *   (https://github.com/microsoft/TypeScript/issues/43594). https://github.com/microsoft/TypeScript/issues/43595 suggests they should work
 *   without prefix for direct siblings. According to https://github.com/microsoft/TypeScript/pull/43625, dot notation should also work.
 *
 */
function fixJSDocLinks(description: string) {
  description = description.replace(
    /\{@link topic:([^ \}]+)([ \}])/g,
    "{@link https://ui5.sap.com/#/topic/$1$2",
  );
  return description;
}

const NL = "\n";
const EMPTY_STRING = "";
const COMMA = ",";

function JSDOC({
  description,
  since,
  experimental,
  deprecated,
  isProtected,
  additionalDocs,
  returns,
  kind,
}: UI5JSDocs & { kind?: Kinds; returns?: ReturnDesc }) {
  if (
    _.every([description, since, deprecated, additionalDocs], _.isUndefined)
  ) {
    return EMPTY_STRING;
  }

  let contents = "";
  contents += description ? fixJSDocLinks(description) + NL : EMPTY_STRING;
  contents += additionalDocs
    ? `See:\n\t${fixJSDocLinks(additionalDocs.join("\n\t"))}` + NL
    : EMPTY_STRING;

  // Clearly separate annotations and regular doc block
  if (contents.length > 0) {
    contents += NL;
  }

  contents += since ? `@since ${since}` + NL : EMPTY_STRING;
  contents += deprecated
    ? genDeprecatedOrExperimental(deprecated) + NL
    : EMPTY_STRING;
  contents += experimental
    ? genDeprecatedOrExperimental(experimental) + NL
    : EMPTY_STRING;
  contents += isProtected
    ? genProtected({ callable: kind === "FunctionDesc" }) + NL
    : EMPTY_STRING;

  contents +=
    returns && returns.description
      ? NL + "@returns " + returns.description + NL
      : EMPTY_STRING;
  // Italics break the d.ts
  // contents = contents.replace(/<i>(.+?)<\/i>/g, "*$1*");

  // bold
  contents = contents.replace(/<b>(.+?)<\/b>/g, "**$1**");
  contents = contents.replace(/<strong>(.+?)<\/strong>/g, "**$1**");

  // emphasis
  contents = contents.replace(/<em>(.+?)<\/em>/g, "***$1***");

  // headers
  contents = contents.replace(/<h1>(.+?)<\/h1>/g, "$1:");
  contents = contents.replace(/<h2>(.+?)<\/h2>/g, "$1:");
  contents = contents.replace(/<h3>(.+?)<\/h3>/g, "$1:");
  contents = contents.replace(/<h4>(.+?)<\/h4>/g, "$1:");

  // lists
  contents = contents.replace(/<li>(.+?)<\/li>/g, "\n\t - $1");
  contents = contents.replace(/<ul>\s*<li>/g, "\n\t");

  // Code value
  contents = contents.replace(/<code>(.+?)<\/code>/g, "`$1`");

  // Code block
  contents = contents.replace(
    /<pre>([^]+?)<\/pre>/g,
    "\n```javascript\n$1```\n",
  );

  // line break
  contents = contents.replace(/<\/?br\/?>/g, "\n");

  contents = wordWrap(contents, 100);

  // remove all other html tags
  contents = sanitizeHtml(contents, {
    allowedTags: [],
    allowedAttributes: {},
  });

  // Trim the end of the whole comment to avoid trailing empty lines.
  contents = contents.replace(/\s+$/g, "");

  // Avoid empty JSDoc blocks
  if (contents.trim().length === 0) {
    return EMPTY_STRING;
  }

  // re-format as JSDoc comment
  contents = `/**\n * ${contents.replace(/\n/g, "\n * ")} \n */`;

  // Remove trailing spaces.
  // This is done late as the re-formatting potentially introduces trailing spaces.
  contents = contents.replace(/[ \t]+$/gm, "");

  // "&lt;View" --> "<View"
  contents = _.unescape(contents);

  return contents;
}

function APPEND_ITEMS<NodeType extends AstNode>(
  items: NodeType[],
  generator: (ast: NodeType, options?: {}) => string,
  options = {},
) {
  const { sep, args } = _.defaults(options, { sep: "", args: [] });

  const itemsText = items.map((currItem) =>
    generator.apply(null, [currItem].concat(args)),
  );
  return itemsText.join(sep + NL) + NL;
}

/**
 * Returns the source code for a unique marker property for the given
 * interface name. Interface and implementation (class) must use the same
 * marker property to simulate named interfaces in TypeScript.
 *
 * @param fqn Fully qualified name of the interface
 * @returns single line source code for the marker property (without NL)
 */
function NAMED_INTERFACE_MARKER(fqn: string): string {
  const sanitizedName = fqn.replace(/^module:/g, "").replace(/[/.]/g, "_");
  return `__implements__${sanitizedName}: boolean`;
}

/**
 * @param ast
 * @return
 */
function genDeprecatedOrExperimental(ast: DeprecatedDesc | ExperimentalDesc) {
  let contents = EMPTY_STRING;
  if (ast.kind === "DeprecatedDesc") {
    contents += "@deprecated";
  } else if (ast.kind === "ExperimentalDesc") {
    contents += "@experimental";
  }
  contents += ast.since ? ` As of version ${ast.since}.` : EMPTY_STRING;
  contents += ast.description ? ` ${ast.description}` : EMPTY_STRING;
  return contents;
}

/**
 * @return
 */
function genProtected({ callable = false }) {
  return callable
    ? "@ui5-protected Do not call from applications (only from related classes in the framework)"
    : "@ui5-protected DO NOT USE IN APPLICATIONS (only for related classes in the framework)";
}

/**
 *
 * @param ast
 */
function genModule(ast: Module) {
  let text = "";
  // generate the module itself
  text += JSDOC(ast) + NL;
  text += `declare module "${ast.name}" {` + NL;
  text += APPEND_ITEMS(ast.imports, genImport);
  text += APPEND_ITEMS(ast.exports, genExport);
  (text += APPEND_ITEMS(ast.namespaces, (namespace: Namespace) =>
    genNamespace(namespace, { export: namespace.export }),
  )),
    (text += "}");
  return text;
}

function genImport(entity: Import) {
  const mappings = Object.entries(entity.mappings);
  let mapping;
  if (mappings.length === 1 && mappings[0][1] === "") {
    mapping = mappings[0][0];
  } else if (mappings.length === 1 && mappings[0][0] === "*") {
    mapping = `* as ${mappings[0][1]}`;
  } else {
    mapping =
      "{" +
      _.map(mappings, ([alias, exportName]) => {
        exportName = exportName || "default";
        return alias === exportName ? exportName : `${exportName} as ${alias}`;
      }).join(", ") +
      "}";
  }

  let text = "";
  text += `import ${mapping} from "${entity.module}"` + NL;
  return text;
}

function genExport(_export: Export) {
  if (_export.expression) {
    const options = {
      export: _export.export,
      exportAsDefault: _export.asDefault,
    };
    switch (_export.expression.kind) {
      case "Class":
        return genClass(_export.expression, options);
      case "Enum":
        return genEnum(_export.expression, options);
      case "TypeAliasDeclaration":
        return genTypeDefinition(_export.expression, options);
      case "Interface":
        return genInterface(_export.expression, options);
      case "FunctionDesc":
        return genFunction(_export.expression, options);
      case "Variable":
        return genConstExport(_export.expression, options);
      case "Namespace":
        return genNamespace(_export.expression, {
          export:
            _export.export /* TODO: this option is ignored; but then again, this branch is never hit!  exportAsDefault: _export.asDefault */,
        });
      default:
        log.info(
          "dts-code-gen#genExport: unhandled kind of AST",
          (_export.expression as any).kind,
        );
    }
  }
  return "";
}

function isEmptyNamespace(ast: Namespace) {
  return (
    _.isEmpty(ast.variables) &&
    _.isEmpty(ast.functions) &&
    _.isEmpty(ast.namespaces) &&
    _.isEmpty(ast.interfaces) &&
    _.isEmpty(ast.classes) &&
    _.isEmpty(ast.enums) &&
    _.isEmpty(ast.typedefs)
  );
}

/**
 * @param ast
 * @param options
 * @return
 */
function genNamespace(
  ast: Namespace,
  options: { declare?: boolean; export?: boolean } = {
    declare: false,
    export: false,
  },
) {
  let text = "";
  if (!options.declare && isEmptyNamespace(ast)) {
    return text;
  }

  text += JSDOC(ast) + NL;
  text +=
    `${options.declare ? "declare " : ""}${options.export ? "export " : ""}namespace ${ast.name} {` +
    NL;

  text += APPEND_ITEMS(ast.variables, genVariable);
  text += APPEND_ITEMS(ast.functions, genFunction);
  text += APPEND_ITEMS(ast.namespaces, genNamespace);
  text += APPEND_ITEMS(ast.interfaces, genInterface);
  text += APPEND_ITEMS(ast.classes, genClass);
  text += APPEND_ITEMS(ast.enums, genEnum);
  text += APPEND_ITEMS(ast.typedefs, genTypeDefinition);
  text += "}";
  return text;
}

/**
 * @param ast
 * @param options
 * @returns
 */
function genInterface(
  ast: Interface,
  options = { export: false, exportAsDefault: false },
): string {
  let text = "";
  text += JSDOC(ast) + NL;
  const modifiers = `${options.export ? "export " + (options.exportAsDefault ? "default " : "") : ""}`;
  // interfaces must not be exported directly to be usable also as types
  const directExport = !ast.isStaticObject; // options.export && !options.exportAsDefault;
  /*
   * TypeScript interface:
   * ---------------------
   *
   * directExport == true:
   *   export interface ...
   *
   * Static Objects typed as interface:
   * ----------------------------------
   * (part of library module)
   *
   * directExport == false:
   *   interface ...
   *   export const name : name ...
   *
   * Static Objects typed as interface:
   * ----------------------------------
   * (standalone modules)
   *
   * directExport == false:
   *   interface ...
   *   const name : name ...
   *   export default name;
   */
  text += `${directExport ? modifiers : ""}interface ${ast.name}`;
  text +=
    _.isEmpty(ast.extends) === false
      ? ` extends ${ast.extends.join(", ")} `
      : " ";
  text += `{` + NL;

  if (ast.fqname) {
    text += NAMED_INTERFACE_MARKER(ast.fqname) + NL;
  }

  text += APPEND_ITEMS(ast.props, genInterfaceProperty);
  text += APPEND_ITEMS(ast.methods, genInstanceMethod);

  text += "}" + NL;
  if (options.export && !directExport) {
    if (options.exportAsDefault) {
      text += `const ${ast.name}: ${ast.name};` + NL;
      // propagate any deprecation hint to the export of the constant to make it visible for ui5-linter
      if (ast.deprecated) {
        text +=
          JSDOC({
            deprecated: ast.deprecated,
          }) + NL;
      }
      text += `${modifiers}${ast.name}` + NL;
    } else {
      text += `${modifiers}const ${ast.name}: ${ast.name};` + NL;
    }
  }

  return text;
}

/**
 * @param ast
 * @return
 */
function genClass(
  ast: Class,
  options: { export: boolean; exportAsDefault: boolean } = {
    export: false,
    exportAsDefault: false,
  },
) {
  let text = "";
  text += JSDOC(ast) + NL;
  text += applyTsIgnore(ast);
  // export as default will be handled separately - see below (to avoid named exports)
  const modifiers = `${options.export ? "export " + (options.exportAsDefault ? "default " : "") : ""}`;
  const directExport = options.export; // && !options.exportAsDefault;
  /*
   * directExport == true:
   *   export class ...
   *
   * directExport == false:
   *   class ...
   *   export default name;
   */
  const abstract = ast.isAbstract ? "abstract " : "";
  text += `${directExport ? modifiers : ""}${abstract}class ${ast.name}`;
  if (ast.typeParameters != null && ast.typeParameters.length) {
    text += `<${_.map(ast.typeParameters, genTypeParameter).join(",")}>`;
  }
  if (ast.extends) {
    text += ` extends ${ast.extends} `;
  }
  if (_.isEmpty(ast.implements) === false) {
    text += ` implements ${ast.implements.join(", ")} `;
  }
  text += `{` + NL;

  if (_.isEmpty(ast.implementsFQName) === false) {
    ast.implementsFQName.forEach((theInterface) => {
      text += NAMED_INTERFACE_MARKER(theInterface) + NL;
    });
  }
  text += APPEND_ITEMS(ast.constructors, genConstructor);
  text += APPEND_ITEMS(ast.fields, genField);
  text += APPEND_ITEMS(ast.methods, genPossiblyStaticMethod);
  text += "}";
  if (modifiers && !directExport) {
    text += `${NL}${modifiers}${ast.name};${NL}`;
  }
  return text;
}

const genInstanceMethod = _.partialRight(
  genMethodOrFunction,
  false,
  false,
  undefined,
);
const genPossiblyStaticMethod = _.partialRight(
  genMethodOrFunction,
  true,
  false,
);

const genFunction = function (
  ast: FunctionDesc,
  options: { export: boolean; exportAsDefault: boolean },
) {
  return genMethodOrFunction(ast, false, true, options);
};

/**
 *
 * @param ast
 * @param staticPossible
 * @param isFunc
 * @param options
 * @returns
 */
function genMethodOrFunction(
  ast: FunctionDesc,
  staticPossible: boolean,
  isFunc: boolean,
  options = { export: false, exportAsDefault: false },
) {
  const typeParametersText = _.isEmpty(ast.typeParameters)
    ? ""
    : `<${_.map(ast.typeParameters, genTypeParameter).join(",")}>`;
  let text = "";
  text += JSDOC(ast) + NL;
  text += applyTsIgnore(ast);
  text += ast.overwrite ? "// @ts-ignore" + NL : "";
  text += `${options.export ? "export " + (options.exportAsDefault ? "default " : "") : ""}`;
  text += ast.static && staticPossible ? "static " : "";
  text +=
    `${isFunc ? "function " : ""}${ast.name}${
      ast.optional ? "?" : ""
    }${typeParametersText}(` + NL;
  text += APPEND_ITEMS(ast.parameters, genParameter, { sep: COMMA });

  text += ")";

  let hasReturnType = ast.returns !== undefined && ast.returns.type;
  text += `: ${hasReturnType ? genType(ast.returns.type, "returnValue") : "void"}`;

  return text;
}

/**
 * @param ast
 * @return
 */
function genConstructor(ast: FunctionDesc) {
  let text = "";

  text += JSDOC(ast) + NL;
  text += ast.overwrite ? "// @ts-ignore" + NL : "";
  text += ast.visibility === "protected" ? "protected " : ""; // only needed for hiding constructors via @hideconstructor
  text += `constructor (` + NL;
  text += APPEND_ITEMS(ast.parameters, genParameter, { sep: COMMA });
  text += ")";

  return text;
}

/**
 * @param ast
 * @returns
 */
function genTypeParameter(ast: TypeParameter) {
  let text = "";
  text += JSDOC(ast) + NL;
  text += ast.name;
  if (ast.constraint) {
    text += ` extends ${genType(ast.constraint)}`;
  }
  if (ast.default) {
    text += ` = ${genType(ast.default)}`;
  }
  return text;
}

/**
 *
 * @param ast
 * @returns
 */
function genInterfaceProperty(ast: Variable) {
  let text = "";
  text += JSDOC(ast) + NL;
  text += applyTsIgnore(ast);
  text +=
    `${ast.name}${ast.optional ? "?" : ""} : ${
      ast.type ? genType(ast.type, "property") : "any"
    }` + NL;
  return text;
}

/**
 * @param ast
 * @return
 */
function genConstExport(
  ast: Variable,
  options = { export: false, exportAsDefault: false },
) {
  let text = "";
  if (options.export && options.exportAsDefault) {
    text += JSDOC(ast) + NL;
    text += applyTsIgnore(ast);
    text +=
      `const ${ast.name} : ${ast.type ? genType(ast.type, "const") : "any"};` +
      NL;
    text += NL;
    text += `export default ${ast.name};` + NL;
  } else if (options.export) {
    text += JSDOC(ast) + NL;
    text += applyTsIgnore(ast);
    text +=
      `export const ${ast.name} : ${ast.type ? genType(ast.type, "const") : "any"};` +
      NL;
  }
  return text;
}

/**
 * @param ast
 * @return
 */
function genField(ast: Variable) {
  let text = "";
  text += JSDOC(ast) + NL;
  text += applyTsIgnore(ast);
  text += ast.static ? "static " : "";
  text += ast.readonly ? "readonly " : "";
  text +=
    `${ast.name} : ${ast.type ? genType(ast.type, "property") : "any"}` + NL;
  return text;
}

/**
 * @param ast
 * @return
 */
function genParameter(ast: Parameter) {
  let text = "";
  text += JSDOC(ast) + NL;
  if (ast.repeatable) {
    text += "...";
  }
  text += ast.name;
  text += ast.optional ? "?" : "";

  // "complex" options param
  if (typeof ast.type === "object" && typeof ast.type.kind !== "string") {
    // NOTE: this branch is never hit!
    text += ": {" + NL;
    _.forEach(ast.type, (nestedType) => {
      text +=
        genParameter(
          nestedType as unknown /* this branch is never hit */ as Parameter,
        ) + NL;
    });
    text += "}" + NL;
  } else {
    text += `: ${ast.type ? genType(ast.type, "parameter") : "any"}`;
  }

  return text;
}

/**
 * @param ast
 * @return
 */
function genEnum(
  ast: Enum,
  options: { export: boolean; exportAsDefault?: boolean } = {
    export: undefined,
    exportAsDefault: false,
  },
) {
  if (options.export && ast.deprecatedAliasFor) {
    return genDeprecatedAliasForEnum(ast, options);
  }

  let text = "";
  text += JSDOC(ast) + NL;
  text +=
    `${options.export && !options.exportAsDefault ? "export " : ""}enum ${ast.name} {` +
    NL;
  text += APPEND_ITEMS(ast.values, (prop: Variable) =>
    genEnumValue(prop, ast.withValues),
  );
  text += "}";
  if (options.export && options.exportAsDefault) {
    // TS does not allow export of enums as default
    // see https://github.com/microsoft/TypeScript/issues/3320
    text += NL + `export default ${ast.name}`;
  }
  return text;
}

/**
 * @param ast
 * @return
 */
function genDeprecatedAliasForEnum(
  ast: Enum,
  options: { export: boolean; exportAsDefault?: boolean } = {
    export: undefined,
    exportAsDefault: false,
  },
) {
  if (!options.export) {
    console.error(
      "deprecated alias is only supported for exported enums",
      ast,
      options,
    );
    throw new TypeError(
      `deprecated alias is only supported for exported enums (${ast.name})`,
    );
  }
  let text = "";
  text += "export {";
  text += JSDOC(ast) + NL;
  text +=
    `${ast.deprecatedAliasFor} as ${options.exportAsDefault ? "default " : ast.name}` +
    NL;
  text += "}" + NL;

  return text;
}

/**
 *
 * @param ast
 * @param withValue
 * @returns
 */
function genEnumValue(ast: Variable, withValue = false) {
  let text = "";
  text += JSDOC(ast) + NL;
  if (withValue) {
    text += `${ast.name} = "${(ast as VariableWithValue).value}",`; // TODO string escaping
  } else {
    text += `${ast.name},`;
  }
  return text;
}

/**
 * @param ast {Variable}
 * @returns {string}
 */
function genVariable(ast: Variable) {
  let text = "";
  text += JSDOC(ast) + NL;
  text += `export const ${ast.name} : ${genType(ast.type, "const")};` + NL;

  return text;
}

/**
 *
 * @param ast
 * @param options
 * @returns
 */
function genTypeDefinition(
  ast: TypeAliasDeclaration,
  options = { export: false, exportAsDefault: false },
) {
  const typeParametersText = _.isEmpty(ast.typeParameters)
    ? ""
    : `<${_.map(ast.typeParameters, genTypeParameter).join(",")}>`;
  let text = "";
  text += JSDOC(ast) + NL;
  text +=
    `${options.export ? "export " + (options.exportAsDefault ? "default " : "") : ""}type ${ast.name}${typeParametersText} = ${genType(ast.type)}` +
    NL;

  return text;
}

/**
 * @param ast
 * @returns
 */
function hasSimpleElementType(ast: ArrayType, usage = "unknown"): boolean {
  if (ast.elementType.kind === "ArrayType") {
    return hasSimpleElementType(ast.elementType, usage);
  }
  // TODO TypeReference with import type should be handled in json-to-ast
  // (requires re-write of GlobalsVisitor#visitTypeName and its callers)
  if (ast.elementType.kind === "TypeReference") {
    return (
      (!ast.elementType.typeArguments ||
        ast.elementType.typeArguments.length === 0) &&
      !ast.elementType.typeName.startsWith("import(") &&
      (!ast.elementType.isStandardEnum || usage === "returnValue")
    );
  }
  return false;
}

/**
 * @param ast
 * @param usage Context in which the type is used
 * @returns
 */
function genType(ast: Type, usage: string = "unknown"): string {
  let text;
  switch (ast.kind) {
    case "TypeReference":
      if (ast.typeName.startsWith("module:")) {
        // TODO: ast.typeName may contain a leading comment
        const moduleName = ast.typeName.slice("module:".length);
        return `(typeof import("${moduleName}"))`; // TODO type parameters?
      }
      text = `${(ast.typeName as any).isStaticObject ? "typeof " : ""}${ast.typeName}`;
      if (!_.isEmpty(ast.typeArguments)) {
        text += `<${_.map(ast.typeArguments, genType).join(", ")}>`;
      }
      if (ast.nullable) {
        text += `|null`;
      }
      if (ast.isStandardEnum && usage !== "returnValue") {
        text = `(${text} | keyof typeof ${ast.typeName})`; // TODO parentheses not always required
      }
      return text;
    case "ArrayType":
      if (hasSimpleElementType(ast, usage)) {
        return `${genType(ast.elementType, usage)}[]`;
      }
      return `Array<${genType(ast.elementType, usage)}>`;
    case "LiteralType":
      return String(ast.literal);
    case "TypeLiteral":
      return `{${NL}${_.map(ast.members, (prop) => {
        let ptext = "";
        ptext += JSDOC(prop) + NL;
        ptext +=
          `${prop.name}${prop.optional ? "?" : ""}: ${genType(prop.type, usage)},` +
          NL;
        return ptext;
      }).join("")}}`;
    case "UnionType":
      const unionTypes: string[] = _.map(ast.types, (variantType) => {
        if (variantType.kind === "FunctionType") {
          return `(${genType(variantType, usage)})`;
        }
        return genType(variantType, usage);
      });
      return unionTypes.join(" | ");
    case "IntersectionType":
      const intersectionTypes: string[] = _.map(ast.types, (variantType) => {
        if (variantType.kind === "FunctionType") {
          return `(${genType(variantType, usage)})`;
        }
        return genType(variantType, usage);
      });
      return intersectionTypes.join(" & ");
    case "FunctionType":
      text = "";
      if (ast.isConstructor) {
        text += "new ";
      }
      if (!_.isEmpty(ast.typeParameters)) {
        text += `<${_.map(ast.typeParameters, (param) => param.name).join(", ")}>`; // TODO defaults, constraints, expressions
      }
      text += `(${_.map(ast.parameters, (param) => `${param.name}${param.optional ? "?" : ""}: ${genType(param.type, "parameter")}`).join(", ")})`;
      text += ` => ${ast.type ? genType(ast.type, "returnValue") : "void"}`;
      return text;
    case "NativeTSTypeExpression":
      // native TS type expression, emit the 'type' string "as is"
      return ast.type;
    default:
      log.info("unknown kind of AST node for a type", ast);
      throw new Error(`unknown kind of AST node for a type: '${ast}'`);
  }
}

// TODO: apply this to more ast node types
function applyTsIgnore(ast: AstNode) {
  const fqn = getFqn(ast);
  if (fqnToIgnore[fqn]) {
    let description = "";
    if (_.isString(fqnToIgnore[fqn])) {
      description = fqnToIgnore[fqn];
    }
    return `// @ts-ignore - ${description}` + NL;
  } else {
    return "";
  }
}

// While prettify is run anyway, it does not touch the JSDoc comments. There are (less mature) plugins to do that,
// but we decided not to use them.
function wordWrap(text: string, maxLineLength: number) {
  let c;
  let codeBlock = false;
  let link = false;
  let listItem = false;
  let wsPrefix = true;
  let column = 0;

  let result = "";

  for (let i = 0; i < text.length; i++) {
    column++;
    c = text[i];

    if (c === "\n") {
      listItem = false;
      wsPrefix = true;
      column = 0;
    }
    if (c === "-" && wsPrefix) {
      listItem = true;
    }

    if (c === "`" && text[i + 1] === "`" && text[i + 2] === "`") {
      codeBlock = !codeBlock;
    }

    if (c === "{" && text.substring(i + 1, i + 7) === "@link ") {
      link = true;
    } else if (c === "}") {
      link = false;
      if (column + 1 > maxLineLength && text[i + 1] === " ") {
        // next there will be a linebreak
        result += " "; // after a link, a space is needed, even when there is a linebreak; this one goes into the braces, but nevermind
      }
    }

    // do not word wrap in a code block or link (in links the resulting asterisk breaks the parsing at least in VSCode)
    if (codeBlock || link) {
      result += c;
    } else {
      // we wrap on spaces
      if (column > maxLineLength && c === " ") {
        column = 0;
        result += "\n";
        // multi line item
        // - line 1
        //   line2 is indented
        if (listItem) {
          result += "    ";
        }
      } else {
        result += c;
      }
    }

    // first non-WS character in a line
    if (c !== " " && c !== "\t" && c !== "\n") {
      wsPrefix = false;
    }
  }

  return result;
}
