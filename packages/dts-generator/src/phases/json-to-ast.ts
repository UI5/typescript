import { getLogger } from "@ui5/logger";
const log = getLogger("@ui5/dts-generator/jsonToAst");
import _ from "lodash";
import {
  ApiJSON,
  ClassSymbol,
  ConcreteSymbol,
  Deprecated,
  EnumProperty,
  EnumSymbol,
  Experimental,
  InterfaceSymbol,
  NamespaceSymbol,
  NestedProperties,
  ObjCallableParameter,
  ObjMethod,
  ObjProperty,
  ObjectSymbol,
  ReturnValue,
  TypedefSymbol,
  Ui5Property,
} from "../types/api-json.js";
import {
  ArrayType,
  AstNode,
  Class,
  DeprecatedDesc,
  Enum,
  ExperimentalDesc,
  Export,
  Expression,
  FunctionDesc,
  FunctionType,
  Import,
  Interface,
  IntersectionType,
  LiteralType,
  Module,
  Namespace,
  NativeTSTypeExpression,
  Parameter,
  Property,
  ReturnDesc,
  Type,
  TypeAliasDeclaration,
  TypeLiteral,
  TypeParameter,
  TypeReference,
  UI5AstRoot,
  UnionType,
  Variable,
  VariableWithValue,
} from "../types/ast.js";
import { assertKnownProps } from "../utils/runtime-checks.js";

let silent = false;
function verbose(...msg: (string | object)[]) {
  if (!silent) {
    log.info(...msg);
  }
}

function warn(...msg: (string | object)[]) {
  if (!silent) {
    log.warn(...msg);
  }
}

// global config
let generateGlobals = false;
let typeUniverse: TypeUniverse;

export function jsonToAst(
  jsonObj: ApiJSON,
  dependencies: ApiJSON[],
  options = { isDependency: false, generateGlobals: false },
): UI5AstRoot {
  silent = !!options.isDependency;
  generateGlobals = !!options.generateGlobals;
  typeUniverse = new TypeUniverse(jsonObj, dependencies);

  const ast = {
    version: jsonObj.version,
    modules: buildModules(jsonObj, dependencies, typeUniverse),
    topLevelNamespace: buildNamespace(jsonObj.symbols, "sap"),
  };

  // resolve global names inside namespaces
  new GlobalsVisitor(typeUniverse, generateGlobals).visit(
    ast.topLevelNamespace,
  );

  return ast;
}

function basename(fqn: string) {
  if (fqn.startsWith("module:")) {
    const p = fqn.lastIndexOf("/");
    fqn = fqn.slice(p + 1);
  }
  const p = fqn.lastIndexOf(".");
  return fqn.slice(p + 1);
}

/**
 * Set of qualified names for which no import should be chosen.
 *
 * @todo add a module to sap.ui.core api.json or move to directives?
 */
const NO_IMPORT_NAMES: { [name: string]: boolean } = {
  jQuery: true,
  "jQuery.Deferred": true,
  "jQuery.Event": true,
  "jQuery.Promise": true,
};

/**
 * Map of global names that are likely to conflict with local entity names,
 * mapped to a replacement name. The replacement name must have been declared
 * in the manually coded prolog of the sap.ui.core d.ts file.
 *
 * @todo read from .dtsgenrc
 */
const ALTERNATIVE_GLOBAL_NAMES: { [name: string]: string } = {
  Element: "global_Element",
};

/**
 * Map of alternative local names that shall be used when the basename (last name segment)
 * cannot be used due to naming conflicts. This map only helps to get more readable d.ts files
 * (as UI5Element can be understood more easily than Element1).
 *
 * @todo read from .dtsgenrc
 */
const ALTERNATIVE_LOCAL_NAMES: { [name: string]: string } = {
  "sap.ui.core.Element": "UI5Element",
  "sap.ui.base.Object": "BaseObject",
};

function isKnownGlobal(fqn: string) {
  return (
    !fqn.includes(".") || // @todo mistakenly accepts 'sap'
    !fqn.startsWith("sap") || // @todo fails if a non-SAP global uses dot notation, e.g. Intl.DateTimeFormat
    fqn === "sap.ClassInfo" // @todo no hard coded knowledge, move to .dtsgenrc?
  );
}

class ASTVisitor {
  mode: "default" | "type-alias";

