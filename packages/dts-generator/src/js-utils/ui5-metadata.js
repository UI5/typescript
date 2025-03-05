import { resolve } from "path";
import { promises as fs } from "fs";
import path from "path";
import _ from "lodash";
const { zipObject, map, union, flatMap } = _;

import writeUrlToFile from "./write-url-to-file.js";
import { getLogger } from "@ui5/logger";
const log = getLogger("@ui5/dts-generator/download-apijson");

// This is JavaScript, so it can be used from the tests package regardless of the transpilation state of the dts-generator

/*
 * This file contains functions to get metadata of SAPUI5 libraries and download them:
 * - getSAPUI5LibsMeta fetches the metadata of SAPUI5 libraries for a specific version from the @sapui5/distribution-metadata package
 *   which is meant for tooling consumption via unpkg.com.
 * - getOpenUI5PossibleLibNames fetches the names of all OpenUI5 libraries from the npm registry by assuming that all OpenUI5 libraries
 *   are scoped with @openui5 and everything scoped with @openui5 is an OpenUI5 library. It does not try to look for a specific version because
 *   getting a superset of all library names is fine.
 * - expandTransitiveDeps finds the transitive dependencies of the given libraries and returns the list of all libraries including the transitive dependencies.
 * - downloadApiJsonFiles downloads the api.json files of the specified libraries from the openui5.org CDN.
 * - downloadDtsgenrcFiles downloads the .dtsgenrc files of the specified libraries from the openui5 GitHub repository - if they exist.
 * - loadDirectives loads directives from the specified .dtsgenrc files and merges them into a single object.
 */

/**
 * Fetches the metadata of all SAPUI5 libraries for a specific version from the @sapui5/distribution-metadata package on npm.
 * For accessing the etadata file directly, it uses the unpkg.com CDN.
 * @param {string} version
 * @returns {Promise<Record<string, UI5Lib>>}
 */
export async function getSAPUI5LibsMeta(version) {
  const version_pattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:[^0-9].*)?$/; // .* to cover any potential suffixes; being ready for that is more important than being 100% strict
  if (!version_pattern.test(version)) {
    throw new Error(
      `Version is given as '${version}', but must be a full UI5 version string like '1.120.2'.`,
    );
  }
  const fetch = (await import("node-fetch")).default;
  const sapUI5Response = await fetch(
    `https://unpkg.com/@sapui5/distribution-metadata@${version}/metadata.json`,
    {
      headers: {
        "User-Agent": "@ui5-dts-generator",
      },
    },
  );
  if (!sapUI5Response.ok) {
    log.error(`error fetching sapui5 metadata`);
    return [];
  }
  const sapUI5MetadataText = await sapUI5Response.text();
  const sapUI5Metadata = JSON.parse(sapUI5MetadataText);
  return sapUI5Metadata.libraries;
}

/**
 * Gets the names of all possible OpenUI5 libraries from npmjs by assuming that all OpenUI5 libraries are scoped with @openui5.
 * @returns {Promise<string[]>}
 */
export async function getOpenUI5PossibleLibNames() {
  const fetch = (await import("node-fetch")).default;
  const openUI5OrgResponse = await fetch(
    `https://registry.npmjs.com/-/v1/search?text=@openui5&size=250`,
    {
      headers: {
        "User-Agent": "@ui5-dts-generator",
      },
    },
  );
  if (!openUI5OrgResponse.ok) {
    log.error(`error fetching sapui5 metadata`);
    return [];
  }
  const openUI5OrgSearchText = await openUI5OrgResponse.text();
  const openUI5OrgSearch = JSON.parse(openUI5OrgSearchText);
  const possibleOpenUI5LibNames = openUI5OrgSearch.objects
    .map((packageObject) => packageObject.package.name)
    .filter((name) => name.startsWith("@openui5/sap"))
    .map((name) => name.replace("@openui5/", ""));
  return possibleOpenUI5LibNames;
}

/**
 * Finds the transitive dependencies of the given libraries (by using the information in the given metadata) and returns
 * the list of all libraries including the transitive dependencies.
 *
 * @param {string[]} libs
 * @param {Object} libsMetadata
 * @returns {string[]}
 */
export function expandTransitiveDeps(libs, libsMetadata) {
  let allDeps = libs;
  let addedLastIteration = libs.length;
  libs.forEach((lib) => {
    if (!libsMetadata[lib]) {
      throw new Error(`One of the libraries was given as '${lib}', but this library does not seem to exist among the OpenUI5 libraries in the given version.
      Available OpenUI5 libraries in this version are: ${Object.keys(libsMetadata).join(",")}.`);
    }
  });
  do {
    const nextLayerDeps = flatMap(allDeps, (_) => libsMetadata[_].dependencies);
    const nextLayerAllDeps = union(allDeps, nextLayerDeps);
    addedLastIteration = nextLayerAllDeps - allDeps.length;
    allDeps = nextLayerAllDeps;
  } while (addedLastIteration > 0);

  return allDeps;
}

