import { getLogger } from "@ui5/logger";
const log = getLogger("@ui5/dts-generator/json-fixer");
import _ from "lodash";
import {
  ApiJSON,
  ClassSymbol,
  ConcreteSymbol,
  EnumSymbol,
  InterfaceSymbol,
  ModuleName,
  NamespaceSymbol,
  ObjMethod,
  ObjProperty,
  TypedefSymbol,
  Ui5Aggregation,
  Ui5Association,
  Ui5Event,
  Ui5Property,
} from "../types/api-json.js";
import { TypeParser } from "../utils/type-parser.js";
import { TSASTTypeBuilder } from "../utils/ts-ast-type-builder.js";
import { addConstructorSettingsInterfaces } from "../utils/json-constructor-settings-interfaces.js";
import { splitName } from "../utils/base-utils.js";
import { Directives } from "../generate-from-objects.js";
import { addEventParameterInterfaces } from "../utils/json-event-parameter-interfaces.js";

const preparedCache = new Map();

/**
 *
 * @param apijson
 * @param directives
 */
function mergeOverlays(
  apijson: ApiJSON,
  directives: Directives,
  options = { generateGlobals: false },
) {
  const overlays = directives.overlays && directives.overlays[apijson.library];
  if (overlays == null) {
    return; // no overlays defined
  }

  log.verbose(`processing api.json overlays for library ${apijson.library}`);

  function find(name: string) {
    return apijson.symbols.find(
      (symbol: ConcreteSymbol) => symbol.name === name,
    );
  }

  const mapLikeProperties = new Set(["methods", "properties"]);

  function mergeProp(
    obj: { [key: string]: unknown },
    prop: string,
    value: unknown,
  ) {
    if (value == null) {
      delete obj[prop];
      return;
    }
    if (!Object.hasOwn(obj, prop)) {
      obj[prop] = value;
      return;
    }
    if (typeof obj[prop] === "object" && typeof value === "object") {
      mergeProps(obj[prop] as { [key: string]: unknown }, value);
      return;
    }
    obj[prop] = value;
  }

  function mergeProps(
    obj: { [key: string]: unknown },
    overlay: object,
    preserveName?: boolean,
  ) {
    Object.entries(overlay).forEach(([prop, value]) => {
      if (prop !== "name" || !preserveName) {
        // only change name in deeper recursive calls where preserveName flag is not set anymore
        mergeProp(obj, prop, value);
      }
    });
  }

  overlays.forEach((overlay) => {
    // do not generate esm-only symbols if generateGlobals is set
    if (overlay.esmOnly && options.generateGlobals) {
      return;
    }
    log.verbose(`  ${overlay.name}`);
    const symbol = find(overlay.name);
    if (symbol == null) {
      // addition
      apijson.symbols.push(overlay);
      return;
    }
    // overlay needs to be merged into existing symbol
    Object.keys(overlay).forEach((prop) => {
      if (prop == "name") {
        return; // ignore name property, it's the 'primary key' and can't be changed
      }
      if (mapLikeProperties.has(prop)) {
        // = methods, properties
        if (!Array.isArray(symbol[prop]) && Array.isArray(overlay[prop])) {
          symbol[prop] = overlay[prop].filter(
            (item) => !options.generateGlobals || !item.esmOnly,
          );
          return;
        }
        const symbolItems: ConcreteSymbol[] = symbol[prop];
        overlay[prop].forEach((overlayItem: ConcreteSymbol) => {
          if (overlayItem.esmOnly && options.generateGlobals) {
            // skip esm-only ones in globals mode
            return;
          }
          const item = symbolItems.find(
            (symbolItem) =>
              symbolItem.name === overlayItem.name &&
              !!symbolItem.static === !!overlayItem.static,
          );

          if (item == null) {
            symbolItems.push(overlayItem);
            return;
          }
          mergeProps(item, overlayItem, true /* preserveName */);
        });
      } else {
        mergeProp(symbol, prop, overlay[prop]);
      }
    });
  });
}

/**
 *
 * @param apijson
 * @deprecated
 */