  visit(ast: AstNode) {
    this.mode = "default";
    switch (ast.kind) {
      case "Namespace":
        this._visitNamespace(ast as Namespace);
        break;
      case "Class":
        this._visitClass(ast as Class);
        break;
      case "Interface":
        this._visitInterface(ast as Interface);
        break;
      case "FunctionDesc":
        this._visitFunction(ast as FunctionDesc);
        break;
      case "Enum":
        this._visitEnum(ast as Enum);
        break;
      case "Import":
        this._visitImport(ast as Import);
        break;
      case "TypeAliasDeclaration":
        this._visitTypedef(ast as TypeAliasDeclaration);
        break;
      case "Variable":
        this._visitField(ast as Variable);
        break;
      default:
        verbose(
          "json-to-ast.ASTVisitor#visit: unhandled kind of export",
          ast.kind,
          (ast as any).name,
        );
        break;
    }
  }
  /**
   * @param namespace
   */
  _visitNamespace(namespace: Namespace) {
    _.forEach(namespace.namespaces, (childNamespace) =>
      this._visitNamespace(childNamespace),
    );
    _.forEach(namespace.variables, (variable) => this._visitField(variable));
    _.forEach(namespace.functions, (fct) => this._visitFunction(fct));
    _.forEach(namespace.classes, (clazz) => this._visitClass(clazz));
    _.forEach(namespace.interfaces, (intf) => this._visitInterface(intf));
    _.forEach(namespace.enums, (_enum) => this._visitEnum(_enum));
    _.forEach(namespace.typedefs, (typedef) => this._visitTypedef(typedef));
  }
  /**
   * @param clazz
   */
  _visitClass(clazz: Class) {
    _.forEach(clazz.typeParameters, (typeParam) =>
      this._visitTypeParam(typeParam),
    );
    if (clazz.extends) {
      clazz.extends = this._visitTypeName(clazz.extends, "extends");
    }
    clazz.implements = _.map(clazz.implements, (intf) =>
      this._visitTypeName(intf, "implements"),
    );
    _.forEach(clazz.constructors, (ctor) => this._visitFunction(ctor));
    _.forEach(clazz.fields, (field) => this._visitField(field));
    _.forEach(clazz.methods, (method) => this._visitFunction(method));
  }
  /**
   * @param intf
   */
  _visitInterface(intf: Interface) {
    if (Array.isArray(intf.extends)) {
      intf.extends = _.map(intf.extends, (base) =>
        this._visitTypeName(base, "extends"),
      );
    }
    _.forEach(intf.props, (prop) => this._visitField(prop));
    _.forEach(intf.methods, (method) => this._visitFunction(method));
  }
  /**
   * @param _enum
   */
  _visitEnum(_enum: Enum) {
    // nothing to do for an Enum
  }
  _visitTypedef(typedef: TypeAliasDeclaration) {
    if (typedef.type) {
      const oldMode = this.mode;
      if (typedef.type.kind === "TypeReference") {
        this.mode = "type-alias";
      }
      this._visitType(typedef.type);
      this.mode = oldMode;
    }
    _.forEach(typedef.properties, (prop) => this._visitField(prop));
  }
  _visitImport(_import: Import) {
    // nothing to do for an Import
  }
  _visitField(field: Variable | Property) {
    this._visitType(field.type);
  }
  /**
   * @param fct
   */
  _visitFunction(fct: FunctionDesc) {
    _.forEach(fct.typeParameters, (typeParam) =>
      this._visitTypeParam(typeParam),
    );
    _.forEach(fct.parameters, (param) => this._visitParam(param));
    if (fct.returns && fct.returns.type) {
      this._visitType(fct.returns.type);
    }
    _.forEach(fct.throws, (ex) => this._visitException(ex));
  }
  _visitTypeParam(typeParam) {
    if (typeParam.constraint) {
      this._visitType(typeParam.constraint);
    }
    if (typeParam.default) {
      this._visitType(typeParam.default);
    }
  }
  _visitParam(param) {
    this._visitType(param.type);
  }
  _visitException(ex) {
    this._visitType(ex.type);
  }
  /**
   * @param typeName
   * @returns
   */
  _visitTypeName(typeName: string, usage?) {
    return typeName;
  }
  _visitType(type: Type) {
    switch (type.kind) {
      case "TypeReference":
        this._visitTypeReference(type);
        break;
      case "ArrayType":
        this._visitArrayType(type);
        break;
      case "LiteralType":
        this._visitLiteralType(type);
        break;
      case "TypeLiteral":
        this._visitTypeLiteral(type);
        break;
      case "UnionType":
        this._visitUnionType(type);
        break;
      case "IntersectionType":
        this._visitIntersectionType(type);
        break;
      case "FunctionType":
        this._visitFunctionType(type);
        break;
      case "NativeTSTypeExpression":
        // Note: nodes of this kind should not occur in json-to-ast phase
        this._visitNativeTSTypeExpression(type);
        break;
      default:
        verbose("ASTVisitor#visitType: unhandled kind of type", type);
        throw new TypeError(`Unexpected kind of type: ${(type as Type).kind}`);
    }
  }
  _visitTypeReference(type: TypeReference) {
    type.typeName = this._visitTypeName(type.typeName, "type");
    if (_.isArray(type.typeArguments)) {
      _.forEach(type.typeArguments, (typeArg) => this._visitType(typeArg));
    }
  }
  _visitArrayType(type: ArrayType) {
    this._visitType(type.elementType);
  }
  _visitLiteralType(type: LiteralType) {}
  _visitTypeLiteral(type: TypeLiteral) {
    _.forEach(type.members, (prop) => this._visitType(prop.type));
  }
  _visitUnionType(type: UnionType) {
    _.forEach(type.types, (variant) => this._visitType(variant));
  }
  _visitIntersectionType(type: IntersectionType) {
    _.forEach(type.types, (variant) => this._visitType(variant));
  }
  _visitFunctionType(type: FunctionType) {
    _.forEach(type.parameters, (param) => this._visitParam(param));
    if (type.type) {
      this._visitType(type.type);
    }
  }
  _visitNativeTSTypeExpression(type: NativeTSTypeExpression) {}
}

class TypeUniverse {
  types: { [typeName: string]: ConcreteSymbol };

  constructor(mainJson: ApiJSON, dependencies: ApiJSON[]) {
    this.types = {};
    const addAll = (symbols: ConcreteSymbol[]) =>
      symbols.forEach(this.add, this);
    addAll(mainJson.symbols);
    dependencies && dependencies.forEach((lib) => addAll(lib.symbols));
  }
  add(symbol: ConcreteSymbol) {
    if (!symbol.synthetic) {
      this.types[symbol.name] = symbol;
    }
  }
  get(fqn: string) {
    return this.types[fqn];
  }
}

/**
 * An AST visitor that converts references to global symbols (e.g. "sap.ui.core.Control")
 * to imports on module level ("import Control from sap/ui/coreControl").
 *
 * As an additional task, it marks any usage of UI5 standard enums in parameter positions
 * as such. dts-code-gen will use this information to rewrite the type to a more convenient
 * type that also allows string literals.
 */
class ConvertGlobalsToImports extends ASTVisitor {
  #scopeBuilder: ModuleBuilder | NamespaceBuilder;

  /**
   *
   * @param scopeBuilder
   */
  constructor(scopeBuilder: ModuleBuilder | NamespaceBuilder) {
    super();
    this.#scopeBuilder = scopeBuilder;
  }
  _import(name: string, fallbackToAny: boolean) {
    return this.#scopeBuilder.import(name, fallbackToAny);
  }
  _isStandardEnum(type) {
    const symbolForType = (
      this.#scopeBuilder.topLevelScope as ModuleBuilder
    ).typeUniverse.get(type);
    return (
      (symbolForType != null &&
        symbolForType["ui5-metadata"] != null &&
        symbolForType["ui5-metadata"].stereotype === "enum") ||
      (generateGlobals === false &&
        symbolForType != null &&
        symbolForType.deprecatedAliasFor &&
        this._isStandardEnum(symbolForType.deprecatedAliasFor))
    );
  }
  _visitTypeName(typeName: string, usage: string) {
    return this._import(
      typeName,
      usage !== "extends" && usage !== "implements",
    );
  }
  _visitEnum(_enum: Enum) {
    if (_enum.deprecatedAliasFor) {
      _enum.deprecatedAliasFor = this._visitTypeName(
        _enum.deprecatedAliasFor,
        "alias",
      );
    }
  }
  _visitTypeReference(type) {
    if (this.mode !== "type-alias") {
      type.isStandardEnum = this._isStandardEnum(type.typeName);
    }
    super._visitTypeReference(type);
  }
}

/**
 * @class ScopeBuilder
 */
abstract class ScopeBuilder {
  name: string;
  localNames: { [name: string]: boolean | string };
  invertedLocalNames: { [name: string]: string };
  nestedScopes: { [nestedScopeName: string]: ModuleBuilder | NamespaceBuilder };

  /**
   * @param name Name of the module which is created
   */
  constructor(name: string) {
    this.name = name;
    this.localNames = {};
    this.invertedLocalNames = {};
    this.nestedScopes = {};
    // TODO rather collect and reserve all native, global names from signatures
    this.localNames["Function"] = true; // prevent naming clash with builtin Function
    this.localNames["Date"] = true; // prevent naming clash with builtin Date
    this.localNames["String"] = true; // prevent naming clash with builtin String
    this.localNames["Number"] = true; // prevent naming clash with builtin Number
    this.localNames["Boolean"] = true; // prevent naming clash with builtin Boolean
    this.localNames["Object"] = true; // prevent naming clash between base.Object and JavaScript Object
    this.localNames["Element"] = true; // prevent naming clash between core.Element and DOM Element
  }
  createUniqueLocalName(
    candidateName: string,
    fqn?: string,
    canRename: boolean = true,
  ) {
    let localName = candidateName;
    if (!canRename) {
      if (localName in this.localNames && this.localNames[localName] !== true) {
        throw new Error(
          `Naming conflict: export name ${localName} already exists in ${this.name}`,
        );
      }
      // for named exports or namespace members, new names or built-in names are okay
      return localName;
    }

    if (
      localName in this.localNames &&
      fqn &&
      fqn in ALTERNATIVE_LOCAL_NAMES &&
      !(ALTERNATIVE_LOCAL_NAMES[fqn] in this.localNames)
    ) {
      localName = ALTERNATIVE_LOCAL_NAMES[fqn];
    }
    let count = 0;
    while (localName in this.localNames) {
      localName = candidateName + ++count;
    }
    return localName;
  }