async function prepareDirectory(dir) {
  // Asynchronously check if the directory exists
  let dirExists = await fs
    .access(dir)
    .then(() => true)
    .catch(() => false);

  // Directory does not exist, so create it
  if (!dirExists) {
    await fs.mkdir(dir, { recursive: true });
    return;
  }

  // Directory exists, so empty it - but not if there are unexpected files inside
  const files = await fs.readdir(dir, { withFileTypes: true }); // read the directory

  for (const file of files) {
    // throw error if a file or directory does not end with "api.json" or ".dtsgenrc"
    if (
      !file.name.endsWith("api.json") &&
      !file.name.endsWith(".dtsgenrc") &&
      !file.name.endsWith("openui5-meta.json")
    ) {
      throw new Error(`The given target directory '${dir}' already contains files or subdirectories other than '*api.json', '*.dtsgenrc' and 'openui5-meta.json' ones - e.g. '${file.name}'.
        This tool needs an empty target directory and would delete any of the mentioned files, but not other files. Please give an empty directory
        or one that does not exist yet (it will be created).`);
    }
  }

  // delete everything in the directory
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      await fs.rmdir(filePath, { recursive: true });
    } else {
      await fs.unlink(filePath);
    }
  }
}

/**
 * Downloads the api.json files of the specified libraries from the openui5.org CDN.
 *
 * @param {string[]} libs
 * @param {string} version
 * @param {string} outDir
 * @returns {Promise<void>}
 */
export async function downloadApiJsonFiles(libs, version, outDir) {
  await prepareDirectory(outDir);

  // CDN libraries (example URL):
  // https://sdk.openui5.org/${version}/test-resources/sap/m/designtime/api.json
  const baseUrl = `https://sdk.openui5.org/${version}/test-resources/`;
  const libraryNameToApiJsonFileUrl = zipObject(
    libs,
    map(libs, (_) => `${baseUrl}${_.replace(/\./g, "/")}/designtime/api.json`),
  );
  // Write files in parallel
  const result = await Promise.all(
    map(libraryNameToApiJsonFileUrl, (url, name) => {
      return writeUrlToFile(url, resolve(outDir, `${name}.api.json`));
    }),
  );
  if (!result.every(Boolean)) {
    log.error(
      "At least one of the api.json files could not be downloaded. Please check whether the requested version is still available on CDN (otherwise e.g. request a newer patch level) and contains all the libraries.",
    );
  }
}

/**
 * Downloads the .dtsgenrc files of the specified libraries from the openui5 GitHub repository.
 *
 * @param {string[]} libs
 * @param {string} version
 * @param {string} outDir
 * @param {boolean} [prepareDir=false] whether to create/empty the output directory before downloading
 * @returns {Promise<void>}
 */
export async function downloadDtsgenrcFiles(
  libs,
  version,
  outDir,
  prepareDir = false,
) {
  if (prepareDir) {
    await prepareDirectory(outDir);
  }

  // GitHub libraries (example URL):
  // https://raw.githubusercontent.com/SAP/openui5/${version}/src/sap.m/.dtsgenrc
  const baseUrl = `https://raw.githubusercontent.com/SAP/openui5/${version}/src/`;
  const libraryNameToDtsgenrcFileUrl = zipObject(
    libs,
    map(libs, (_) => `${baseUrl}${_}/.dtsgenrc`),
  );
  // Write files in parallel
  await Promise.all(
    map(libraryNameToDtsgenrcFileUrl, (url, name) => {
      return writeUrlToFile(url, resolve(outDir, `${name}.dtsgenrc`));
    }),
  );
}

/**
 * Loads the content of a JSON file; if the file is a .dtsgenrc file, it removes comments before parsing.
 * @param file - Path to JSON file
 * @returns {Promise<any>}
 */
async function loadJSON(file) {
  let content = await fs.readFile(file, "utf8");
  if (file.endsWith(".dtsgenrc")) {
    const stripJsonComments = (await import("strip-json-comments")).default;
    // allow comments in .dtsgenrc files
    content = stripJsonComments(String(content));
  }
  return JSON.parse(content);
}

/**
 * Loads directives from the specified .dtsgenrc files and merges them into a single object.
 * @param directivesFiles - Array of full path + file names of directives files
 * @returns
 */
export async function loadDirectives(directivesFiles) {
  const directives = {
    badSymbols: [],
    badMethods: [],
    badInterfaces: [],
    typeTyposMap: {},
    namespacesToInterfaces: {},
    forwardDeclarations: {},
    fqnToIgnore: {},
    overlays: {},
  };
  function mergeDirectives(loadedDirectives) {
    Object.keys(loadedDirectives).forEach((key) => {
      if (Array.isArray(directives[key])) {
        directives[key] = directives[key].concat(loadedDirectives[key]);
      } else if (directives[key]) {
        Object.assign(directives[key], loadedDirectives[key]);
      } else {
        directives[key] = loadedDirectives[key];
      }
    });
  }
  await Promise.all(
    directivesFiles.map(async (file) => mergeDirectives(await loadJSON(file))),
  );
  return directives;
}
