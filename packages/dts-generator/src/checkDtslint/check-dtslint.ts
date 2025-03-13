import { getLogger } from "@ui5/logger";
const log = getLogger("@ui5/dts-generator/checkDtslint");
import * as path from "path";
import * as fs from "fs";
import resolve from "resolve";
import { spawnSync } from "child_process";

/*
 * This file implements heuristics trying to explain a dtslint error in terms understandable by UI5 developers.
 * Accuracy and amount of explanations for different error types can of course always be improved, but were
 * so far based on actually encountered errors.
 */

interface DTSLintErrorSummary {
  errorCount: number;
  warningCount: number;
  errorObjects: DTSLintErrorObject[];
}
interface DTSLintErrorObject {
  index: number;
  type: "WARNING" | "ERROR";
  message: string;
  ruleName: string;
  ruleDescription: string;
  hint: string;
  fileName: string;
  lineNumber: number;
  linePos: string;
  module: string;
  lineContent: string;
}

interface ErrorInfo {
  ruleName: string;
  fileName: string;
  lineNumber: number;
  errorMessagePlus: string;
  codeLine: string;
  ui5Module: string;
}

interface Hint {
  ruleName: string;
  hint: string;
}

interface IgnoreEntry {
  ruleName?: string;
  ui5Module?: string;
  status: string;
  comment?: string;
  errorMessage?: string;
  fileName?: string;
  codeSubstring?: string;
}

/*
 * the following single-line alternatives require typescript ^4.5.0 AND esnext/nodenext setting
import ignoreList from './dtslint-ignore-list.json' assert { type: 'json' };
import hintList from './dtslint-hint-list.json' assert { type: 'json' };
*/
const ignoreList: IgnoreEntry[] = JSON.parse(
  fs.readFileSync(new URL("./dtslint-ignore-list.json", import.meta.url), {
    encoding: "utf8",
  }),
);
const hintList: Hint[] = JSON.parse(
  fs.readFileSync(new URL("./dtslint-hint-list.json", import.meta.url), {
    encoding: "utf8",
  }),
);

const mFileContents: { [fileName: string]: string[] } = {};
const MIN_TYPESCRIPT_VERSION = "5.0"; // the lowest TypeScript version which should be used by dtslint for testing

// make sure there is an empty temp directory
function prepareTempDir(): string {
  const tempDir = path.join(
    process.cwd(),
    "/temp-dtslint",
    "DefinitelyTyped",
    "types",
    "openui5",
  );

  const tempDefinitelyTypedDir = path.join(
    process.cwd(),
    "/temp-dtslint",
    "DefinitelyTyped",
  ); // parent of the above

  // create the directory or delete its contents if needed, so it is an existing empty directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  } else {
    const previousFiles = fs.readdirSync(tempDir);
    for (const file of previousFiles) {
      fs.unlinkSync(path.join(tempDir, file));
    }
  }

  // fill it with the config files required for dtslint (dtslint is very strict about checking its environment and even the content of the files it expects)
  [
    "tsconfig.json",
    ".eslintrc.json",
    "package.json",
    ".npm___ignore", // renamed to avoid it being used when npm releases the dts-generator package
    "openui5-tests.ts",
  ].forEach((file) => {
    fs.copyFileSync(
      new URL("dtslintConfig/" + file, import.meta.url),
      path.join(tempDir, file === ".npm___ignore" ? ".npmignore" : file),
    );
  });

  // some files need to go one level above
  fs.copyFileSync(
    new URL(
      "dtslintConfig/forDefinitelyTypedDir/notNeededPackages.json",
      import.meta.url,
    ),
    path.join(tempDefinitelyTypedDir, "notNeededPackages.json"),
  );
  fs.copyFileSync(
    new URL(
      "dtslintConfig/forDefinitelyTypedDir/.eslintrc.cjs",
      import.meta.url,
    ),
    path.join(tempDefinitelyTypedDir, ".eslintrc.cjs"),
  );

  return tempDir;
}