  get topLevelScope(): ScopeBuilder {
    return this;
  }

  /**
   * @param nestedScopeName
   * @returns
   */
  getNestedScope(nestedScopeName: string): ScopeBuilder {
    let nestedScope = this.nestedScopes[nestedScopeName];
    if (nestedScope == null) {
      nestedScope = new NamespaceBuilder(nestedScopeName, this);
      this.nestedScopes[nestedScopeName] = nestedScope;
      verbose(
        `json-to-ast#getNestedScope: export ${nestedScope.name} as '${nestedScopeName}' of module ${this.name}`,
      );
    }
    return nestedScope;
  }
  abstract addExport(exportName: string, ast: Expression);
  export(
    symbol,
    exportName = symbol.export,
    canRename: boolean = exportName === "",
  ) {
    // if the export name is a qualified name, then determine the next nested scope
    // (the submodule) and delegate the export() call to it
    if (exportName.indexOf(".") > 0) {
      const scopeName = exportName.slice(0, exportName.indexOf("."));
      exportName = exportName.slice(exportName.indexOf(".") + 1);
      return this.getNestedScope(scopeName).export(symbol, exportName, false); // can't rename namespace members
    }

    // determine what to export
    let exportedChild: Expression;
    // enums or interfaces from objects should be exported as static variables in the default export
    let exportAsStaticVariable: boolean;
    if (symbol.kind === "class") {
      exportedChild = buildClass(symbol);
    } else if (symbol.kind === "enum") {
      exportedChild = buildEnum(symbol);
      // only library enums are exported directly from the module,
      // all other enums become static variables in the default export
      //   => enums (e.g. sap/m/MessageBox.Action or sap/ui/core/XMLView.PreprocessorType)
      exportAsStaticVariable = !exportedChild.isLibraryEnum;
    } else if (symbol.kind === "interface") {
      exportedChild = buildInterface(symbol);
    } else if (symbol.kind === "function") {
      exportedChild = buildFunction(symbol);
    } else if (symbol.kind === "object") {
      exportedChild = buildInterfaceFromObject(symbol);
      // static objects are not exported directly from the module and
      // are exported as static variable as part of the default export
      //   => static object (e.g. sap/ui/core/Element.registry)
      exportAsStaticVariable = exportedChild.isStaticObject;
    } else if (symbol.kind === "namespace") {
      if (symbol.properties) {
        symbol.properties.forEach((prop) => {
          if (prop.module && prop.module !== symbol.module) {
            verbose(
              `omit property ${prop.name} from exports of ${symbol.module}, it's exported or exposed as member individually`,
            );
            return;
          }
          prop.kind = "variable";
          this.export(prop, exportName + "." + prop.name);
        });
      }
      if (symbol.methods) {
        symbol.methods.forEach((method) => {
          if (method.module && method.module !== symbol.module) {
            verbose(
              `omit function ${method.name} from exports of ${symbol.module}, it's exported or exposed as member individually`,
            );
            return;
          }
          method.kind = "function";
          this.export(method, exportName + "." + method.name);
        });
      }
      exportAsStaticVariable = this["exports"]?.[""];
      if (exportAsStaticVariable) {
        const nestedScope = this.getNestedScope(exportName) as NamespaceBuilder;
        const ns = nestedScope?.namespace;
        if (ns) {
          ns.export = false;
        }
      }
    } else if (symbol.kind === "typedef") {
      exportedChild = buildTypedef(symbol);
    } else if (symbol.kind === "variable") {
      exportedChild = buildVariable(symbol);
    }

    if (exportAsStaticVariable && this["exports"]?.[""]) {
      const astNode = buildStaticVariable(symbol, this["typeUniverse"]);
      const expression = this["exports"][""].expression;
      if (expression.kind === "Interface") {
        expression.props.push(astNode);
      } else {
        expression.fields.push(astNode);
      }
    }

    if (exportedChild) {
      verbose(
        `json-to-ast#export: export '${symbol.kind}' '${symbol.name}' as '${exportedChild.kind}' '${exportName}' of module ${this.name}`,
      );
    } else {
      verbose(
        `json-to-ast#export: unhandled '${symbol.kind}' '${symbol.name}'`,
      );
    }

    let localName = this.createUniqueLocalName(
      basename(symbol.name),
      symbol.name,
      canRename,
    );
    this.localNames[localName] = symbol.name;
    this.invertedLocalNames[symbol.name] = localName;
    if (exportedChild) {
      exportedChild.name = localName;
      this.addExport(exportName, exportedChild);
    }
  }
}

/**
 * Builds a module and its exports.
 *
 * @class ModuleBuilder
 */
class ModuleBuilder extends ScopeBuilder {
  typeUniverse: TypeUniverse;
  imports: { [importName: string]: Import };
  exports: { [exportName: string]: Export };

