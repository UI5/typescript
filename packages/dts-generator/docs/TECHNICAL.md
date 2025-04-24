# Technical Details

## The @ui5/dts-generator API

### `generate(...)`

Generate the \*.d.ts file content for a UI5 library, given its `api.json` file.<br>
This API is used with file names. The loading (and saving of the result) is handled by the API.<br>
In detail, it does:

- load directives from given files and merge them into one object
- load api.json files (result is cached)
- call the `generateFromObjects(...)` API, which does the actual generation, with the api.json, directives and the dependencies' api.json files
- save the \*.d.ts file
- optionally, run `checkCompile(...)` using the TypeScript compiler to check for issues (note that `checkDtslint(...)` is _not_ run by this API).

### `generateFromObjects(...)`

Generate the *.d.ts file content for a UI5 library.<br>
In contrast to the `generate(...)` API, this API does operate on file *contents* and returns the result as *string\*. The caller has to take care of loading file contents first and saving the result. This may be useful for plugging into a build pipeline.<br>
Details about [how the generation works can be found below](#implementation).

### `generateFromPaths(...)`

Generate the \*.d.ts file content for a UI5 library.<br>
In contrast to the `generate(...)` API, this API does not require lists of files, but only their containing directory path for some of the arguments. It will then collect the files and call `generate(...)`. This is mainly meant to support the built-in CLI where at least for manual execution from the command line passing many files would be cumbersome. But it may also make API calls easier to set up for some users.

### `checkCompile(...)`

Run the TypeScript compiler on the given \*.d.ts files, analyze the errors, ignore certain known errors listed in the built-in ignore list, and output hints, so developers working on the respective UI5 libraries can understand the issues easier.
Note: the caller has to ensure that the type definitions on which the UI5 types depend (jQuery, qUnit, etc.) are available.

### `checkDtslint(...)`

Run the dtslint tool on the given \*.d.ts files/directory.
Note: the caller has to ensure that the type definitions on whih the UI5 types depend (jQuery, qUnit, etc.) ar available.

## Implementation: the @ui5/dts-generator Phases<a id='implementation'></a>

The generator works in several phases, which are reflected as modules in [`src/phases`](./src/phases):

### Phase 1: `fixApiJson` in `json-fixer.js`

Using `directives` as input and the information whether modules or globals should be generated, this phase does plenty of adjustments in the original api.json files:

- `mergeOverlays` merges in the overlays from directives
- `validateNames` does some rudimentary sanity checks for real-world issues which are otherwise hard to debug
- `substituteSapClassInfoTypedef` adds the sap.ClassInfo typedef
- `convertCoreAndConfigurationIntoANamespace` converts `sap.ui.core.Core` and `sap.ui.core.Configuration` from a class (needed as such in the SDK) into a namespace because the module export of both is an _instance_, not the class
- `moveTypeParametersFromConstructorToClass` moves any type parameters from a class's constructor to the class itself. It is more common to build a generic class than building a constructor that has a generic parameter. Newer versions of UI5 (starting with 1.113) will already export the api.json like that, the code in `moveTypeParametersFromConstructorToClass` can handle this.
- `fixBasenames` (e.g. "Level" -> "Log.Level" or "Type" -> "Storage.Type" or "Entry" -> "URLWhitelist.Entry")
- `moveFunctionsAttachedToFunctionsIntoNamespaces` creates synthetic namespace for functions on functions, e.g.: "jQuery.sap.resources.isBundle()", "sap.ui.component.load()", "sap.ui.require.toUrl()"
- `convertNamespacesIntoTypedefsOrInterfaces` converts namespaces which are used as substitute for static objects into something else (static object or typedef); contains hardcoded knowledge about sap.ui.Device and uses "namespacesToInterfaces" directive; examples: 'jQuery.sap.PseudoEvents', 'jQuery.sap.storage', 'module:sap/base/Log', 'sap.ui.base.BindingInfo', 'sap.ui.core.AppCacheBuster', 'sap.ui.core.BusyIndicator' to object and 'sap.ui.core.AbsoluteCSSSize', 'sap.ui.core.Collision', 'sap.ui.core.CSSColor', 'sap.ui.core.Dock', 'sap.ui.core.URI' to typedef.
- `determineMissingExportsForTypes` adds exports for typedefs and interfaces where they are needed for the designtime - they are so far omitted because not needed at runtime
- `parseTypeExpressions` converts all type expressions into a TypeScript AST
- `markDeprecatedAliasesForEnums` marks enums (based on the directives) which are deprecated and should only be generated as alias for the new replacement enum
- `addForwardDeclarations` (from directives) - this relates to inverse dependencies
- `addInterfaceWithModuleNames` adds all visible modules to `sap.IUI5DefineDependencyNames`, which is merged across libraries from TypeScript perspective and can be used to type module imports
- `addConstructorSettingsInterfaces` and `addEventParameterInterfaces` create two additional interfaces defining important structures:

  1.  for each ManagedObject subclass an interface that describes the settings object, to be used in the constructor
  1.  for each event an interface which lists its parameters

  These steps operate on all currently handled \*.d.ts files (main one and dependencies) together, while the other steps operate in an isolated way on single files; moving this step to the beginning or end leads to trouble, so for the time it has to be done at this point of the chain and is a kind of sync point separating the preceding steps bundled within `_prepareApiJson(...)` and the subsequent steps bundled in `_fixApiJson(...)`. This separation has historic reasons: everything before `_fixApiJson(...)` was once implemented outside this repository.

- `addImplicitNamespaces` (examples: "jQuery.sap.storage", "sap.base.util", "sap.ui.base.ManagedObject", "sap.ui.core.Component")
- `removeBadSymbols` (from directives) - entities not existing at runtime or irrepairably broken documentation-wise
- `removeRestrictedInterfaces`, `removeRestrictedSymbols` and `removeRestrictedMembers` remove everything that is not public/protected

### Phase 2: `jsonToAst` in `json-to-ast.js`

Creates from the `api.json` an AST structure as defined in `ast.d.ts`.

### Phase 3: `buildSymbolTable` in `symbols.js`

Creates a table containing all symbols.

### Phase 4: `transformAst` in `ast-transform.js`

Applies some changes to the AST:

- filters out all non-public/protected APIs (again?)
- updates the type of the `aDependencies` parameter for `sap.ui.define(...)` and `sap.ui.require(...)`: in addition to any string, it can also be one of the known UI5 module names. This allows for code completion of these names.
- adds "parent" properties to the AST nodes

### Phase 5: `fixAsts` in `ast-fixer.js`

Applies several fixes to enable d.ts generation:

- fixConstructors (name := "constructor", delete "returns")
- fixOptionalParams (Creates additional mutations of function signatures for two cases: 1. where there is an optional param before mandatory params, 2. for omissible params where the subsequent params can be shifted towards the beginning of the param list. This happens for namespace functions, for class/interface methods and for constructors.)

### Phase 6: `genDts` in `dts-code-gen.js`

This is where the actual TypeScript code is produced:

- Walks the AST and creates the JSDoc comments and most importantly the type definitions for the \*.d.ts file; returns it as long string

### Phase 7: `postProcess` in `post-process.js`

Tweaks the dts file content:

- for sap.ui.core: prepends a long preamble with the jQuery object (will be merged by TypeScript with the original jQuery types) and the functions attached to it
- for sap.ui.export: rewrites the namespace "export" because it is a reserved name