function substituteSapClassInfoTypedef(apijson: ApiJSON) {
  function find(name: string) {
    return apijson.symbols.find(
      (symbol: ConcreteSymbol) => symbol.name === name,
    );
  }

  if (apijson.library === "sap.ui.core") {
    let classInfo: TypedefSymbol = find("sap.ClassInfo") as TypedefSymbol;
    if (classInfo == null) {
      let newClassInfo = {
        kind: "typedef",
        name: "sap.ClassInfo",
        basename: "ClassInfo",
        visibility: "public",
        typeParameters: [
          {
            name: "T",
          },
          {
            name: "C",
          },
        ],
        type: {
          kind: "NativeTSTypeExpression",
          type: "T & Partial<C> & ThisType<T & C>",
        },
      };
      apijson.symbols.push(newClassInfo as ConcreteSymbol);
    }
  }
}

/**
 * Convert classes sap.ui.core.Core and sap.ui.core.Configuration to namespaces, as at runtime
 * one gets instances when requiring these.
 *
 * A solution in the sources currently fails for multiple reasons:
 * - the heuristics that determine the export name of a symbol (postProcessAPiJson in the publish.js)
 *   is based on naming conventions. As sap.ui.core.Core matches the module name, it is assumed to be
 *   the default export. There's no way to give it a different export name in JSDoc.
 *   But as the default export is the core instance (sap.ui.getCore()), a different name is required
 *   for the class or interface
 * - declaring sap.ui.core.Core as a @namespace or @interface in the source might break the display
 *   in the SDK as namespaces and interfaces don't have events so far
 * - declaring a member as export of the sap/ui/core/Core module would be possible with
 *     @ name module:sap/ui/core/Core
 *     @ type sap.ui.core.Core
 *     @ member
 *
 * @param apijson
 * @param directives
 * @deprecated
 * @todo find a way to properly model this in the sources (e.g. as exported @member)
 */
function convertCoreAndConfigurationIntoANamespace(
  apijson: ApiJSON,
  directives: Directives,
) {
  apijson.symbols.forEach((symbol) => {
    if (
      ["sap.ui.core.Core", "sap.ui.core.Configuration"].includes(symbol.name) &&
      symbol.kind === "class"
    ) {
      (
        symbol as unknown as NamespaceSymbol
      ) /* here the type is being changed */.kind = "namespace";
      delete symbol.extends;
      delete symbol.final;
      // TODO more changes required?
    }
  });
  if (directives) {
    directives.namespacesToInterfaces = directives.namespacesToInterfaces || {};
    directives.namespacesToInterfaces.Core = true;
    directives.namespacesToInterfaces.Configuration = true;
  }
}

/**
 * Moves any typeParameters from a class's constructor to the class itself.
 * Newer versions of UI5 (since 1.113) will already export them like this.
 *
 * @param apijson
 */
function moveTypeParametersFromConstructorToClass(apijson: ApiJSON) {
  apijson.symbols.forEach((symbol) => {
    if (symbol.kind === "class") {
      // Newer versions of UI5 will export type parameters for classes together
      // with the class, not with the constructor as this is the most common use case.
      // Therefore, the schema for the api.json won't model the ObjConstructor#typeParameters
      // Instead, we access the constructor as "any" to access typeParameters.
      const ctor: any = symbol.constructor;
      if (
        ctor &&
        Array.isArray(ctor.typeParameters) &&
        (symbol.typeParameters == null || symbol.typeParameters.length === 0)
      ) {
        symbol.typeParameters = ctor.typeParameters;
        delete ctor.typeParameters;
      }
    }
  });
}

/**
 *
 * @param symbols
 */
function fixBasenames(symbols: ConcreteSymbol[]) {
  symbols.forEach((symbol) => {
    if (symbol.name.startsWith("module:")) {
      const basename = symbol.name.slice(symbol.name.lastIndexOf("/") + 1);
      if (symbol.basename !== basename) {
        // log.info(`fixing basename for ${val.name} from ${val.basename} to ${basename}`);
        symbol.basename = basename;
      }
    }
  });
}