  /**
   * @param name Name of the module which is created
   * @param typeUniverse Map of api.json symbols keyed by their unique name
   */
  constructor(name: string, typeUniverse: TypeUniverse) {
    super(name);
    this.typeUniverse = typeUniverse;
    this.imports = {};
    this.exports = {};
  }
  addExport(exportName: string, ast: Expression) {
    let _export = this.exports[exportName];
    if (_export != null) {
      const oldKind = _export.expression && _export.expression.kind;
      const newKind = ast && ast.kind;
      log.error(
        `**** duplicate export name '${exportName}' (${oldKind} and ${newKind})`,
      );
    } else {
      let exp = true;
      if (ast.kind === "Enum") {
        exp = ast.isLibraryEnum;
      }
      _export = this.exports[exportName] = {
        kind: "Export",
        export: exp || exportName == "",
        asDefault: exportName == "",
        expression: undefined,
      };
    }
    _export.expression = ast;
  }
  import(fqn: string, fallbackToAny: boolean = true) {
    if (fqn == null || NO_IMPORT_NAMES[fqn]) {
      return fqn;
    }
    let symbol = this.typeUniverse.get(fqn);
    if (symbol == null || symbol.module == null || symbol.export == null) {
      if (symbol == null && !isKnownGlobal(fqn)) {
        if (fallbackToAny) {
          verbose(`Cannot find symbol for ${fqn}, falling back to 'any'`);
          return `/* was: ${fqn} */ any`;
        } else {
          verbose(`Cannot find symbol for ${fqn}, falling back to 'Object'`);
          return `/* was: ${fqn} */ Object`;
        }
      } else if (symbol != null) {
        verbose(
          `Cannot import ${fqn} from '${symbol.module}' (no export name found), keeping global name`,
        );
      }
      return fqn;
    }
    if (fqn in this.invertedLocalNames) {
      return this.invertedLocalNames[fqn];
    }

    let importName;
    if (!generateGlobals || fqn.startsWith("module:")) {
      importName = this.createUniqueLocalName(basename(fqn), fqn);
      let exportName = symbol.export;
      if (symbol.module !== this.name) {
        let moduleImport = this.imports[symbol.module];
        if (moduleImport == null) {
          this.imports[symbol.module] = moduleImport = {
            kind: "Import",
            module: symbol.module,
            mappings: {},
          };
        }
        if (exportName.indexOf(".") >= 0) {
          const exportNamespace = exportName.slice(0, exportName.indexOf("."));
          exportName = exportName.slice(exportName.indexOf(".") + 1);
          const importNamespace = this.createUniqueLocalName(exportNamespace);
          importName = importNamespace + "." + exportName;
          moduleImport.mappings[importNamespace] = exportNamespace;
        } else {
          // special case to handle enums exported as static properties, they are imported
          // via the default export of the respective module (therefore the export name is
          // prefixed with the default import name)
          if (
            !moduleImport.module.endsWith("/library") &&
            exportName != "" &&
            symbol.kind === "enum"
          ) {
            const defaultFQN = fqn.substring(0, fqn.lastIndexOf("."));
            const defaultImportName =
              this.invertedLocalNames[defaultFQN] ||
              this.createUniqueLocalName(basename(defaultFQN), defaultFQN);
            moduleImport.mappings[defaultImportName] = "";
            // as we have no other possibility ro return information about the type of the import
            // we attach a property to the string which is used in the genType function to include
            // the typeof for the type
            importName = Object.assign(`${defaultImportName}.${exportName}`, {
              isStaticObject: true,
            });
          } else {
            moduleImport.mappings[importName] = exportName;
          }
        }
      } else if (exportName.indexOf(".") >= 0) {
        importName = exportName;
      }
    } else {
      importName = fqn;
    }
    this.localNames[importName] = fqn;
    this.invertedLocalNames[fqn] = importName;
    return importName;
  }
  toAST(): Module {
    this._resolveGlobals();
    return {
      kind: "Module",
      name: this.name,
      imports: Object.values(this.imports),
      exports: Object.values(this.exports),
      namespaces: _.map(this.nestedScopes, (scope) =>
        (scope as NamespaceBuilder).toAST(),
      ),
    };
  }
  _resolveGlobals() {
    // TODO reserve native imports
    const visitor = new ConvertGlobalsToImports(this);
    Object.entries(this.exports).forEach(([exportName, entity]) => {
      if (entity && entity.expression) {
        visitor.visit(entity.expression);
      }
    });
    _.forEach(this.nestedScopes, (scope) =>
      (scope as NamespaceBuilder)._resolveGlobals(),
    ); // visitor.visit((scope as NamespaceBuilder).namespace));
  }
}

class NamespaceBuilder extends ScopeBuilder {
  parentScope: ScopeBuilder;
  namespace: Namespace;

  /**
   *
   * @param name - Name of the module which is created
   * @param parentScope
   */
  constructor(name: string, parentScope: ScopeBuilder) {
    super(name);
    this.parentScope = parentScope;
    this.namespace = {
      kind: "Namespace",
      name: name,
      namespaces: [],
      variables: [],
      functions: [],
      classes: [],
      interfaces: [],
      enums: [],
      typedefs: [],
      visibility: "public",
      export: true,
    };
  }

  get topLevelScope(): ScopeBuilder {
    return this.parentScope.topLevelScope;
  }

  getNestedScope(nestedScopeName: string) {
    // nested scopes must be added to the namespaces array of our namespace
    const nestedScope = super.getNestedScope(nestedScopeName);
    if (
      !this.namespace.namespaces.includes(
        (nestedScope as NamespaceBuilder).namespace,
      )
    ) {
      this.namespace.namespaces.push(
        (nestedScope as NamespaceBuilder).namespace,
      );
    }
    return nestedScope;
  }
  addExport(exportName: string, ast: Expression) {
    const addTo = {
      Class: "classes",
      Enum: "enums",
      Interface: "interfaces",
      FunctionDesc: "functions",
      Variable: "variables",
      TypeAliasDeclaration: "typedefs",
    }[ast.kind];
    if (addTo) {
      this.namespace[addTo].push(ast);
    } else {
      warn(
        `**** Cannot add ${ast.kind} ${ast.name} to a namespace (unknown kind)`,
      );
    }
  }
  import(fqn: string, fallbackToAny: boolean) {
    // only the module can import something, namespaces need to delegate to their parent scope
    const importName = (this.parentScope as NamespaceBuilder).import(
      fqn,
      fallbackToAny,
    ); // TODO: cast ok? Or could it be a different ScopeBuilder
    if (importName.startsWith(this.name + ".")) {
      return importName.slice((this.name + ".").length);
    }
    return importName;
  }
  toAST(): Namespace {
    return this.namespace;
  }
  _resolveGlobals() {
    // TODO reserve native imports
    const visitor = new ConvertGlobalsToImports(this);
    visitor.visit(this.namespace);
    _.forEach(this.nestedScopes, (scope) =>
      (scope as NamespaceBuilder)._resolveGlobals(),
    ); // visitor.visit((scope as NamespaceBuilder).namespace));
  }
}

/**
 *
 * @param json
 * @param dependencies
 * @param typeUniverse
 * @returns
 */
function buildModules(
  json: ApiJSON,
  dependencies: ApiJSON[],
  typeUniverse: TypeUniverse,
) {
  verbose(
    `building modules for ${json.library} (${dependencies
      .map((dep) => dep.library)
      .join(",")})`,
  );
  const symbols = json.symbols;

  // collection of all known modules, keyed by their name
  const modules: Map<string, ModuleBuilder> = new Map();

  // get or create a module (ModuleBuilder) by name
  const getModule = (moduleName: string): ModuleBuilder =>
    modules.get(moduleName) ||
    (() => {
      const newMod = new ModuleBuilder(moduleName, typeUniverse);
      modules.set(moduleName, newMod);
      return newMod;
    })();

  /*
   * An entity should be declared as module if it has module and export information (mandatory info)
   * and if either modules are generared in general or if the entity has only a "module:..."" name
   * (which implies that there's no global name to export it)
   */
  const shouldBeDeclaredAsModule = (entity) =>
    entity.module &&
    entity.export !== undefined &&
    (!generateGlobals || entity.name.startsWith("module:"));

  symbols.forEach((symbol) => {
    if (shouldBeDeclaredAsModule(symbol)) {
      // do not generate "jquery.sap."" modules, they're legacy
      if (!generateGlobals && symbol.module.startsWith("jquery.sap.")) {
        return;
      }
      const module = getModule(symbol.module);
      module.export(symbol);
    }
    symbol.properties?.forEach((prop) => {
      if (shouldBeDeclaredAsModule(prop) && prop.module !== symbol.module) {
        // do not generate "jquery.sap."" modules, they're legacy
        if (!generateGlobals && prop.module.startsWith("jquery.sap.")) {
          return;
        }
        const module = getModule(prop.module);
        prop.kind = prop.kind || "variable";
        module.export(prop);
        verbose(
          `individually export property ${symbol.name}.${prop.name} from ${prop.module}`,
        );
      }
    });
    symbol.methods?.forEach((method) => {
      if (shouldBeDeclaredAsModule(method) && method.module !== symbol.module) {
        // do not generate "jquery.sap."" modules, they're legacy
        if (!generateGlobals && method.module.startsWith("jquery.sap.")) {
          return;
        }
        const module = getModule(method.module);
        method.kind = method.kind || "function";
        module.export(method);
        verbose(
          `individually export method ${symbol.name}: ${method.name} from ${method.module}`,
        );
      }
    });
  });
  return [...modules.values()].map((mb) => mb.toAST());
}

