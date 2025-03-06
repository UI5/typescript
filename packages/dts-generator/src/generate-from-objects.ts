import { getLogger } from "@ui5/logger";
const log = getLogger("@ui5/dts-generator/generateFromObjects");
import _ from "lodash";
import { ApiJSON, ConcreteSymbol } from "./types/api-json.js";
import { fixApiJsons } from "./phases/json-fixer.js";
import { jsonToAst } from "./phases/json-to-ast.js";
import { transformAst } from "./phases/ast-transform.js";
import { fixAsts } from "./phases/ast-fixer.js";
import { genDts } from "./phases/dts-code-gen.js";
import { postProcess } from "./phases/post-process.js";
import { buildSymbolTable } from "./phases/symbols.js";

/**
 * Directives influencing the generation process. The data originates from UI5 libraries' .dtsgenrc file.
 * @public
 */
export interface Directives {
  /**
   * Full Qualified Symbol names from the UI5 SDK to completely ignore/skip during generation.
   */
  badSymbols: string[];

  /**
   * Names (**not** FQNs) of class methods which should be excluded from the generation
   * -  TODO: This is very inaccurate due to not using FQNs, consider improving the implementation.
   */
  badMethods: string[];

  /**
   * Fully Qualified interface names to be removed from class' "implements" clauses
   */
  badInterfaces: string[];

  /**
   * A map of type name fixes.
   *   - The key is the original name
   *   - The value is the "corrected form"
   */
  typeTyposMap: { [orgType: string]: string };

  /**
   * This marks UI5 namespaces names (**not** fqns) that are used as types
   * and should be converted (replaced with) to interfaces because such usage is invalid in TypeScript.
   *
   * This conversion is done automatically for **empty** namespaces (heuristic).
   * So only non-empty namespaces need to be specified here.
   *
   * Note that some namespaces are used **both** as types and as runtime artifacts.
   * For these the `[true, "keep_original_ns"]` value should be provided which
   * will cause a matching interface to be generated **without** replacing the original namespace.
   */
  namespacesToInterfaces: {
    [orgNamespace: string]: true | [true] | [true, "keep_original_ns"];
  };

  /**
   * When library B has a dependency to library A, but still library A also has references to library B,
   * forwardDeclarations can resolve this cyclic dependency by making entities from library B known to library A.
   * E.g. the sap.m library has controls implementing the "sap.f.IShellBar" interface, but sap.f has a dependency
   * to sap.m. Then the "sap.f.IShellBar" interface can be made known as forwardDeclaration for sap.m.
   */
  forwardDeclarations: {
    [libraryName: string]: ConcreteSymbol[];
  };

  /**
   * For these Fully Qualified (currently only **classes**) Names a
   * "ts-ignore" comment would be generated.
   *
   * The corresponding value for each key (fqn) of this map is the the reason
   * why the ignore is applied.
   *
   * This directive is used to brute force "solve" hard problems.
   * Only use this as a last resort...
   */
  fqnToIgnore: { [fqn: string]: string };

  /**
   * The names of the symbols given here, grouped by library, are looked up in the respective api.json
   * structure. If they do not exist, they are added, otherwise the existing symbols are modified by overwriting
   * them with the given symbol data. Used for cases where the existing API design cannot be properly
   * mapped to TypeScript and cannot be changed in a compatible way.
   */
  overlays: {
    [libraryName: string]: (ConcreteSymbol & { esmOnly?: boolean })[];
  };

  /**
   * If a symbol of kind "enum" is used as key in this map, this enum is a deprecated
   * alias for another enum, whose name is given as value in the map.
   * For such deprecated aliases for enums, a different type signature is generated,
   * see method `genDeprecatedAliasForEnum` in dts-code-gen.ts.
   */
  deprecatedEnumAliases: {
    [fqn: string]: string;
  };
}

/**
 * The configuration for a generateFromObjects call.
 * @public
 */
export interface GenerateFromObjectsConfig {
  /**
   * The api.json file content of the library for which the *.d.ts file should be generated
   */
  apiObject: ApiJSON;

  /**
   * All api.json objects for dependencies of the current library (including **transitive** dependencies)
   */
  dependencyApiObjects: ApiJSON[];

  /**
   * Directives influencing the generation.
   */
  directives: Directives;

  /**
   * Whether *.d.ts files with globals should be generated instead of ES modules.
   */
  generateGlobals?: boolean;
}

const defaultOptions: GenerateFromObjectsConfig = {
  apiObject: null,
  dependencyApiObjects: [],
  directives: {
    badSymbols: [],
    badMethods: [],
    badInterfaces: [],
    typeTyposMap: {},
    namespacesToInterfaces: {},
    forwardDeclarations: {},
    fqnToIgnore: {},
    overlays: {},
    deprecatedEnumAliases: {},
  },
  generateGlobals: false,
};

/**
 * Generate the *.d.ts file for a UI5 library from the given api.json content object and other required objects.
 *
 * @param config - the configuration for *.d.ts generation
 * @returns
 *
 * @public
 */
export async function generateFromObjects(config: GenerateFromObjectsConfig) {
  const apiObject = config.apiObject;
  const actualOptions: GenerateFromObjectsConfig = _.defaultsDeep(
    config,
    defaultOptions,
  );

  // Phase 1 - fixApiJsons:
  // Do plenty of adjustments in the api.json file content
  const { targetLibFixedJson, depsFixedJsons } = fixApiJsons(
    apiObject,
    actualOptions.dependencyApiObjects,
    actualOptions.directives,
    actualOptions.generateGlobals,
  );

  // Phase 2 - jsonToAst:
  // Transform the api.json files to a hierarchical well-defined data structure (see ast.d.ts)
  const generateGlobals = actualOptions.generateGlobals === true;
  const targetLibAst = jsonToAst(targetLibFixedJson, depsFixedJsons, {
    isDependency: false,
    generateGlobals,
  });
  const depsAsts = timer(function buildAst() {
    return depsFixedJsons.map((json) =>
      jsonToAst(json, [], { isDependency: true, generateGlobals }),
    );
  });

  // Phase 3 - buildSymbolTable:
  // Create a table containing all symbols
  const allSymbolsTables = timer(function buildSymbolsTableStage() {
    const allAsts = [targetLibAst].concat(depsAsts);
    return allAsts.map(buildSymbolTable);
  });

  // Phase 4 - transformAst:
  // Filter out non-public/protected APIs, updateDefineArrayDepsTypes, add "parent" properties
  const targetLibTransformedAst = transformAst(
    targetLibAst,
    allSymbolsTables[0],
    targetLibFixedJson.library,
  );

  // Phase 5 - fixAsts:
  // Fix constructors and optional parameters
  const targetLibFixAst = fixAsts(targetLibTransformedAst);

  // Phase 6 - genDts:
  // Generate d.ts text (type definitions and comments) from the AST
  // Do not add any other kind of logic here!
  let targetLibDtsText = await genDts(
    targetLibFixAst,
    actualOptions.directives.fqnToIgnore,
  );

  const dtsResult = {
    library: apiObject.library,
    dtsText: targetLibDtsText,
  };

  // Phase 7 - postProcess:
  // Tweak d.ts text by e.g. prepending a hardcoded preamble to the sap.ui.core d.ts file
  await postProcess(dtsResult, { generateGlobals }); // modifies dtsResult.dtsText

  return dtsResult;
}

function timer<T>(func: () => T) {
  const start = Date.now();
  const result = func();
  const end = Date.now();

  log.info(`${func.name}: ${end - start} ms`);
  return result;
}