/**
 * In a few cases, UI5 API functions are attached to other functions,
 * e.g. sap.ui.require.toUrl is attached to sap.ui.require.
 *
 * Ambient TypeScript declarations can't handle this pattern. Instead, such functions
 * can be placed in a synthetic namespace that has the same name as the outer
 * function (sap.ui.require in the above example):
 *
 * ```
 * declare namespace sap {
 *   namespace ui {
 *     namespace require {
 *       function toUrl(string): string
 *     }
 *   }
 * }
 * ```
 * This preprocessing detects such functions, creates a synthetic namespace and moves
 * the function into it.
 *
 * @param symbols
 */
function moveFunctionsAttachedToFunctionsIntoNamespaces(
  symbols: ConcreteSymbol[],
) {
  symbols.forEach((symbol) => {
    switch (symbol.kind) {
      case "class":
      case "namespace":
        if (symbol.methods) {
          symbol.methods = (symbol as NamespaceSymbol).methods.filter(
            (method) => {
              if (method.static && method.name.includes(".")) {
                const [pkgName, basename] = splitName(method.name);
                const namespaceName = symbol.name + "." + pkgName;
                log.verbose(
                  `moving '${method.name}' into synthetic namespace '${namespaceName}'`,
                );

                // find or create namespace
                let namespace = symbols.find(
                  (symbol) =>
                    symbol.kind === "namespace" &&
                    symbol.name === namespaceName,
                );
                if (namespace == null) {
                  symbols.push(
                    (namespace = {
                      kind: "namespace",
                      name: symbol.name + "." + pkgName,
                      basename: splitName(pkgName)[1],
                      // intentionally no resources / module / export information
                      methods: [],
                      visibility: "public",
                    }),
                  );
                } else if (namespace.methods == null) {
                  namespace.methods = [];
                }
                // move method into namespace
                method.name = basename;
                namespace.methods.push(method);

                // don't keep it in this class/namespace
                return false;
              }
              return true;
            },
          );
        }
        break;
      default:
        break;
    }
  });
}

/**
 * UI5 uses the '@namespace' tag also to describe static objects as there's no dedicated
 * tag for that in JSDoc. As such objects can't be modelled as namespaces in TypeScript,
 * they're converted here into something different.
 *
 * In the long run, those objects should be documented differently in UI5.
 *
 * - Instances of DataType are modelled as namespace, but they rather should be typedefs.
 * - Singleton objects like sap.ui.core.BusyIndicator or sap.m.InstanceManager are modelled
 *   as namespaces as there's no special tag for objects in JSDoc. We introduce such a kind
 *   'object' for the scope of this generator. In TypeScript, they're best modelled as a
 *   pair of interface and const member with the same name.
 *
 * @param symbols
 * @param directives
 */
function convertNamespacesIntoTypedefsOrInterfaces(
  symbols: ConcreteSymbol[],
  directives: Directives,
) {
  const namespacesToInterfaces =
    (directives && directives.namespacesToInterfaces) || {};

  // TODO a better check might be whether
  //  'the namespace does not have "children" with their own module'
  function isStaticObject(symbol: ConcreteSymbol) {
    // directives always win
    if (
      Object.hasOwn(namespacesToInterfaces, symbol.name) ||
      Object.hasOwn(
        namespacesToInterfaces,
        symbol.name.slice(symbol.name.lastIndexOf(".") + 1),
      )
    ) {
      return true;
    }
    if (symbol.name.startsWith("sap.ui.Device.")) {
      return false;
    }
    // if a namespace has an export, it is most likely not a real namespace
    // except when the namespace is the export of a library module (such exports are ok, though, when their name includes "Helper" or "Provider")
    if (
      symbol.module &&
      (!/\/library$/.test(symbol.module) ||
        /(?:Helper|Provider)$/.test(symbol.name)) &&
      symbol.export !== undefined
    ) {
      return true;
    }
  }
  symbols.forEach((symbol) => {
    if (symbol.kind === "namespace") {
      const metadata = symbol["ui5-metadata"];
      if (metadata && metadata.stereotype === "datatype" && metadata.basetype) {
        (
          symbol as unknown as TypedefSymbol
        ) /* here a type conversion happens */.kind = "typedef";
        symbol.type = metadata.basetype;
      } else if (isStaticObject(symbol)) {
        log.verbose(`switching namespace ${symbol.name} to static object`);
        (symbol as any) /* here a type conversion happens */.kind = "object"; // TODO: "object" kind not known yet
      }
    }
  });
}