function findCommonAncestorScope(scope, fqn: string): [number, string[]] {
  const segments = fqn.split(".");
  let i = 0;
  while (i < scope.length && i < segments.length && scope[i] === segments[i]) {
    i++;
  }
  return [i, segments];
}

class GlobalsVisitor extends ASTVisitor {
  _universe: TypeUniverse;
  _generateGlobals: boolean;
  _localShortNames: Map<string, string>;
  _currentScope: string[];

  /**
   *
   * @param typeUniverse
   * @param generateGlobals
   */
  constructor(typeUniverse: TypeUniverse, generateGlobals: boolean) {
    super();
    /**
     * @type {TypeUniverse}
     */
    this._universe = typeUniverse;
    this._generateGlobals = generateGlobals;
    this._localShortNames = new Map();
    this._currentScope = [];
  }
  _visitNamespace(namespace: Namespace) {
    const oldShortNames = this._localShortNames;
    const oldScope = this._currentScope;
    this._currentScope.push(namespace.name);
    const registerLocalName = (
      entity:
        | Namespace
        | Variable
        | FunctionDesc
        | Class
        | Interface
        | Enum
        | TypeAliasDeclaration,
    ) => {
      shortNames.set(
        entity.name,
        [...this._currentScope, entity.name].join("."),
      );
    };
    const shortNames = (this._localShortNames = new Map(oldShortNames));
    _.forEach(namespace.namespaces, registerLocalName);
    _.forEach(namespace.variables, registerLocalName);
    _.forEach(namespace.functions, registerLocalName);
    _.forEach(namespace.classes, registerLocalName);
    _.forEach(namespace.interfaces, registerLocalName);
    _.forEach(namespace.enums, registerLocalName);
    _.forEach(namespace.typedefs, registerLocalName);
    super._visitNamespace(namespace);
    this._currentScope.pop();
    this._localShortNames = oldShortNames;
  }
  _visitTypeName(type: string, usage: "extends" | "implements") {
    const expressionRequired = usage === "extends" || usage === "implements";
    const symbol = this._universe.get(type);
    // TODO fix unhandled else cases
    if (symbol == null || NO_IMPORT_NAMES[type]) {
      if (!isKnownGlobal(type)) {
        if (expressionRequired) {
          warn(
            `Cannot find symbol for '${type}', falling back to type 'Object'`,
          );
          return `/* was: ${type} */ Object`;
        }
        warn(`Cannot find symbol for '${type}', falling back to type 'any'`);
        return `/* was: ${type} */ any`;
      } else {
        if (this._localShortNames.has(type) && !type.includes(".")) {
          warn(`Conflict between local name and global type '${type}'`);
          if (ALTERNATIVE_GLOBAL_NAMES[type]) {
            return `/* was ${type} */ ${ALTERNATIVE_GLOBAL_NAMES[type]}`;
          }
        } else {
          const [commonScopeLength, nameSegments] = findCommonAncestorScope(
            this._currentScope,
            type,
          );
          if (
            commonScopeLength &&
            ((nameSegments.length - commonScopeLength === 1 &&
              (!this._localShortNames.has(
                nameSegments[nameSegments.length - 1],
              ) ||
                this._localShortNames.get(
                  nameSegments[nameSegments.length - 1],
                ) === type)) ||
              (nameSegments.length - commonScopeLength > 1 &&
                this._localShortNames.has(nameSegments[commonScopeLength])))
          ) {
            const localName = nameSegments.slice(commonScopeLength).join(".");
            return localName;
          }
        }
      }
    } else if (type.startsWith("module:") || !this._generateGlobals) {
      if (symbol && symbol.module && symbol.export !== undefined) {
        if (expressionRequired) {
          // In an ambient context, module imports inside a namespace are not allowed
          warn(
            `Cannot import ${type} inside an ambient namespace, falling back to type 'Object'`,
          );
          return `/* was: ${type} */ Object`;
        }
        verbose(`Replacing global ${type} with import`);
        return `import("${symbol.module}").${symbol.export || "default"}`;
      } else if (!type.startsWith("module:")) {
        const [commonScopeLength, nameSegments] = findCommonAncestorScope(
          this._currentScope,
          type,
        );
        if (
          commonScopeLength &&
          ((nameSegments.length - commonScopeLength === 1 &&
            (!this._localShortNames.has(
              nameSegments[nameSegments.length - 1],
            ) ||
              this._localShortNames.get(
                nameSegments[nameSegments.length - 1],
              ) === type)) ||
            (nameSegments.length - commonScopeLength > 1 &&
              this._localShortNames.has(nameSegments[commonScopeLength])))
        ) {
          const localName = nameSegments.slice(commonScopeLength).join(".");
          return localName;
        }
      }
      /*
    } else {
      // not a module and globals mode active:
      // in this case, we don't run dtslint yet, so we keep the fully qualified names
    */
    }
    return super._visitTypeName(type);
  }
}

/**
 *
 * @param symbols
 * @param nsFQN
 * @returns
 */
function buildNamespace(symbols: ConcreteSymbol[], nsFQN: string): Namespace {
  const nsSymbol: NamespaceSymbol = _.find(
    symbols,
    (currSymbol) =>
      currSymbol.name === nsFQN && currSymbol.kind === "namespace",
  ) as NamespaceSymbol;

  assertKnownProps(
    [
      // TODO: What is an "abstract" namespace? :)
      "abstract",
      "basename",
      "events",
      // TODO: should we add these to the documentation somehow?
      "examples",
      // TODO: why does a namespace have an "extends" or "implements" property? :)
      "extends",
      "implements",
      "final",
      "methods",
      "name",
      "properties",
      "synthetic",
    ],
    nsSymbol,
  );

  const interfaces = buildNestedInterfaces(symbols, nsFQN).concat(
    buildNestedObjects(symbols, nsFQN),
  );

  const classes = buildNestedClasses(symbols, nsFQN);

  /**
   * Whether the given member should be declared as member of the current namespace.
   * This is always the case in 'generateGlobals' mode or when neither the enclosing
   * namespace nor the member itself is declared as export of a module.
   * TODO must also check ancestor namespaces (currently does not occur)
   */
  const shouldBeDeclaredAsMember = (member): boolean =>
    ((nsSymbol.export === undefined ||
      (nsSymbol.module &&
        member.module &&
        nsSymbol.module !== member.module)) &&
      member.export === undefined) ||
    generateGlobals;

  const astNode: Namespace = {
    name: /\w+$/.exec(nsFQN)[0],
    kind: "Namespace",
    namespaces: buildNestedNamespaces(symbols, nsFQN),
    variables:
      nsSymbol?.properties
        ?.filter((prop) => shouldBeDeclaredAsMember(prop))
        .map(buildVariable) ?? [],
    functions:
      nsSymbol?.methods
        ?.filter((method) => shouldBeDeclaredAsMember(method))
        .map(buildFunction) ?? [],
    classes,
    interfaces,
    enums: buildNestedEnums(symbols, nsFQN),
    typedefs: buildNestedTypedefs(symbols, nsFQN),
    visibility: nsSymbol !== undefined ? nsSymbol.visibility : "public",
    export: true,
  };

  addJsDocProps(astNode, nsSymbol);
  return astNode;
}