const MIN_TYPESCRIPT_VERSION_LINES = `/**
* Copyright (c) 2025 SAP SE or an SAP affiliate company and OpenUI5 contributors.
*/

/**
* For important notes, please read README.md!
*
* These *.d.ts files are generated. In case of issues, either the generator or the JSDoc in the original
* OpenUI5 repository must be fixed. The generator is developed at https://github.com/SAP/ui5-typescript/tree/main/packages/dts-generator
* and you can contribute to OpenUI5, see: https://github.com/SAP/openui5/blob/master/CONTRIBUTING.md
*/

/// <reference types="jquery" />
/// <reference types="qunit" />

`;

/**
 * Options for running dtslint
 *
 * @public
 */
export interface CheckDtslintConfig {
  /**
   * A list of library names to test, like "sap.ui.core"; if not given, all available d.ts files are tested.
   * Can contain lib names like "sap.m" and artifact names like "mobile" for the same library.
   */
  librariesToTest?: string[];
}

/**
 * Runs the dtslint tool on the given *.d.ts files or folder.
 *
 * Because dtslint always scans entire directories, the given file or all *.d.ts files from the given directory are then
 * copied into a temporary directory and scanned there. In addition, the tsconfig.json and tslint.json from the
 * dtslintConfig directory within this package are also copied into this temporary directory, because dtslint cannot be pointed to a
 * config file in a different location.
 * Note that tslint.json also contains parts of DefinitelyTyped's own dt.json config file because dtslint throws an
 * error when anything else than dtslint/dtslint.json (from node_modules) is inherited from in the linting configuration.
 *
 * @param dtsFileOrDir - the path and name of a *.d.ts file or directory containing such files
 * @returns void
 * @throws an error when a dtslint error is encountered
 *
 * @public
 */