/**
 * In the api.json, the export name of typedefs and interfaces is omitted as they are pure types
 * and the UI5 API reference so far is runtime oriented (in other words, it doesn't make sense
 * to write an AMD dependency for an interface or typedef)
 *
 * But for TypeScript, export names are also required for type-only entities.
 *
 * This method finds such entities and adds an "export" property where it makes sense.
 *
 * @param symbols
 */
function determineMissingExportsForTypes(symbols: ConcreteSymbol[]) {
  function findDefaultExport(module: ModuleName) {
    return symbols.find(
      (symbol) => symbol.module === module && symbol.export === "",
    );
  }

  function basename(fqn: string) {
    // Note: this differs from splitName(fqn)[0] as it handles module:* namepaths
    if (fqn.startsWith("module:")) {
      const p = fqn.lastIndexOf("/");
      fqn = fqn.slice(p + 1);
    }
    const p = fqn.lastIndexOf(".");
    return fqn.slice(p + 1);
  }

  symbols.forEach((symbol) => {
    // skip symbols that are not interface or typedefs
    // or symbols for which the containing module is not known
    // or for which the export name has already been determined
    if (
      (symbol.kind !== "interface" && symbol.kind !== "typedef") ||
      !symbol.module ||
      symbol.export !== undefined
    ) {
      return;
    }

    const defaultExport = findDefaultExport(symbol.module);
    // if there's a default export for the same module and if the global name of that
    // export is a prefix of the symbol's name, then the remainder of the symbol's name
    // is a good candidate for the export name
    if (defaultExport && symbol.name.startsWith(defaultExport.name + ".")) {
      symbol.export = symbol.name.slice(defaultExport.name.length + 1);
    } else {
      // non-canonical names need to be reported at least
      // TODO consumers need some documentation about the necessary imports (SDK enhancement?)
      log.warn(
        `**** symbol ${symbol.name} exported from "${
          symbol.module
        }" as "${basename(symbol.name)}"`,
      );
      symbol.export = basename(symbol.name);
    }
  });
}

/**
 * Recursively visits all symbols and their parts and converts any
 * JSDoc type expression (string) into an AST.
 *
 * @param symbols
 */