function buildNestedNamespaces(symbols: ConcreteSymbol[], nsFQN: string) {
  const nestedNamespaces = getDirectDescendants(symbols, "namespace", nsFQN);
  return _.map(nestedNamespaces, (currNestedNS) =>
    buildNamespace(symbols, currNestedNS.name),
  ).filter(
    (namespace) =>
      !_.isEmpty(namespace.namespaces) ||
      !_.isEmpty(namespace.variables) ||
      !_.isEmpty(namespace.functions) ||
      !_.isEmpty(namespace.classes) ||
      !_.isEmpty(namespace.interfaces) ||
      !_.isEmpty(namespace.enums) ||
      !_.isEmpty(namespace.typedefs),
  );
}

function buildNestedItems(
  symbols: ConcreteSymbol[],
  nsFQN: string,
  ui5kind: string,
  builder,
) {
  const nestedItems = getDirectDescendants(symbols, ui5kind, nsFQN);
  return _.map(nestedItems, builder);
}

const buildNestedClasses = _.partialRight(
  buildNestedItems,
  "class",
  buildClass,
);
const buildNestedInterfaces = _.partialRight(
  buildNestedItems,
  "interface",
  buildInterface,
);
const buildNestedObjects = _.partialRight(
  buildNestedItems,
  "object",
  buildInterfaceFromObject,
);
const buildNestedEnums = _.partialRight(buildNestedItems, "enum", buildEnum);
const buildNestedTypedefs = _.partialRight(
  buildNestedItems,
  "typedef",
  buildTypedef,
);

/**
 *
 * @param property
 * @returns
 */
function buildVariable(property: ObjProperty): Variable {
  assertKnownProps(
    ["examples", "name", "type", "value", "optional", "esmOnly", "readonly"],
    property,
  );

  const astNode: Variable = {
    kind: "Variable",
    name: property.name,
    static: property.static === true,
    type: buildType(property.type),
    visibility: property.visibility,
    readonly: property.readonly === true,
    optional: property.optional === true,
  };

  addJsDocProps(astNode, property);
  return astNode;
}

function buildStaticVariable(
  symbol: EnumSymbol | ObjectSymbol | NamespaceSymbol,
  typeUniverse: TypeUniverse,
): Variable {
  // determine the type
  let type = "";
  if (symbol.kind === "object" && symbol.extends) {
    // this code ensures that static properties of objects inherit the parent static property
    const parentType = symbol.extends.slice(0, symbol.extends.lastIndexOf("."));
    const symbolForType = typeUniverse.get(symbol.extends);
    const symbolForParentType = typeUniverse.get(parentType);
    if (symbolForParentType.basename && symbolForType.export) {
      // static properties inheriting parent static properties need an intersection e.g. sap/fe/test/ListReport:
      //   -> static actions: typeof TemplatePage.actions & actions;
      type += `typeof ${symbolForParentType.basename}.${symbolForType.export} & `;
    }
  } else if (symbol.kind === "enum" || symbol.kind === "namespace") {
    // namespaces need typeof assignments for static props, e.g. sap/ui/Device:
    //   -> os: typeof os
    // enums need typeof assignments for static props, e.g. sap/m/MessageBox:
    //   -> Action: typeof Action
    type += "typeof ";
  }
  type += symbol.export;
  // create the astNode for the variable
  const astNode: Variable = {
    kind: "Variable",
    name: symbol.export,
    static: true,
    type: {
      kind: "NativeTSTypeExpression",
      type,
    } /* as TypeParameter */,
    visibility: symbol.visibility,
    optional: false,
  };
  addJsDocProps(astNode, symbol);
  return astNode;
}

/**
 *
 * @param property
 * @param valueEqualsName
 * @returns
 */
function buildVariableWithValue(
  property: EnumProperty,
  valueEqualsName: boolean,
): VariableWithValue {
  const astNode: VariableWithValue = buildVariable(
    property,
  ) as VariableWithValue; /* value will be added next */
  astNode.value = valueEqualsName ? property.name : property.value;
  return astNode;
}

/**
 * @param ui5Method
 * @returns
 */
function buildFunction(ui5Method: ObjMethod): FunctionDesc {
  assertKnownProps(
    [
      "name",
      "typeParameters",
      "parameters",
      "returnValue",
      "throws",
      "optional",
      "basename",
    ],
    ui5Method,
  );
  const astNode: FunctionDesc = {
    kind: "FunctionDesc",
    name: ui5Method.name,
    static: ui5Method.static === true,
    typeParameters: _.map(ui5Method.typeParameters, buildTypeParameter),
    parameters: _.map(ui5Method.parameters, buildParameter),
    returns: buildReturnDesc(ui5Method.returnValue),
    description: ui5Method.description,
    additionalDocs: ui5Method.references,
    since: ui5Method.since,
    throws: ui5Method.throws ? ui5Method.throws : [],
    deprecated: buildDeprecated(ui5Method.deprecated),
    visibility: ui5Method.visibility,
    optional: ui5Method.optional,
  };

  addJsDocProps(astNode, ui5Method);
  return astNode;
}

function adaptExtendMethod(extendMethod: FunctionDesc, fqn: string) {
  const oClassInfoParam = _.find(
    extendMethod.parameters,
    (param) => param.name === "oClassInfo",
  );
  if (oClassInfoParam === undefined) {
    return;
  }

  extendMethod.typeParameters = [
    {
      // T extends Record<string, unknown>
      kind: "TypeParameter",
      name: "T",
      constraint: {
        kind: "TypeReference",
        typeName: "Record",
        typeArguments: [
          {
            kind: "TypeReference",
            typeName: "string",
          },
          {
            kind: "TypeReference",
            typeName: "unknown",
          },
        ],
      },
    },
  ];
  oClassInfoParam.type = {
    // sap.ClassInfo<T, ${fqn}>
    kind: "TypeReference",
    typeName: "sap.ClassInfo",
    typeArguments: [
      {
        kind: "TypeReference",
        typeName: "T",
      },
      {
        kind: "TypeReference",
        typeName: fqn,
      },
    ],
  };
}

/**
 * @param ui5Param
 * @returns
 */
function buildTypeParameter(ui5TypeParam): TypeParameter {
  assertKnownProps(["name", "type", "default"], ui5TypeParam);
  const astNode: TypeParameter = {
    kind: "TypeParameter",
    name: ui5TypeParam.name,
    constraint: buildType(ui5TypeParam.type),
    default: buildType(ui5TypeParam.default),
  };
  addJsDocProps(astNode, ui5TypeParam);
  return astNode;
}