export default function checkDtslint(
  dtsFileOrDir: string,
  options?: CheckDtslintConfig,
) {
  if (!fs.existsSync(dtsFileOrDir)) {
    throw new Error(
      dtsFileOrDir +
        " is not an existing d.ts file or directory containing such files",
    );
  }
  const tempDir = prepareTempDir(); // existing and empty now  TODO: consider making this a parameter

  // copy the files to test to the temp folder
  const aFiles = fs.lstatSync(dtsFileOrDir).isFile()
    ? [dtsFileOrDir]
    : getAllDTSFiles(dtsFileOrDir);
  const aFilesToTest: string[] = [];
  const libsToTest = options?.librariesToTest;
  aFiles.forEach((file) => {
    const strippedDownFileName = file
      .replace(/.*\\/, "")
      .replace(/.*\//, "")
      .replace(".d.ts", "")
      .replace(/-\d+\.\d+.*/, "");
    // filter out the known non-OpenUI5 libs which do not need to satisfy the dtslint test
    if (!libsToTest || libsToTest.includes(strippedDownFileName)) {
      const fileToTest = path.join(tempDir, path.basename(file));
      fs.copyFileSync(file, fileToTest);
      aFilesToTest.push(fileToTest);
    }
  });
  prepareIndexFile(aFilesToTest, tempDir); // create an index file referencing all the just copied d.ts files

  log.info("Files to test:\n- " + aFilesToTest.join("\n- "));

  // run dtslint
  const binaryPath = resolve.sync("@definitelytyped/dtslint");
  const nodePath = process.execPath;
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      "The '@definitelytyped/dtslint' module could not be found.",
    );
  }
  const dtslintOutputFilename = "dtslint-stderr.txt";
  spawnSync(
    `"${nodePath}"`,
    [
      `--max-old-space-size=8192`, // increase memory limit to 8 GB, as dtslint crashes with the default 4 GB in case of many errors
      `"${binaryPath}"`,
      `"${path.relative(process.cwd(), tempDir)}"`,
      "2>",
      `"${path.relative(
        process.cwd(),
        path.join(tempDir, dtslintOutputFilename),
      )}"`,
    ],
    { shell: true, maxBuffer: 1024 * 1024 * 20 },
  ); // default max buffer size is 1 MB since 2019, was 200 kB at some earlier time; we need MORE!
  const fileContent = fs.readFileSync(
    path.join(tempDir, dtslintOutputFilename),
  );
  let lintErrorText = fileContent.toString();

  // normalize the error text to some degree
  lintErrorText = lintErrorText
    .replace("Waiting for the debugger to disconnect...", "")
    .replace("Debugger attached.", "")
    .replace(/^error Error: /, "")
    .trim();

  const errorDetails = getErrorDetails(lintErrorText);
  const { warningText, errorText } = createTexts(errorDetails);

  // remove the tested dts files again, leaving the temp folder in original state
  aFilesToTest.forEach((file) => {
    fs.unlinkSync(file);
  });

  if (errorDetails.warningCount > 0) {
    log.warn(
      `\n\nWARNING: TypeScript linting (dtslint) produced ${errorDetails.warningCount} warning(s) (warnings are known errors which are intentionally ignored for the time being):\n\n${warningText}\n`,
    );
  }

  if (true) {
    const logFile = path.join(tempDir, "dtslint-errors.txt");
    const logFileContent = errorDetails.errorObjects.reduce(
      (content, oError, index) => {
        return (
          content +
          `\n${index + 1}\t${oError.type}\t${path.basename(
            oError.fileName,
          )}\t'${oError.lineNumber}:${oError.linePos}\t\t${oError.ruleName}\t${
            oError.ruleDescription
          }\t${oError.module}\t${oError.lineContent}`
        );
      },
      "Index\tType\t*.d.ts File Name\tError position\tOccurrences\tRule Name\tRule Description\tUI5 Module Name\tContent of line where error occurs",
    );

    fs.writeFileSync(logFile, logFileContent);
  }

  // output the result
  if (errorDetails.errorCount > 0) {
    // avoid some standard output
    log.error(
      `\n\n\nERROR: TypeScript linting (dtslint) failed with ${errorDetails.errorCount} error(s):\n\n${errorText}`,
    );
    throw new Error(
      `\n\n\nTypeScript linting (dtslint) failed with ${errorDetails.errorCount} error(s) and ${errorDetails.warningCount} warning(s), check the log above for details`,
    );
  } else if (lintErrorText.match(/error/i) && errorDetails.warningCount === 0) {
    // no error, no warning, but the output still contains the term "error"? Sounds fishy.
    const warning =
      `\n\n\nWARNING: TypeScript linting (dtslint) appears to have succeeded even without warnings, but the log contains the term "error:\n` +
      lintErrorText;
    log.warn(warning);
  } else {
    log.info(
      `\nTypeScript linting (dtslint) SUCCESS ${
        errorDetails.warningCount > 0
          ? "(with " + errorDetails.warningCount + " warning(s))"
          : ""
      }`,
    );
  }
}

function getAllDTSFiles(directory: string) {
  let aFiles = fs.readdirSync(directory);
  aFiles = aFiles.filter((file) => file.endsWith("d.ts")); // not ".d.ts" due to different name in Maven world
  for (let i in aFiles) {
    aFiles[i] = path.join(directory, aFiles[i]);
  }
  return aFiles;
}

function prepareIndexFile(aFilesToTest: string[], targetDir: string) {
  const indexFile = aFilesToTest.filter((file) => file.endsWith("index.d.ts"));
  if (indexFile.length === 0) {
    generateIndexFile(aFilesToTest, targetDir);
  } else {
    filterExistingIndexFileAndAddMinTypeScriptVersion(indexFile[0]);
  }
}

/**
 * Create and write a new index.d.ts file which lists all the d.ts files, as dtslint requires this.
 *
 * Note: this index file is not generated when the *.d.ts files are generated. In the UI5 build this is done separately
 * because for the different deliverables (OpenUI5/SAPUI5) different sets of files with different copyright etc. need
 * to be listed.
 *
 * @param aFilesToTest
 * @param targetDir
 */
function generateIndexFile(aFilesToTest: string[], targetDir: string) {
  const indexFileName = path.join(targetDir, "index.d.ts");
  // Set the lowest TypeScript version which dtslint should use for checking
  let lines = [MIN_TYPESCRIPT_VERSION_LINES];
  lines = lines.concat(
    aFilesToTest.map(
      (file) => '/// <reference path="./' + path.basename(file) + '"/>',
    ),
  );
  const newFileContent = lines.join("\n") + "\n";
  log.info("index.d.ts file generated for dtslint:\n" + newFileContent);
  fs.writeFileSync(indexFileName, newFileContent);
  aFilesToTest.unshift(indexFileName);
}

