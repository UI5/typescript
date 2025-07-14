[![npm (scoped)](https://img.shields.io/npm/v/@ui5/dts-generator.svg)](https://www.npmjs.com/package/@ui5/dts-generator)

# @ui5/dts-generator

This npm package is used for generating (and checking) TypeScript type definitions (`*.d.ts` files) for SAPUI5/OpenUI5 libraries implemented in JavaScript. Input for this generation are the `api.json` files which describe the API of a library.

These `api.json` files for a UI5 library can be generated with the normal UI5 build tools using the command `ui5 build jsdoc`, executed within the root folder of the respective library. This works for your own custom libraries as well as for the original UI5 sources.
This command creates the `api.json` file at `dist/test-resources/<library_namespace_and_name>/designtime/api.json` (do not confuse this file with the `api.json` file one folder below inside `apiref` - that one is meant for the UI5 SDK). For the api.json files of original UI5 libraries, however, there is also a download tool provided.

For the original UI5 framework libraries, the resulting type definitions are published as [@sapui5/types](https://www.npmjs.com/package/@sapui5/types) and [@openui5/types](https://www.npmjs.com/package/@openui5/types).

The generator can produce both, the standard "ES modules" version of the type definitions as well as the legacy "globals" version of the types, which is released as `ts-types` but will be discontinued for UI5 2.x.

In addition to the generation, this package also provides means to _check_ the generated `*.d.ts` files in two ways:

1. by compiling them with the TypeScript compiler and
2. by running a `dtslint` check.

   The latter is only done because it is required for publishing the resulting type definitions at [DefinitelyTyped](http://definitelytyped.org/). The UI5 team only applies this check to the OpenUI5 libraries which are actually published there, not for the other libraries in SAPUI5. A working `dtslint` check is notoriously difficult to maintain due to changing requirements and a missing API (only CLI), hence it is only recommended when a release via DefinitelyTyped is required.

Details about the implementation of this package can be found in [docs/TECHNICAL.md](docs/TECHNICAL.md).

## Usage

Install the latest version via npm:

`npm install @ui5/dts-generator --save-dev`

You can then use the tool either from the command line as CLI or from your own NodeJS code using its APIs.

- For using it as CLI, which is probably the typical use-case, a complete [end-to-end example from creating the library to generating the type definitions can be found on this page](docs/end-to-end-sample.md).
- For using one of the APIs, there is an [example a few sections below](#generatefromobjects-example).

> NOTE: Make sure to use at least version 3.x of the dts-generator, as its usage, API and functionality changed vastly compared to previous versions 2.x and below!

A simple CLI call looks like this (you can use the value of the `apiObject` from the sample as content of the API json file):

`npx @ui5/dts-generator <api_json_file> --targetFile <dts_target_file>`

But normally you need to pass additional arguments related to libraries on which your library depends and maybe to generation directives.

### The APIs

There are several alternative APIs for type generation. The difference is what input they require. Choose the most suitable one from:

- `generate`: generate the `*.d.ts` **file** for one UI5 library from its `api.json` **file** (and optionally other **files**)
- `generateFromObjects`: generate the `*.d.ts` content as **string** for one UI5 library from its `api.json` **content** given as JS object (and optionally other **objects**)
- `generateFromPaths`: generate the `*.d.ts` **file** for one UI5 library from its `api.json` **file** (and optionally other directory **paths**)

The api.json download utility API is:

- `downloadApiJson`: download api.json files for OpenUI5 libraries on which your library depends. Usually this is at least `sap.ui.core`, which contains all the base classes like `sap.ui.core.Control`.

The check APIs are:

- `checkCompile`: test d.ts files by running a TypeScript compilation
- `checkDtslint`: run the dtslint tool provided by DefinitelyTyped

Please see the [TypeScript API](./types/api.d.ts) for a detailed documentation and the respective arguments.

### The CLIs

When started from the command line, the main file `index.js` is an entry point for generating `*.d.ts` files. When you got the package from npm, you will typically call this using `npx @ui5/dts-generator`. But when you checked out the sources, you can call `index.js` directly:

```
Usage:
npx ui5-dts-generator <apiFile> <options>

(or: npx @ui5/dts-generator <apiFile> <options>)

(or: node <path-to-file>/index.js <apiFile> <options>)

With:
<apiFile>               File path+name of the api.json file for the library for which the d.ts file should be generated.

<options>:
  -h, --help            Show this help message and exit
  --dependenciesApiPath PATH
                        Directory where the api.json files are located for the libraries on which the currently to-be-built library depends.
  --dependenciesDTSPathForCheck PATH
                        Directory where the d.ts files are located of the libraries on which the currently to-be-built library depends. Typically used for
                        other UI5 libraries for which types are being generated in the same build run. Only needed for the check.
  --dependenciesTypePackagesForCheck
                        The names of type packages on which the currently to-be-built library depends. Typically used for other UI5 libraries being
                        developed separately. E.g. for @types/openui5 when the current build is for a library developed outside the UI5 teams. Only needed
                        for the check.
  --directivesPath PATH
                        Directory where the .dtsgenrc files for the libraries (current and dependencies) are located.
  --targetFile FILE
                        File path and name of the target d.ts file to write.
  --verbose             Set when the console output should be verbose.
  --skipCheckCompile    Set when the test compilation should be skipped.
  --dependenciesDTSPathForCheckForGlobals PATH
                        Directory where the d.ts files (using globals, not ES modules) are located of the libraries on which the currently to-be-built library
                        depends. Only needed when globals are generated and the check is run.
  --targetFileForGlobals FILE
                        File path and name of the target d.ts file to write for the type definitions with globals (not ES modules). Only needed when globals
                        should be generated.
```

The file `download-apijson.js` is used to fetch the `api.json` files which are needed in the above call for `--dependenciesApiPath`. In the npm package it is exposed as a separate binary and can be called as `npx ui5-download-apijson`.

```
Usage:
npx ui5-download-apijson <libs> <version> <options>

(or: node <path-to-file>/download-apijson.js <libs> <version> <options>)

With:
<libs>                  Comma-separated list of OpenUI5 library names, like: sap.ui.core,sap.m
<version>               Full version string of a UI5 version currently available from CDN, like: 1.120.2
<options>:
  -h, --help            Show this help message and exit
  --targetDir PATH      Directory where the downloaded files shall be saved. Optional; if not given, the following path is used: ./temp/dependency-apijson
```

The file `runCheck.js` is used for triggering a check of the generated `*.d.ts` files.

```
Usage:
node <path-to-file>/runCheck.js <dtsDir> [-h, --help] [--verbose] [--checkDtslint]

With:
<dtsDir>          File path+name of the api.json file for the library for which the d.ts file should be generated.

<options>:
  -h, --help      show this help message and exit
  --verbose       Set when the console output should be verbose.
  --checkDtslint  Set when the test compilation should be skipped.
```

### API Usage Example `generateFromObjects`<a id='generatefromobjects-example'></a>

```javascript
import { generateFromObjects } from "@ui5/dts-generator";
// Note: as the dts-generator is implemented as ES modules, this import only works
// when your code is an ES module as well. You can e.g. set "type": "module" in your
// package.json to enable ES module support.
// Otherwise, you can use:
// const { generateFromObjects } = await import("@ui5/dts-generator");

// This is the content of some minimal api.json file with a class.
// Normally these files are huge (3.5 MB in case of the sap.ui.core library),
// containing all APIs and documentation of the library,
// and are created by the UI5 build tools (as explained above).
const apiObject = {
  "$schema-ref": "http://schemas.sap.com/sapui5/designtime/api.json/1.0",
  version: "1.120.0",
  library: "my.lib",
  symbols: [
    {
      kind: "class",
      name: "module:my/lib/MyClass",
      basename: "MyClass",
      resource: "my/lib/MyClass.js",
      module: "my/lib/MyClass",
      export: "",
      visibility: "public",
      description: "A dummy class",
      methods: [
        {
          name: "doSomething",
          visibility: "public",
          description: "Does something",
        },
      ],
    },
  ],
};

// Directives help the dts generator handle typos and other inconsistencies in api.json files.
// They are maintained as '.dtsgenrc' files within some of the UI5 control libraries, e.g. in
// sap.ui.core, sap.m, and sap.f
const directives = {};

// Trigger the d.ts generation (async, so await the result)
const result = await generateFromObjects({
  apiObject,
  directives,
  dependencyApiObjects: [
    // Array of api.json files for library dependencies
    // (as plain JavaScript objects just like libJsonData).
    // The above dummy library has no dependencies, hence the array is empty,
    // but real control libraries will usually have at least sap.ui.core as dependency,
    // because that's where the required base classes like sap.ui.core.Control live.
  ],
});

// Usually one would output the d.ts content to a file instead.
console.log(result.dtsText);
```

When the above code is executed, the resulting type definition written to the console looks like this:

```ts
// For Library Version: 1.120.0

declare module "my/lib/MyClass" {
  /**
   * A dummy class
   */
  export default class MyClass {
    /**
     * Does something
     */
    doSomething(): void;
  }
}

declare namespace sap {
  interface IUI5DefineDependencyNames {
    "my/lib/MyClass": undefined;
  }
}
```

The last block which may be unexpected at first sight is for providing code completion in `sap.ui.require`/`sap.ui.define` statements.

> NOTE: This code only works when the library has no dependency on other UI5 libraries. But regular libraries e.g. contain controls, which inherit from `sap.ui.core.Control`, so there is at least a dependency to the `sap.ui.core` library. In such cases, the `dependencyApiObjects` property must contain the `api.json` files of all such dependency libraries.

## Support

For problems caused by the transformation process implemented in this dts-generator, please open [issues](https://github.com/UI5/typescript/issues) in this repository on GitHub.<br>
However, issues in the UI5 type definitions which are also present in the [API documentation](https://ui5.sap.com/#/api) originate from the JSDoc comments in the original OpenUI5/SAPUI5 code, so please directly open an [OpenUI5](https://github.com/SAP/openui5/issues)/SAPUI5 ticket in this case.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
