import { getLogger } from "@ui5/logger";
import { analyzeError, ErrorObject } from "./diagnostic-analysis.js";
import ts from "typescript";
import { writeFileSafe } from "../utils/file-utils.js";

const log = getLogger("@ui5/dts-generator/checkCompile");

/**
 * @see ts.ScriptTarget
 * @public
 */
const ScriptTarget = ts.ScriptTarget;

/**
 * @see ts.ModuleKind
 * @public
 */
const ModuleKind = ts.ModuleKind;

/**
 * @see ts.ModuleResolutionKind
 * @public
 */
const ModuleResolutionKind = ts.ModuleResolutionKind;

export { ScriptTarget, ModuleKind, ModuleResolutionKind };

/**
 * The configuration for a checkCompile run.
 *
 * @public
 */
export interface CheckCompileConfig {
  /**
   * File path+name, e.g. the index.d.ts file referencing all other d.ts files or one specific d.ts file (which may depend on others).
   * Can be omitted/undefined if all the files are given as "dependencyFiles".
   * When both, mainFile and dependencyFiles, are given, then any check errors will only be reported for mainFile, as it is assumed
   * that the dependencyFiles have been checked separately previously.
   */
  mainFile?: string;

  /**
   * Further d.ts files - or all files to check, when mainFile is undefined/null.
   */
  dependencyFiles: string[];

  /**
   * The options for the TypeScript compiler, a map with properties like "strict", "noEmit", "moduleResolution" etc. (note that enums are given like ts.ModuleResolutionKind.NodeJs)
   */
  tsOptions: ts.BuildOptions;

  /**
   * Optional path+name of a file into which any test compilation errors should be written
   */
  errorOutputFile?: string;
}

/**
 * Runs the TypeScript compiler on the given *.d.ts files, analyzes the errors,
 * ignores certain errors contained in the ignore list, and outputs hints for all real errors, so developers working on the
 * respective UI5 libraries can understand the origin of issues easier.
 *
 * @param options - the options for checking
 * @returns true if the compilation was successful
 *
 * @public
 */
export default function checkCompile(options: CheckCompileConfig) {
  const files = [options.mainFile, ...options.dependencyFiles].filter(Boolean);
  const program = ts.createProgram(files, options.tsOptions);
  const emitResult = program.emit();

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  log.info(`TypeScript compilation results:\n`);
  let ignoredMessagesWithoutFile = 0;
  let ignoredMessagesOnIgnoreList = 0;
  let significantErrorOccurred = false;
  const errorObjects: ErrorObject[] = [],
    warningObjects: ErrorObject[] = [],
    errors: string[] = [],
    warnings: string[] = [];
  allDiagnostics.forEach((diagnostic, index) => {
    if (diagnostic.file) {
      if (
        options.mainFile == null ||
        diagnostic.file.fileName === options.mainFile ||
        options.dependencyFiles == null ||
        options.dependencyFiles.length === 0
      ) {
        const { errorObject, errorMessage, hasHint, ignore } = analyzeError(
          diagnostic,
          { index, total: allDiagnostics.length },
        );
        // prepare logging grouped by severity
        if (ignore) {
          ignoredMessagesOnIgnoreList++;
          warnings.push(errorMessage);
          warningObjects.push(errorObject as ErrorObject);
        } else {
          significantErrorOccurred = true;
          errors.push(errorMessage);
          errorObjects.push(errorObject);
        }
      } else {
        ignoredMessagesWithoutFile++;
      }
    } else {
      log.error(
        "  " + ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n  "),
      );
    }
  });

  // do the logging, first warnings, then errors
  warnings.forEach((warning: string, index) => {
    warning = `============= Warning ${index + 1} of ${
      warnings.length
    } =======================================\n${warning}`;
    log.warn("  " + warning.split("\n").join("\n  "));
  });

  errors.forEach((error, index) => {
    error = `============= ERROR ${index + 1} of ${
      errors.length
    } =======================================\n${error}`;
    log.error("  " + error.split("\n").join("\n  "));
  });

  const errorCount =
    allDiagnostics.length > 0
      ? allDiagnostics.length -
        ignoredMessagesWithoutFile -
        ignoredMessagesOnIgnoreList
      : 0;
  const ignoredOnListText =
    ignoredMessagesOnIgnoreList > 0
      ? `, ignored ${ignoredMessagesOnIgnoreList} warning(s) (warnings are errors which are on the ignore list)`
      : "";
  const ignoredInOtherText =
    ignoredMessagesWithoutFile > 0
      ? `, ignored ${ignoredMessagesWithoutFile} more error(s) in external file(s)`
      : "";
  if (errorCount > 0) {
    log.error(
      `  ${errorCount} error(s)${ignoredOnListText}${ignoredInOtherText}`,
    );
    log.info(
      "  (Further information at https://github.com/UI5/typescript/blob/main/hints-for-control-developers.md)\n\n",
    );
  } else {
    log.info(
      `  ${errorCount} error(s)${ignoredOnListText}${ignoredInOtherText}\n\n`,
    );
  }

  let warningCounter: number;
  let errorCounter = (warningCounter = 0);
  if (options.errorOutputFile) {
    const errorFileContent: string = errorObjects
      .concat(warningObjects)
      .reduce((content, error, index) => {
        return (
          content +
          `\n${index + 1}\t${
            error.ignore
              ? "Warning " + warningCounter++
              : "Error " + errorCounter++
          }\t${error.dtsFileName}\t${error.dtsFilePosition}\t${
            error.ui5Module
          }\t${error.codeChain}\t${error.tsError}\t${error.hint.replace(
            /\n/g,
            " ### ",
          )}\t${error.ignore}`
        );
      }, "Number\tID\t*.d.ts File Name\tError position in *.d.ts File\tUI5 Module Name (or best guess for error location)\tError Code(s)\tTypeScript Error Message\tSolution Hint\tignore");

    writeFileSafe(options.errorOutputFile, errorFileContent).then(
      () => {
        log.info("  File written: " + options.errorOutputFile);
      },
      (err) => {
        log.error(
          `  Error when writing error log file ${options.errorOutputFile}: ${err}`,
        );
      },
    );
  }

  return !significantErrorOccurred;
}
