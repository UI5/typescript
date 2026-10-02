import ts from "typescript";
import { performance } from "perf_hooks";
import log from "loglevel";

/*
 * This sets up TypeScript.
 * In watch mode, the callback flow after each change is:
 * 0.) reportWatchStatusChanged is called with initially NO program, later an old program, and undefined error count and "message TS6032: File change detected. Starting incremental compilation..."
 * 1.) createProgram notifies that a change was detected
 * 2.) afterProgramCreate is called with the new Program, but it is not yet known whether there are errors
 * 3.) reportDiagnostic is called for each error; the file name can be derived for each
 * 4.) reportWatchStatusChanged is then called with an error summary, the error count and "message TS6194: Found 4 errors. Watching for file changes." and can still access the new updated program
 *
 */

interface GlobalToModuleMapping {
  [key: string]: { moduleName: string; exportName?: string };
}

type TSProgramUpdateCallback = (
  program: ts.Program,
  typeChecker: ts.TypeChecker,
  changedFiles: string[],
  allKnownGlobals: GlobalToModuleMapping,
) => void;

let newProgram: ts.SemanticDiagnosticsBuilderProgram;
let newChangedFiles: string[] = [];

let onTSProgramUpdate: TSProgramUpdateCallback;

let watch: ts.WatchOfConfigFile<ts.SemanticDiagnosticsBuilderProgram>;
let options: { watchMode?: boolean };

function initialize(
  configFile: string,
  onTSProgramUpdateCallback: TSProgramUpdateCallback,
  optionsParameter: { watchMode?: boolean } = {},
) {
  if (onTSProgramUpdate) {
    throw new Error(
      "There may be only ONE call to either initializeForOneRun or initializeWatchMode",
    );
  }
  onTSProgramUpdate = onTSProgramUpdateCallback;
  options = optionsParameter;

  // initialize TypeScript program
  log.info(
    "Initializing TypeScript program with all source files and type definitions (this may take a few seconds)...",
  );

  if (!options.watchMode) {
    // in non-watch mode monkey-patch the TypeScript system to avoid misleading console output mentioning watch mode
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalTSwrite = ts.sys.write;
    ts.sys.write = (text) => {
      text = text.replace(
        "Starting compilation in watch mode...",
        "Starting compilation...",
      );
      text = text.replace("Watching for file changes.", "");
      originalTSwrite(text);
    };
  }

  const host = ts.createWatchCompilerHost(
    configFile,
    { noEmit: true },
    ts.sys,
    ts.createSemanticDiagnosticsBuilderProgram,
    reportDiagnostic,
    options.watchMode ? reportWatchStatusChanged : undefined,
  );

  // override the "after program create" function because we need access to the new "program"
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const origPostProgramCreate = host.afterProgramCreate;
  host.afterProgramCreate = (program) => {
    // in run-once mode we immediately trigger generation and then close the watch
    if (!options.watchMode) {
      log.info("Run-once mode: running generation now.");
      onProgramChanged(program, []);
      // TODO: shut down the watcher
      setTimeout(function () {
        // must be asynchronously because createWatchProgram(...) below triggers this synchronously, so the return value "watch" is not yet assigned
        log.info("\n\nDone. Exiting.");
        watch.close();
      }, 0);
    }

    // continue with watchMode case handling

    // to avoid an endless loop triggered by the modification of the generated files, we need to check which files were changed
    let diag = program.getSemanticDiagnosticsOfNextAffectedFile();
    const changedFiles = [];
    while (diag) {
      const aff = diag.affected;
      if ((aff as ts.SourceFile).kind) {
        changedFiles.push((aff as ts.SourceFile).fileName);
      } else {
        log.debug(
          `### Changed: ${(aff as ts.Program).getRootFileNames().join(", ")}`,
        );
        throw new Error(
          "Not a source file change, but a program change caused the watch mode to trigger. This is unexpected. What does this mean? How did it happen?",
        );
      }
      diag = program.getSemanticDiagnosticsOfNextAffectedFile();
    }
    newChangedFiles = changedFiles;
    newProgram = program;
    origPostProgramCreate(program);
  };

  watch = ts.createWatchProgram(host);
}

