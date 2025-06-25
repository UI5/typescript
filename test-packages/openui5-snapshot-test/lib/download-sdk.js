const { resolve } = require("path");
const { pick } = require("lodash");
const { writeJsonSync } = require("fs-extra");
const { log } = require("./utils/logger");

/*
 * This file is the entry point for the download of SAPUI5 libraries for the test in this sub-project. It:
 * 1. Reads the version of the snapshot from the local package.json file.
 * 2. Fetches the metadata of SAPUI5 libraries.
 * 3. Fetches the possible OpenUI5 library names and filters out the metadata of OpenUI5 libraries.
 * 4. Expands the transitive dependencies of the OpenUI5 libraries.
 * 5. Downloads the api.json files of the libraries.
 */

async function main() {
  const {
    downloadApiJsonFiles,
    downloadDtsgenrcFiles,
    expandTransitiveDeps,
    getOpenUI5PossibleLibNames,
    getSAPUI5LibsMeta,
  } = await import("@ui5/dts-generator/src/js-utils/ui5-metadata.js");
  const pkgJson = require("../package.json");
  const version = pkgJson.snapshot.version;
  const ui5LibsMeta = await getSAPUI5LibsMeta(version);
  const openUI5Meta = Object.fromEntries(
    Object.entries(ui5LibsMeta).filter(
      ([name, info]) => info.npmPackageName?.startsWith("@openui5")
    )
  ); 
  const allDependentOpenUI5Libs = expandTransitiveDeps(
    pkgJson.snapshot.libs,
    openUI5Meta
  );

  const inputSdkDir = resolve(__dirname, "..", "input-sdk");
  await downloadApiJsonFiles(allDependentOpenUI5Libs, version, inputSdkDir);
  await downloadDtsgenrcFiles(allDependentOpenUI5Libs, version, inputSdkDir);
  const openUI5MetaPath = resolve(inputSdkDir, "openui5-meta.json");
  log(`writing: ${openUI5MetaPath}`);
  writeJsonSync(openUI5MetaPath, pick(openUI5Meta, allDependentOpenUI5Libs));
}

main();