function filterExistingIndexFileAndAddMinTypeScriptVersion(indexFile: string) {
  let fileContent = fs.readFileSync(indexFile, "utf-8");
  let lines = fileContent.split("\n");

  const dir = path.dirname(indexFile);
  lines = lines.filter((line) => {
    // Check if the line follows the pattern
    const match = line.match(/\/\/\/ <reference path="(.+)"\/>/);
    if (!match) {
      return true;
    }

    // Check if the referenced file exists in the directory of the original file
    const referencePath = match[1];
    const fullReferencePath = path.join(dir, referencePath);

    return fs.existsSync(fullReferencePath);
  });

  // Rewrite the file
  const newFileContent = MIN_TYPESCRIPT_VERSION_LINES + "\n" + lines.join("\n");
  log.info("index.d.ts file filtered for dtslint:\n" + newFileContent);
  fs.writeFileSync(indexFile, newFileContent, "utf-8");
}

// parses the dtslint output and tries to build a structure with the contained information
function getErrorDetails(lintErrorText: string) {
  const FILE_LINE_PATTERN = /^(([/\\].*)\.ts)$/; // needed to set the context for ERROR_LINE_PATTERN
  const ERROR_LINE_PATTERN = /^\s*(\d+):(\d+)\s+error\s+([^\s]+)\s+(.*)$/; // standard linting error, example:    152:1  error  Invalid JSDoc tag name "experimental"  jsdoc/check-tag-names
  const ANY_ERROR_STRING_PATTERN = /error/i;
  const lines = lintErrorText.split("\n");
  let line,
    counter = 0,
    errorCount = 0,
    warningCount = 0,
    match,
    match2,
    fileName,
    lineNumberString,
    lineNumber: number,
    linePos: string,
    ruleName,
    ruleDescription,
    errorObjects: DTSLintErrorObject[] = [],
    errorStringsFound = 0,
    errorsParsed = 0;
  for (let i = 0; i < lines.length; i++) {
    line = lines[i];
    if (line.trim().length === 0) {
      continue;
    }
    if (line.match(ANY_ERROR_STRING_PATTERN)) {
      errorStringsFound++;
    }
    if ((match = line.match(FILE_LINE_PATTERN))) {
      fileName = match[1]; // set the context: the following lines belong to this file
    } else if ((match = line.match(ERROR_LINE_PATTERN))) {
      [, lineNumberString, linePos, ruleDescription, ruleName] = match;
      lineNumber = parseInt(lineNumberString, 10);
      lineNumber--; // in this kind of errors, the line number is 1-based
      errorsParsed++;

      const ui5Module = findContainingModule(fileName, lineNumber);
      const lineContent = getFileContentAroundLine(fileName, lineNumber, 0);

      let ignore = ignoreError({
        ruleName,
        fileName,
        lineNumber,
        errorMessagePlus: line,
        codeLine: lineContent,
        ui5Module,
      });
      if (ignore) {
        continue;
      }

      let onlyWarning = isWarning({
        ruleName,
        fileName,
        lineNumber,
        errorMessagePlus: line,
        codeLine: lineContent,
        ui5Module,
      });
      if (onlyWarning) {
        warningCount++;
      } else {
        errorCount++;
      }

      const hint = getSolutionHint({ ruleName });

      errorObjects.push({
        index: counter,
        type: onlyWarning ? "WARNING" : "ERROR",
        message: line,
        ruleName: ruleName,
        ruleDescription: ruleDescription,
        hint: hint,
        fileName: fileName,
        lineNumber: lineNumber,
        linePos: linePos,
        module: ui5Module,
        lineContent: lineContent,
      });
    } else if (line.startsWith("    at")) {
      // that's ok, a line displaying the stacktrace from where the lint exception was thrown
    } else {
      // some error messages are multi-line... ignore the rest
    }
  }
  if (errorStringsFound > 0 && errorsParsed === 0) {
    // check whether the string parsing found no errors despite there were (e.g. because dtslint output format changed). This will hopefully prevent any unexpected errors from slipping through.
    throw new Error(`
Internal error: The string parsing of the dtslint output found no errors although the output contained the term 'error' (${errorStringsFound} times).
This is a hint that dtslint either encountered a general error (details below) or might have been updated and changed its format, so the parsing needs to be adapted.
As dtslint version "latest" is being used, this could suddenly happen for ALL lint/voter runs without any related change in UI5 code.
The actual error message was:
${lines.join("\n")}`);
  }
  return {
    errorCount: errorCount,
    warningCount: warningCount,
    errorObjects: errorObjects,
  };
}

