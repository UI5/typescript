#!/usr/bin/env node

import { getLogger } from "@ui5/logger";
const log = getLogger("@ui5/dts-generator/download-apijson");
import esMain from "es-main";
import _ from "lodash";
const { pick } = _;
import {
  getSAPUI5LibsMeta,
  getOpenUI5PossibleLibNames,
  expandTransitiveDeps,
  downloadApiJsonFiles,
} from "./js-utils/ui5-metadata.js";

/**
 * Utility function that downloads the api.json files for the given OpenUI5 libraries in the given version.
 * Automatically also downloads the api.json files for transitive dependencies.
 * These files are needed for using the dts-generator on an own library.
 *
 * @param libs - the OpenUI5 libraries which are direct dependencies (usually sap.ui.core, but could be more)
 * @param version - the version of UI5 on which this library depends (example: 1.120.2)
 * @param targetDir - the directory into which the api.json files of the dependencies should be downloaded.
 *    The directory must be non-existing or empty. Files that end with *api.json or *.dtsgenrc are ok, but will be deleted.
 *    If no directory is given, "./temp/dependency-apijson" is used.
 * @public
 */
export async function download(
  libs: string[],
  version: string,
  targetDir = "./temp/dependency-apijson",
) {
  const ui5LibsMeta = await getSAPUI5LibsMeta(version);
  const possibleOpenUI5LibNames = await getOpenUI5PossibleLibNames();
  const openUI5Meta = pick(ui5LibsMeta, possibleOpenUI5LibNames);
  const allDependentOpenUI5Libs = expandTransitiveDeps(libs, openUI5Meta);
  log.info("Transitive dependencies: " + allDependentOpenUI5Libs.join(", "));

  //const inputSdkDir = resolve(__dirname, "..", "input-sdk");
  await downloadApiJsonFiles(allDependentOpenUI5Libs, version, targetDir);
  log.info(`Wrote api.json files to: ${targetDir}`);
}

// CLI support for generation of (optionally) both globals and modules flavor in one go
async function main() {
  const start = Date.now();
  const { args } = await import("./utils/arguments-download-apijson.js");

  const { libs, version, targetDir } = args;

  log.info(`Download api.json files for`);
  log.info(`  libs: ${libs}`);
  log.info(`  version: ${version}`);
  log.info(`  targetDir: ${targetDir}`);
  log.info(``);

  await download(
    libs.split(",").map((lib) => lib.trim()),
    version,
    targetDir,
  );

  const end = Date.now();
  log.info(
    `Download completed in ${((end - start) / 1000).toFixed(1)} seconds.`,
  );
}

// if called as CLI, parse arguments and trigger generation
if (esMain(import.meta)) {
  main().then(
    () => {
      log.info(`Done.`);
    },
    (err) => {
      log.error("An error occurred", err);
      process.exit(1);
    },
  );
}