// TODO: do we need to inspect the errors? For erroneous TS files parsing and hence interface creation may fail, but does this mean the interface should be deleted or not?
// some errors will even ALWAYS occur before the interface was created, at least as soon as the constructor lines have been added: the $XYSettings type will then not exist.
function reportDiagnostic(diagnostic: ts.Diagnostic) {
  // this is called for all TypeScript errors during compilation
  // not sure yet how we can benefit

  // we can filter out the errors which are caused by the interface not yet being generated
  if (diagnostic.code === 2304) {
    if (
      typeof diagnostic.messageText === "string" &&
      diagnostic.messageText.match(/Cannot find name '\$.+Settings'./)
    ) {
      // caused by not-yet generated interface
      return;
    }
  }

  // Filter out unknown compiler option warnings.
  // When the user's tsconfig contains options the bundled TypeScript version doesn't recognize
  // (e.g. options introduced in newer TS versions), these diagnostics are noise —
  // the user's own TS installation validates the tsconfig.
  if (diagnostic.code === 5023 || diagnostic.code === 5025) {
    return;
  }

  // The remaining errors MAY be real — some may still be caused by access to API
  // methods when the interface is not yet generated.
  // In watch mode they can be ignored (the editor shows them). In run-once / CI
  // mode we log them so they're visible in the build output.
  if (!options.watchMode) {
    log.warn(
      ts.formatDiagnosticsWithColorAndContext([diagnostic], {
        getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
        getCanonicalFileName: (f) => f,
        getNewLine: () => ts.sys.newLine,
      }),
    );
  }
}

/**
 * Once the watch reaction cycle is through, we trigger the interface generation
 */
function reportWatchStatusChanged(diagnostic: ts.Diagnostic) {
  if (diagnostic.code === 6031 || diagnostic.code === 6032) {
    // "[File change detected.] Starting compilation in watch mode..."
    // initial call or before compilation on update
  } else if (diagnostic.code === 6193 || diagnostic.code === 6194) {
    // 'Found X errors. Watching for file changes.'
    // after compilation on update, this is what we are interested in
    if (newProgram) {
      // TODO: handle errorCount
      newChangedFiles = newChangedFiles.filter(
        (fileName) => !fileName.endsWith(".gen.d.ts"),
      ); // not interested in changes to generated files
      if (newChangedFiles.length) {
        const timer_begin = performance.now();
        if (!options.watchMode) {
          log.debug("Changed files:\n- " + newChangedFiles.join("\n- "));
        }
        onProgramChanged(newProgram, newChangedFiles);
        const timer_end = performance.now();
        log.debug(
          `Handling the file change took ${(timer_end - timer_begin).toFixed(
            1,
          )} ms.`,
        );
      } else {
        // no files modified/deleted
        // TODO: handle file deletion... how? On EVERY change check whether the files which are responsible for the known interfaces are still there??
        // TODO: also handle class renaming
        //log.debug("no changes detected")
      }
    } else {
      // should not happen
      throw new Error(
        "reportWatchStatusChanged: diagnostic.code === 6194, but globalProgram not available",
      );
    }
  } else {
    // other diagnostic codes (e.g. unknown compiler option warnings) can be ignored
    log.debug(
      `reportWatchStatusChanged: ignoring diagnostic code ${diagnostic.code}`,
    );
  }
}

/**
 * Called whenever there is an actual change or when run in run-once mode
 *
 * @param builderProgram
 * @param changedFiles an empty array in non-watch mode and always an
 */
function onProgramChanged(
  builderProgram: ts.SemanticDiagnosticsBuilderProgram,
  changedFiles: string[],
) {
  const program = builderProgram.getProgram();
  const typeChecker = program.getTypeChecker();
  const allKnownGlobals: GlobalToModuleMapping =
    getAllKnownGlobals(typeChecker);

  // call the callback
  onTSProgramUpdate(program, typeChecker, changedFiles, allKnownGlobals);
}

function getAllKnownGlobals(
  typeChecker: ts.TypeChecker,
): GlobalToModuleMapping {
  const allKnownGlobals: GlobalToModuleMapping = {};

  // build a map of all known modules declared in the d.ts files (and elsewhere) along with their respective exports (so we can correctly identify enums which do not live in a module on their own)
  typeChecker.getAmbientModules().forEach((mod) => {
    const exports: string[] = [];
    mod.exports.forEach((exp) => {
      // collect the exports of this module
      exports.push(exp.name);
      // add an entry to globals for module lookup
      let globalName = mod.name
        .replace(/["']/g, "")
        .replace(/\/library$/, "")
        .replace(/\//g, ".");
      const moduleName = mod.name.replace(/["']/g, "");
      const entry: { moduleName: string; exportName?: string } = {
        moduleName: moduleName,
      };
      if (exp.name !== "default") {
        globalName += "." + exp.name;
        entry.exportName = exp.name;
      }
      allKnownGlobals[globalName] = entry;
    });
  });

  return allKnownGlobals;
}

export { initialize, getAllKnownGlobals, GlobalToModuleMapping };