function parseTypeExpressions(symbols: ConcreteSymbol[]) {
  const typeParser = new TypeParser(new TSASTTypeBuilder());

  /**
   * If `obj` has a property `type` with a string value, that string is parsed as
   * a JSDoc type expression, converted into an AST and the root node of the resulting
   * AST is set as new value of the `type` property.
   *
   * @param obj
   */
  function visitAnythingWithAType(obj: { type?: string | any }) {
    if (typeof obj.type === "string") {
      try {
        const result = typeParser.parse(obj.type);
        obj.type = result;
      } catch (err) {
        log.error(`failed to parse type string ${obj.type}: ${err.message}`);
      }
    }
  }

  function visitTypeReference(ref: string) {
    return ref;
  }

  function visitProperty(prop) {
    visitAnythingWithAType(prop);
    if (prop.properties) {
      Object.keys(prop.properties).forEach((propName) => {
        visitProperty(prop.properties[propName]);
      });
    }
  }

  function visitTypeParam(typeParam) {
    if (typeParam.type) {
      visitAnythingWithAType(typeParam);
    }
    if (typeof typeParam.default === "string") {
      try {
        const result = typeParser.parse(typeParam.default);
        typeParam.default = result;
      } catch (err) {
        log.error(
          `failed to parse type string ${typeParam.default}: ${err.message}`,
        );
      }
    }
  }

  function visitParam(param) {
    visitAnythingWithAType(param);
    if (param.parameterProperties) {
      Object.keys(param.parameterProperties).forEach((propName) => {
        visitParam(param.parameterProperties[propName]);
      });
    }
  }

  function visitMethod(method: ObjMethod) {
    if (Array.isArray(method.typeParameters)) {
      method.typeParameters.forEach(visitTypeParam);
    }
    if (method.returnValue) {
      visitAnythingWithAType(method.returnValue);
    }
    if (Array.isArray(method.parameters)) {
      method.parameters.forEach(visitParam);
    }
    if (Array.isArray(method.throws)) {
      method.throws.forEach(visitAnythingWithAType);
    }
  }

  function visitEvent(event: Ui5Event) {
    if (Array.isArray(event.parameters)) {
      event.parameters.forEach(visitParam);
    }
  }

  function visitMember(member: ObjProperty) {
    visitAnythingWithAType(member);
  }

  function visitClass(symbol: ClassSymbol) {
    if (symbol.extends) {
      symbol.extends = visitTypeReference(symbol.extends);
    }
    if (symbol.implements) {
      symbol.implements = symbol.implements.map((intf: string) => {
        return visitTypeReference(intf);
      });
    }
    if (Array.isArray(symbol.typeParameters)) {
      symbol.typeParameters.forEach(visitTypeParam);
    }
    if (Object.hasOwnProperty.call(symbol, "constructor")) {
      // check for own property to ignore standard prototype property 'constructor'
      visitMethod(symbol.constructor);
    }
    if (symbol.methods) {
      symbol.methods.forEach(visitMethod);
    }
    if (symbol.events) {
      symbol.events.forEach(visitEvent);
    }
    if (symbol.properties) {
      symbol.properties.forEach(visitMember);
    }
    const metadata = symbol["ui5-metadata"];
    if (metadata) {
      if (metadata.properties) {
        metadata.properties.forEach((prop: Ui5Property) => {
          visitAnythingWithAType(prop);
        });
      }
      if (metadata.aggregations) {
        metadata.aggregations.forEach((aggr: Ui5Aggregation) => {
          visitAnythingWithAType(aggr);
        });
      }
      if (metadata.associations) {
        metadata.associations.forEach((assoc: Ui5Association) => {
          visitAnythingWithAType(assoc);
        });
      }
      if (metadata.events) {
        metadata.events.forEach((event: Ui5Event) => {
          visitEvent(event);
        });
      }
    }
  }

  function visitTypedef(typedef: TypedefSymbol) {
    if ("type" in typedef && typedef.type) {
      visitAnythingWithAType(typedef);
    }
    if ("extends" in typedef && typedef.extends) {
      typedef.extends = visitTypeReference(typedef.extends);
    }
    if (typedef.properties) {
      typedef.properties.forEach((member) => {
        visitProperty(member);
      });
    }
    if (typedef.returnValue) {
      visitAnythingWithAType(typedef.returnValue);
    }
    if (typedef.parameters) {
      typedef.parameters.forEach((param) => {
        visitAnythingWithAType(param);
      });
    }
  }

  function visitEnum(symbol: EnumSymbol) {
    if (symbol.properties) {
      symbol.properties.forEach((member) => {
        if (member.type === "undefined") {
          member.type = "string";
        }
        visitAnythingWithAType(member);
      });
    }
  }

  symbols.forEach((symbol: ConcreteSymbol) => {
    switch (symbol.kind) {
      case "class":
      case "interface":
      case "namespace":
      case "object":
        visitClass(symbol as ClassSymbol); // TODO: look into this api.json-related type cast
        break;
      case "typedef":
        visitTypedef(symbol);
        break;
      case "enum":
        visitEnum(symbol);
        break;
      case "function":
        visitMethod(symbol);
        break;
      default:
        log.warn(
          `  found top level symbol of unhandled kind '${symbol.kind}': ${symbol.name}`,
        );
        throw new Error(
          `symbol of unhandled kind '${symbol.kind}': ${symbol.name}`,
        );
    }
  });
}

function addForwardDeclarations(apijson: ApiJSON, directives: Directives) {
  const symbolExists = (fqn: string) =>
    apijson.symbols.some((symbol) => symbol.name === fqn);
  const forwardDecls =
    directives &&
    directives.forwardDeclarations &&
    directives.forwardDeclarations[apijson.library];
  if (Array.isArray(forwardDecls)) {
    forwardDecls.forEach((decl) => {
      if (!symbolExists(decl.name)) {
        decl.basename = decl.basename || splitName(decl.name)[1];
        decl.visibility = decl.visibility || "public";
        apijson.symbols.unshift(decl);
        log.verbose(`adding forward declaration for ${decl.name}`);
      }
    });
  }
}