function ignoreError(errorData: ErrorInfo) {
  const {
    ruleName,
    fileName,
    lineNumber,
    errorMessagePlus,
    codeLine,
    ui5Module,
  } = errorData;
  return ignoreList.some((ignoreEntry: IgnoreEntry) => {
    return (
      (!ignoreEntry.ruleName || ruleName === ignoreEntry.ruleName) &&
      (!ignoreEntry.fileName || fileName.endsWith(ignoreEntry.fileName)) &&
      (!ignoreEntry.ui5Module || ui5Module === ignoreEntry.ui5Module) &&
      (!ignoreEntry.errorMessage ||
        errorMessagePlus.indexOf(ignoreEntry.errorMessage) > -1) &&
      (!ignoreEntry.codeSubstring ||
        codeLine.indexOf(ignoreEntry.codeSubstring) > -1) &&
      ignoreEntry.status === "ignore"
    );
  });
}

function isWarning(errorData: ErrorInfo) {
  const {
    ruleName,
    fileName,
    lineNumber,
    errorMessagePlus,
    codeLine,
    ui5Module,
  } = errorData;
  return ignoreList.some((ignoreEntry: IgnoreEntry) => {
    return (
      (!ignoreEntry.ruleName || ruleName === ignoreEntry.ruleName) &&
      (!ignoreEntry.fileName || fileName.endsWith(ignoreEntry.fileName)) &&
      (!ignoreEntry.ui5Module || ui5Module === ignoreEntry.ui5Module) &&
      (!ignoreEntry.errorMessage ||
        errorMessagePlus.indexOf(ignoreEntry.errorMessage) > -1) &&
      (!ignoreEntry.codeSubstring ||
        codeLine.indexOf(ignoreEntry.codeSubstring) > -1) &&
      ignoreEntry.status === "warning"
    );
  });
}

function getSolutionHint(errorData: { ruleName: string }) {
  const { ruleName } = errorData;
  var entry = hintList.find((hintEntry) => {
    return ruleName === hintEntry.ruleName;
  });
  return entry ? entry.hint : "";
}

function createTexts(errorDetails: DTSLintErrorSummary) {
  let errorNumber = 0,
    warningNumber = 0,
    warningTexts: string[] = [],
    errorTexts: string[] = [];
  for (let i = 0; i < errorDetails.errorObjects.length; i++) {
    const error = errorDetails.errorObjects[i];

    const origin = error.module
      ? "Probably in the UI5 source module/file: " + error.module
      : "unknown";

    const onlyWarning = error.type === "WARNING";
    if (onlyWarning) {
      warningNumber++;
    } else {
      errorNumber++;
    }

    const hint = error.hint ? `\n	==> Solution Hint:\n	${error.hint}\n` : "";

    (onlyWarning ? warningTexts : errorTexts).push(`

============= ${onlyWarning ? "WARNING" : "ERROR"} ${
      onlyWarning ? warningNumber : errorNumber
    } of ${
      onlyWarning ? errorDetails.warningCount : errorDetails.errorCount
    } ============================

	==> Error message from dtslint
	${error.message}

	==> Error location: line ${error.lineNumber}, character ${
    error.linePos
  } of file ${error.fileName}
${hint}
	==> Origin of issue: ${origin}

	==> File content around error line in the generated ${error.fileName} file:
${getFileContentAroundLine(error.fileName, error.lineNumber, 3)}
`);
  }
  return {
    warningText: warningTexts.join("\n\n"),
    errorText: errorTexts.join("\n\n"),
  };
}

