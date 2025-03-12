import path = require("path");
import ts = require("typescript");

/**
 * This function aims to find the UI5-style global name for all exports of the given source file
 * and to add an entry for each such export to allExports.
 * The entry maps the UI5-style global name to a module path and an optional export name. The resulting map
 * is used later to find out which module needs to be loaded (and optionally: which named export) for a given global name.
 *
 * @param sourceFile
 * @param basePath
 * @param typeChecker
 * @param allPathMappings
 * @param allExports
 * @returns
 */
function addSourceExports(
  sourceFile: ts.SourceFile,
  basePath: string,
  typeChecker: ts.TypeChecker,
  allPathMappings: { target: string; sourcePattern: string }[],
  allExports: GlobalToModuleMapping,
) {
  const fileName = sourceFile.fileName;
  const moduleSymbol = typeChecker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    // not a module -> ignore
    return;
  }

  // find out the module path of the current file; this is done by comparing the physical file name to
  // the list of the program's path mappings (logical path to physical path). If a physical path matches,
  // we know the locical path that can be used to address the module.
  // Also, deduce a UI5-style global name for the module.
  // Caution: this is full of heuristics and guesses.
  const filePath = path.normalize(fileName); // e.g. 'c:\SAPDevelop\git\ui5-typescript-control-library\src-ts\com\myorg\myUI5Library\Example.ts
  let globalName: string, moduleFileName: string;
  for (let i = 0; i < allPathMappings.length; i++) {
    const fullTargetPath = path.resolve(basePath, allPathMappings[i].target);
    if (filePath.indexOf(fullTargetPath) === 0) {
      const restPath = filePath.replace(fullTargetPath, "");
      moduleFileName = path
        .join(allPathMappings[i].sourcePattern, restPath)
        .replace(/\\/g, "/")
        .replace(/\.ts$/, "");
      globalName = moduleFileName.replace(/\//g, ".");
    }
  }
  if (!globalName) {
    // log.warn("No module name could be found for file " + filePath + "\nIs this a problem?");
  } else if (globalName.endsWith(".library")) {
    // heuristics: library.ts files usually use the parent path as library name
    globalName = globalName.slice(0, -".library".length);
  }

  // ask tsc for all exports of the file
  const exports = typeChecker.getExportsOfModule(moduleSymbol);
  // for each export, add an entry with the assumed global name to the allExports array
  exports.forEach((exp) => {
    const exportName = exp.getName();
    const globalExportName =
      globalName + (exportName === "default" ? "" : "." + exportName);

    // TODO: once annotation is supported, ignore duplicate named export when annotated
    allExports[globalExportName] = {
      moduleName: moduleFileName,
      exportName: exportName === "default" ? undefined : exportName,
    };
  });
}

export { addSourceExports };