const buildTypedefProperty: (ui5Param) => Parameter = (ui5Param) =>
  baseBuildParameter(ui5Param, "properties", false); // TODO: based on implementation
const buildParameter = (ui5Param: ObjCallableParameter) =>
  baseBuildParameter(ui5Param, "parameterProperties", false);

/**
 * @param ui5Param
 * @param nameOfNestedProperties
 * @param forcedOptional
 * @returns
 */
function baseBuildParameter(
  ui5Param: ObjCallableParameter,
  nameOfNestedProperties: string,
  forcedOptional = false,
): Parameter {
  assertKnownProps(
    [
      "name",
      "type",
      nameOfNestedProperties,
      "optional",
      "omissible",
      "defaultValue",
      "repeatable",
      // from UI5 metadata for mSettings
      "group",
      "methods",
      "bindable",
    ],
    ui5Param,
  );

  const complexType = ui5Param[nameOfNestedProperties];
  const astNode: Parameter = {
    kind: "Parameter",
    name: ui5Param.name,
    type: buildComplexParamType(
      ui5Param.type,
      complexType,
      nameOfNestedProperties,
    ),
    repeatable: forcedOptional === true ? false : ui5Param.repeatable === true, // only for method params
    defaultValue: ui5Param.defaultValue,
    optional: forcedOptional === true ? true : ui5Param.optional === true,
    omissible: ui5Param.omissible,
  };

  if (astNode.repeatable) {
    // in JSDoc, rest parameters are typed with the type of a single parameter,
    // in TypeScript, they're typed with the corresponding array type
    // therefore wrap the api.json type in an ArrayType
    astNode.type = {
      kind: "ArrayType",
      elementType: astNode.type as Type,
    };
  }

  addJsDocProps(astNode, ui5Param);
  return astNode;
}

function isObjectType(ast) {
  if (
    ast.kind === "TypeReference" &&
    (ast.typeName === "object" ||
      ast.typeName === "Object" ||
      ast.typeName === "Record")
  ) {
    return true;
  }
  return false;
}

function buildComplexParamType(
  ui5ParamType: Type,
  ui5ComplexParam: NestedProperties,
  nameOfNestedProperties: string,
): Type {
  let ast = buildType(ui5ParamType);

  if (ui5ComplexParam) {
    const complexAst: TypeLiteral = {
      kind: "TypeLiteral",
      members: _.values(ui5ComplexParam).map((nestedParam) =>
        baseBuildParameter(nestedParam, nameOfNestedProperties),
      ),
    };

    if (isObjectType(ast)) {
      ast = complexAst;
    } else if (ast.kind === "ArrayType" && isObjectType(ast.elementType)) {
      ast.elementType = complexAst;
    } else if (ast.kind === "UnionType") {
      let modified = false;
      ast.types = _.map(ast.types, (variant, idx) => {
        if (isObjectType(variant)) {
          modified = true;
          return complexAst;
        }
        if (variant.kind === "ArrayType" && isObjectType(variant.elementType)) {
          modified = true;
          variant.elementType = complexAst;
        }
        return variant;
      });
      if (!modified) {
        verbose(
          "failed to enhance an object type with a TypeLiteral, replacing original type",
          ast,
          complexAst,
        );
        ast = complexAst;
      }
    }
  }

  return ast;
}

/**
 * @param ui5ReturnValue
 * @returns
 */
function buildReturnDesc(ui5ReturnValue: ReturnValue): ReturnDesc {
  if (_.isUndefined(ui5ReturnValue)) {
    return undefined;
  }

  assertKnownProps(["description", "type"], ui5ReturnValue);

  return {
    kind: "ReturnDesc",
    type: buildType(ui5ReturnValue.type),
    description: ui5ReturnValue.description,
  };
}

/**
 * @param ui5Class
 * @returns
 */
function buildClass(ui5Class: ClassSymbol): Class {
  assertKnownProps(
    [
      "abstract",
      "basename",
      "constructor",
      "events",
      "extends",
      "hideconstructor",
      "implements",
      // Final classes do not exist in TypeScript **signatures**
      // https://github.com/Microsoft/TypeScript/issues/8306 and https://github.com/microsoft/TypeScript/issues/50532
      // todo: Consider adding a @final annotation?
      "final",
      "methods",
      "name",
      "properties",
      "typeParameters",
      "__hasOverloadedConstructor",
    ],
    ui5Class,
  );

  const astNode: Class = {
    kind: "Class",
    name: ui5Class.basename,
    typeParameters: ui5Class.typeParameters
      ? _.map(ui5Class.typeParameters, buildTypeParameter)
      : [],
    extends: ui5Class.extends,
    implements: ui5Class.implements ? ui5Class.implements : [],
    implementsFQName: ui5Class.implements ? _.clone(ui5Class.implements) : [],
    constructors: Object.hasOwnProperty.call(ui5Class, "constructor") // ignore the default constructor of JS objects
      ? [buildFunction(ui5Class.constructor)]
      : ui5Class.hideconstructor
        ? [buildFunction({ name: "constructor", visibility: "protected" })] // create a default constructor, so it can be explicitly set to 'protected'
        : [],
    fields: _.map(ui5Class.properties, buildVariable),
    methods: _.map(ui5Class.methods, buildFunction),
    isAbstract: ui5Class.abstract === true,
    visibility: ui5Class.visibility,
  };

  // TODO better introduce a generic marker for "omittable" parameters
  // and do a general overloading based on that marker
  if (ui5Class.__hasOverloadedConstructor) {
    const ctor = astNode.constructors[0];
    const altCtor = _.cloneDeep(ctor);
    altCtor.parameters.shift(); // remove optional first parameter
    astNode.constructors.unshift(altCtor);
  }

  // detect UI5's static extend method and adapt it for better code assistance
  const extendMethod = astNode.methods.find(
    (method) => method.name === "extend" && method.static,
  );
  if (extendMethod) {
    adaptExtendMethod(extendMethod, ui5Class.name);
  }

  addJsDocProps(astNode, ui5Class);
  return astNode;
}

const ui5ExtendsToArray = (ui5Extends) => {
  if (_.isArray(ui5Extends)) {
    return _.clone(ui5Extends);
  }
  return ui5Extends ? [ui5Extends] : [];
};

/**
 * @param ui5Interface
 * @returns
 */
function buildInterface(ui5Interface: InterfaceSymbol) {
  assertKnownProps(
    [
      "basename",
      "name",
      "extends",
      "properties",
      "methods",
      "events",
      "__isNotAMarkerInterface",
    ],
    ui5Interface,
  );

  const astNode: Interface = {
    kind: "Interface",
    name: ui5Interface.basename,
    // The input UI5 Interfaces either have no or a single 'extends', but might have multiple in future.
    extends: ui5ExtendsToArray(ui5Interface.extends),
    methods: _.map(ui5Interface.methods, buildFunction),
    props: _.map(ui5Interface.properties, buildVariable), // the properties of the $*Settings objects generated in a previous step
    visibility: ui5Interface.visibility,
  };

  if (!ui5Interface.__isNotAMarkerInterface) {
    astNode.fqname = ui5Interface.name;
  }

  addJsDocProps(astNode, ui5Interface);
  return astNode;
}