/**
 * To enable code completion for the dependency parameter of the sap.ui.define
 * API, an interface `sap.IUI5DefineDependencyNames` is generated whose members
 * each represent a known, valid module name. The dependency parameter then can be
 * typed as `Array<keyof sap.IUI5DefineDependencyNames>`.
 *
 * An interface was chosen over an enum as an interface can be enriched by each
 * library d.ts file.
 *
 * A member is created for each module that occurs in the library's symbols,
 * as long as one of the symbols is visible (public or protected or restricted).
 * It is not necessary that the module has an AMD Export as even global-only
 * symbols justify an import of a module.
 *
 * For library internal development, even private APIs would justify a member.
 *
 * @param symbols
 */
function addInterfaceWithModuleNames(symbols: ConcreteSymbol[]) {
  const modules = new Set();
  symbols.forEach((symbol: ConcreteSymbol) => {
    if (
      ["public", "protected", "restricted"].includes(symbol.visibility) &&
      symbol.module
    ) {
      modules.add(symbol.module);
    }
  });

  // avoid empty interfaces (dtslint 'no-empty-interface')
  if (modules.size === 0) {
    return;
  }

  function compareIgnoreCase(a: string, b: string) {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la !== lb) {
      return la < lb ? -1 : 1;
      return 0;
    }
    if (a !== b) {
      return a < b ? -1 : 1;
    }
    return 0;
  }

  const intf: InterfaceSymbol = {
    kind: "interface",
    name: "sap.IUI5DefineDependencyNames",
    basename: "IUI5DefineDependencyNames",
    properties: [...modules.values()].sort(compareIgnoreCase).map((mod) => ({
      name: `"${mod}"`,
      type: "undefined",
      visibility: "public",
    })),
    visibility: "public",
    __isNotAMarkerInterface: true,
  };

  symbols.push(intf);
}

function addImplicitNamespaces(json: ApiJSON) {
  const symbolTable: { [name: string]: ConcreteSymbol } = {};
  json.symbols.forEach((val, key) => {
    if (val.kind === "namespace") {
      symbolTable[val.name] = val;
    }
  });

  json.symbols.forEach((symbol) => {
    const fullFQN = symbol.name;
    if (fullFQN.startsWith("module:")) {
      return;
    }
    const nameParts = _.dropRight(fullFQN.split("."));
    if (_.isEmpty(nameParts)) {
      return;
    }

    const restNames = _.drop(nameParts);
    let currFQN = _.first(nameParts);
    if (_.has(symbolTable, currFQN) === false) {
      json.symbols.push(
        (symbolTable[currFQN] = {
          kind: "namespace",
          basename: currFQN,
          name: currFQN,
          visibility: "public",
          synthetic: true,
        }),
      );
    }

    restNames.forEach((currNamePart) => {
      currFQN += `.${currNamePart}`;
      if (_.has(symbolTable, currFQN) === false) {
        json.symbols.push(
          (symbolTable[currFQN] = {
            kind: "namespace",
            basename: currNamePart,
            name: currFQN,
            visibility: "public",
            synthetic: true,
          }),
        );
      }
    });
  });
}

function removeBadSymbols(json: ApiJSON, badSymbols: string[]) {
  const badSymbolsRecords = _.reduce(
    badSymbols,
    (result: { [fqn: string]: boolean }, fqn) => {
      result[fqn] = true;
      return result;
    },
    {},
  );

  json.symbols = json.symbols.filter((sym) => {
    return !badSymbolsRecords[sym.name];
  });
}

/**
 * In case a interface is tagged as restricted, we should remove it from the classes that uses it
 * @param json
 */
function removeRestrictedInterfaces(json: ApiJSON) {
  const restrictedInterfaces = _(json.symbols)
    .filter(
      (symbol) =>
        symbol.kind === "interface" && symbol.visibility === "restricted",
    )
    .map((symbol) => symbol.name)
    .value();
  json.symbols.forEach((symbol) => {
    if (symbol.kind === "class" && !_.isEmpty(symbol.implements)) {
      _.remove(
        symbol.implements,
        (implementName) => restrictedInterfaces.indexOf(implementName) != -1,
      );
    }
  });
}

function removeRestrictedSymbols(json: ApiJSON) {
  const isPublic = (symbol: ConcreteSymbol) =>
    symbol.visibility === "public" || symbol.visibility === "protected";
  json.symbols = _.filter(json.symbols, isPublic);
}