function getFullFileContent(fileName: string) {
  let fileContent;
  if (!(fileContent = mFileContents[fileName])) {
    fileContent = mFileContents[fileName] = fs
      .readFileSync(fileName)
      .toString()
      .split("\n");
  }
  return fileContent;
}

/**
 *
 * @param fileName - the full file name
 * @param lineNumber - one-based!! First line of the file has number 1.
 * @param contextLineCount - how many lines before and after the error line to display
 * @returns
 */
function getFileContentAroundLine(
  fileName: string,
  lineNumber: number,
  contextLineCount: number,
) {
  let fileContent = getFullFileContent(fileName);
  let result = [];
  for (
    let i = Math.max(0, lineNumber - contextLineCount);
    i < Math.min(fileContent.length, lineNumber + contextLineCount + 1);
    i++
  ) {
    result.push(
      (i === lineNumber ? (contextLineCount > 0 ? "> " : "") : "| ") +
        fileContent[i],
    );
  }
  return result.join("\n");
}

/**
 * Walks up from the given diagnostic's position to the next preceding module declaration and returns the module name
 *
 * @param fileName - the full file name
 * @param lineNumber - one-based!! First line of the file has number 1.
 * @returns the module name
 */
function findContainingModule(fileName: string, lineNumber: number) {
  lineNumber--; // inside, the number is zero-based
  let fileContent = getFullFileContent(fileName);
  const MODULE_DECLARATION_PATTERN = /^\s*declare module "([^\"]+)" {/;
  const NAMESPACE_DECLARATION_PATTERN = /^\s*declare namespace ([^\s]+) {/;
  const NAMESPACE_PATTERN = /^\s+namespace ([^\s]+) {/;
  const CLASS_PATTERN =
    /^\s*(?:export(?: default)?)?\s+class ([^\s]+)( [\{\w].*)?$/;
  const FUNCTION_PATTERN = /^\s+[\w0-9]+\(/;
  const OBJECT_PATTERN = /^\s+[\w0-9]+: \{/;

  let pathSegments: string[] = [],
    currentWhitespaceLength = -1;

  // now walk up line by line; as soon as leading whitespace length is reduced, the line defines a new namespace, class or module which needs to be added
  let currentLineNumber = lineNumber;
  while (currentLineNumber >= 0) {
    const lineText = fileContent[currentLineNumber];
    let match = lineText.match(/^(\s*)[^\s]+.*/);
    if (match && currentWhitespaceLength === -1) {
      currentWhitespaceLength = match[1].length;
    }

    // TODO: also ignore comments!
    if (lineText.match(/^\s*$/)) {
      // empty line, ignore and proceed
    } else {
      let newWhitespaceLength = match[1].length;
      if (
        newWhitespaceLength < currentWhitespaceLength ||
        currentLineNumber === lineNumber
      ) {
        // nesting level reduced, this line is significant for a new namespace segment
        currentWhitespaceLength = match[1].length;

        if ((match = lineText.match(CLASS_PATTERN))) {
          pathSegments.unshift(match[1]);
        } else if ((match = lineText.match(NAMESPACE_PATTERN))) {
          pathSegments.unshift(match[1]);
        } else if ((match = lineText.match(NAMESPACE_DECLARATION_PATTERN))) {
          pathSegments.unshift(match[1]);
        } else if ((match = lineText.match(FUNCTION_PATTERN))) {
          // function definition, ignore for now
          // TODO: could be used to specify the location more precisely
        } else if ((match = lineText.match(OBJECT_PATTERN))) {
          // object definition, ignore for now
          // TODO: could be used to specify the location more precisely
        } else if ((match = lineText.match(MODULE_DECLARATION_PATTERN))) {
          pathSegments = [match[1].replace(/\//g, ".")];
        } else {
          // nothing significant; ignore
        }
      }
      if (newWhitespaceLength === 0) {
        break;
      }
    }

    currentLineNumber--;
  }

  return pathSegments.join(".");
}