/**
 * @param ui5Object
 * @returns
 */
function buildInterfaceFromObject(ui5Object): Interface {
  /*
  assertKnownProps(
    ["basename", "name", "extends", "methods", "events"],
    ui5Object
  );*/

  const astNode: Interface = {
    kind: "Interface",
    isStaticObject: true,
    name: ui5Object.basename,
    extends: Array.isArray(ui5Object.extends)
      ? ui5Object.extends
      : ui5Object.extends
        ? [ui5Object.extends]
        : [],
    methods: _.map(ui5Object.methods, buildFunction),
    props: _.map(ui5Object.properties, buildVariable),
    visibility: ui5Object.visibility,
  };

  addJsDocProps(astNode, ui5Object);
  return astNode;
}
/**
 * @param ui5Enum
 * @returns
 */
function buildEnum(ui5Enum: EnumSymbol) {
  assertKnownProps(
    ["name", "basename", "properties", "deprecatedAliasFor"],
    ui5Enum,
  );

  const isStandardEnum =
    ui5Enum["ui5-metadata"] != null &&
    ui5Enum["ui5-metadata"].stereotype === "enum";

  const astNode: Enum = {
    kind: "Enum",
    name: ui5Enum.basename,
    withValues: true,
    isLibraryEnum: ui5Enum.module.endsWith("/library"),
    deprecatedAliasFor: ui5Enum.deprecatedAliasFor,
    values: _.map(ui5Enum.properties, (prop) =>
      buildVariableWithValue(prop, isStandardEnum),
    ),
    visibility: ui5Enum.visibility,
  };

  addJsDocProps(astNode, ui5Enum);
  return astNode;
}

/**
 *
 * @param ui5Deprecated
 * @returns
 */
function buildDeprecated(ui5Deprecated: Deprecated): DeprecatedDesc {
  if (_.isUndefined(ui5Deprecated)) {
    return null;
  }

  assertKnownProps(["since", "text"], ui5Deprecated);

  return {
    kind: "DeprecatedDesc",
    description: ui5Deprecated.text,
    since: ui5Deprecated.since,
  };
}

/**
 * @param ui5Exp
 * @returns
 */
function buildExperimental(ui5Exp: Experimental): ExperimentalDesc {
  if (_.isUndefined(ui5Exp)) {
    return null;
  }

  assertKnownProps(["since", "text", "description"], ui5Exp);

  return {
    kind: "ExperimentalDesc",
    since: ui5Exp.since,
    description: ui5Exp.text,
  };
}

/**
 *
 * @param ui5Type
 * @returns
 */
function buildType(ui5Type: Type | string): Type {
  if (ui5Type === undefined) {
    return undefined;
  }

  if (typeof ui5Type === "object" && typeof ui5Type.kind === "string") {
    // use already parsed type
    return _.cloneDeep(ui5Type);
  } else if (typeof ui5Type !== "string") {
    log.error(`**** unexpected type of type - neither string nor object`);
    return undefined;
  }

  // TODO: Need to parse this with doctrine or another JSDocs Type Parser.
  if (/[<>{}]/.test(ui5Type as string)) {
    verbose(`TYPE SIMPLIFICATION from ${ui5Type} to 'any'`); // NOTE: this branch is never hit
    return {
      kind: "TypeReference",
      // ignoring any "too complex" types for now
      typeName: "any",
    };
  }

  const isUnion = ui5Type.indexOf("|") !== -1;

  if (isUnion) {
    const split = ui5Type.split("|");
    const trimmed = _.map(split, _.trim);
    const unionTypesAsts = _.map(trimmed, buildType);
    return {
      kind: "UnionType",
      types: unionTypesAsts,
    };
  } else {
    return {
      kind: "TypeReference",
      typeName: ui5Type,
    };
  }
}

function getDirectDescendants(
  symbols: ConcreteSymbol[],
  kind: string,
  nsFQN: string,
) {
  const directDescendantsOfKind = _.filter(symbols, (currSymbol) => {
    const currKind = currSymbol.kind;
    const currName = currSymbol.name;
    const currExport = currSymbol.export;
    return (
      (generateGlobals || currExport === undefined || kind === "namespace") &&
      currKind === kind &&
      currName.startsWith(nsFQN + ".") &&
      //  No more dots, so this is a **direct** child.
      currName.substr(nsFQN.length + 1).indexOf(".") === -1
    );
  });
  return directDescendantsOfKind;
}

function addJsDocProps(astNode, jsonProperty) {
  if (jsonProperty === undefined) {
    return;
  }

  if (jsonProperty.description) {
    astNode.description = jsonProperty.description;
  }

  if (jsonProperty.since) {
    astNode.since = jsonProperty.since;
  }

  if (jsonProperty.deprecated) {
    astNode.deprecated = buildDeprecated(jsonProperty.deprecated);
  }

  if (jsonProperty.experimental) {
    astNode.experimental = buildExperimental(jsonProperty.experimental);
  }

  if (jsonProperty.visibility === "protected") {
    astNode.isProtected = true;
  }

  if (jsonProperty.references) {
    astNode.additionalDocs = jsonProperty.references;
  }
}

/**
 * @param ui5Typedef
 * @returns
 */
function buildTypedef(ui5Typedef: TypedefSymbol): TypeAliasDeclaration {
  let type: Type;
  if (_.isArray(ui5Typedef.properties)) {
    type = {
      kind: "TypeLiteral",
      members: _.values(ui5Typedef.properties).map(buildTypedefProperty),
    };
    if (ui5Typedef.extends) {
      // typedef inherits from a non-object base type; in TypeScript, an intersectionType is needed to represent this
      type = {
        kind: "IntersectionType",
        types: [
          {
            kind: "TypeReference",
            typeName: ui5Typedef.extends,
          },
          type,
        ],
      };
    }
  } else if (ui5Typedef.returnValue || _.isArray(ui5Typedef.parameters)) {
    type = {
      kind: "FunctionType",
      parameters: _.map(
        ui5Typedef.parameters,
        (param) =>
          ({
            kind: "Parameter",
            name: param.name,
            type: param.type,
            // TODO how to represent parameter documentation?
          }) as Parameter,
      ),
    };
    if (ui5Typedef.returnValue) {
      type.type = ui5Typedef.returnValue.type; // NOTE: this .type is always an object in the debugger
      // TODO how to represent return value documentation?
    }
  } else if (ui5Typedef.type) {
    type = ui5Typedef.type;
  } else {
    verbose("unhandled UI5 typedef", ui5Typedef);
    type = {
      kind: "TypeReference",
      typeName: "any",
    };
  }

  const typeAlias: TypeAliasDeclaration = {
    kind: "TypeAliasDeclaration",
    name: ui5Typedef.basename,
    typeParameters: _.map(ui5Typedef.typeParameters, buildTypeParameter),
    type,
  };
  addJsDocProps(typeAlias, ui5Typedef);

  return typeAlias;
}