function removeRestrictedMembers(json: ApiJSON) {
  const isPublic = (member: ConcreteSymbol) =>
    !member.tsSkip &&
    (member.visibility === "public" || member.visibility === "protected");
  json.symbols.forEach((symbol) => {
    if (symbol.properties) {
      symbol.properties = _.filter(symbol.properties, isPublic);
    }
    if (symbol.methods) {
      symbol.methods = _.filter(symbol.methods, isPublic);
    }
    if (symbol.events) {
      symbol.events = _.filter(symbol.events, isPublic);
    }
  });
}

/**
 * The map `deprecatedEnumAliases`, which is part of the directives, can list deprecated enums
 * for which a special type alias should be generated.
 *
 * In this method, the aliases are added to those enums, both as a marker and as input for
 * later generation of the alias.
 *
 * @param symbols Array of symbols for a library
 * @param directives Directives for all libraries
 */
function markDeprecatedAliasesForEnums(
  symbols: ConcreteSymbol[],
  directives: Directives,
) {
  const deprecatedEnumAliases = directives.deprecatedEnumAliases;
  symbols.forEach((symbol) => {
    if (symbol.kind === "enum" && symbol.name in deprecatedEnumAliases) {
      symbol.deprecatedAliasFor = deprecatedEnumAliases[symbol.name];
    }
  });
}

function _prepareApiJson(
  json: ApiJSON,
  directives: Directives,
  options = { mainLibrary: false, generateGlobals: false },
) {
  mergeOverlays(json, directives, { generateGlobals: options.generateGlobals });
  substituteSapClassInfoTypedef(json);
  convertCoreAndConfigurationIntoANamespace(json, directives);
  moveTypeParametersFromConstructorToClass(json);
  fixBasenames(json.symbols);
  moveFunctionsAttachedToFunctionsIntoNamespaces(json.symbols);
  convertNamespacesIntoTypedefsOrInterfaces(json.symbols, directives);
  determineMissingExportsForTypes(json.symbols);
  parseTypeExpressions(json.symbols);
  markDeprecatedAliasesForEnums(json.symbols, directives);
  if (options.mainLibrary) {
    addForwardDeclarations(json, directives);
    addInterfaceWithModuleNames(json.symbols);
  }
  return json;
}

function _fixApiJson(json: ApiJSON, badSymbols: string[]) {
  addImplicitNamespaces(json);
  removeBadSymbols(json, badSymbols);
  removeRestrictedInterfaces(json);
  removeRestrictedSymbols(json);
  removeRestrictedMembers(json);
  return json;
}

/**
 *
 * @param targetLibJson
 * @param dependencies
 * @param directives
 *
 * @returns void
 */
export function fixApiJsons(
  targetLibJson: ApiJSON,
  dependencies: ApiJSON[],
  directives: Directives,
  generateGlobals?: boolean,
) {
  // Part 1: "prepare JSON"
  let targetLibFixedJson = _prepareApiJson(targetLibJson, directives, {
    mainLibrary: true,
    generateGlobals,
  });

  let depsFixedJsons: ApiJSON[] = dependencies.map((depjson) => {
    const key = `${depjson.library}-${depjson.version}`;
    let preparedjson = preparedCache.get(key);
    if (!preparedjson) {
      preparedjson = _prepareApiJson(depjson, directives, {
        mainLibrary: false,
        generateGlobals,
      });
      preparedCache.set(key, preparedjson);
    }
    return JSON.parse(JSON.stringify(preparedjson)); // cloning needed to avoid multiple processing within the subsequent steps; // TODO: but this can likely be improved
  });

  // Part 2: add interfaces for settings objects and event parameter objects
  addConstructorSettingsInterfaces(targetLibFixedJson, depsFixedJsons);
  addEventParameterInterfaces(targetLibFixedJson, depsFixedJsons);

  // Part 3: "fix JSON"
  targetLibFixedJson = _fixApiJson(targetLibFixedJson, directives.badSymbols);
  depsFixedJsons = depsFixedJsons.map((dep) =>
    _fixApiJson(dep, directives.badSymbols),
  );

  return { targetLibFixedJson, depsFixedJsons };
}
