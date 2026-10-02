# TypeScript 7 Migration

This document covers the migration of `@ui5/ts-interface-generator` to work in a TypeScript 7 world. It explains the background, the approach taken, risks, and the state of the emerging TS7 compiler API.

## Background

### What happened with TypeScript 7

TypeScript 7.0 (released July 2026) is a ground-up rewrite of the TypeScript compiler in Go. The primary goal was performance — 10× faster compilation for large projects. However, this rewrite came with a major consequence for tooling authors: **TypeScript 7.0 ships no programmatic JavaScript API**.

Where `require("typescript")` previously gave you the full compiler API (parser, type checker, AST factory, printer, watch mode, etc.), TS 7.0's main entry point exports only two things:

```js
import ts from "typescript"; // TS 7.x
ts.version; // "7.0.2"
ts.versionMajorMinor; // "7.0"
// That's it. No createProgram, no TypeChecker, no factory, nothing.
```

The entire compiler now runs as a native Go binary (`tsgo`), and the npm package is essentially a thin wrapper that invokes it.

### The compatibility story

Microsoft provides two paths forward:

1. **The `typescript` npm package still publishes 6.x versions** (6.0.3 as of this writing). Pinning `"typescript": "6.0.3"` in `dependencies` gives you the full TS6 compiler API. There is also a separate `@typescript/typescript6` package that re-publishes the same code under a different name (useful when you need both TS6 and TS7 in the same scope), but for bundled dependencies where pnpm isolates versions, the regular package works fine.

2. **`typescript/unstable/*`** — New API subpaths shipped inside the `typescript` 7.x package (starting with 7.0.2). These provide a _different_, Go-backed API surface. More on this below.

### What this means for `@ui5/ts-interface-generator`

The ts-interface-generator deeply uses the TS compiler API to:

- **Parse** user TypeScript projects via `ts.createWatchCompilerHost` / `ts.createWatchProgram`
- **Analyze types** via `ts.TypeChecker` (walking class hierarchies, resolving symbols, inspecting metadata)
- **Construct AST nodes** via `ts.factory.*` (40+ call sites building declaration file content)
- **Print** generated declarations via `ts.createPrinter`
- **Inspect JSDoc** via `ts.getJSDocCommentsAndTags`

All of these APIs are gone in TS 7.0. The tool was previously configured with `typescript` as a **peer dependency** (`>=5.2.0 <7.0.0`), meaning any user who upgraded to TS7 would break it.

## Migration approach

### No version detection needed

An important observation: the ts-interface-generator uses the TS compiler API exclusively to **read and analyze** user code. The generated `.gen.d.ts` output is standard TypeScript declaration syntax that works with any TS version. There is no version-dependent branching in the generator — the only "version check" in the codebase tests the **UI5 type definition version** (whether `sap/ui/base/Event` has generics), not the TypeScript version.

This means:

- We don't need to detect the user's TypeScript version
- We don't need dual-API dispatch (TS6 path vs TS7 path)
- Bundling exactly one TS version internally is sufficient
- A future migration to the TS7 API would be a clean cutover, not a fork

### Phase 1: Bundle TS6 (current implementation)

The immediate solution: change `typescript` from a peer dependency to a **direct dependency** (pinned to 6.0.3), so the tool bundles its own compiler internally. This is the same pattern that `@ui5/dts-generator` already uses.

**What this means for users:**

- Users can have **any** TypeScript version in their project (5.x, 6.x, 7.x)
- The ts-interface-generator uses its own bundled TS6 to analyze their code
- npm/pnpm properly isolate the two installations — no conflicts
- The generated `.gen.d.ts` files work with any TS version

**Fixes applied alongside:**

- **`baseUrl` → `pathsBasePath` fallback**: TS7 projects won't have `baseUrl` in their tsconfig (it's removed). The tool now falls back to the internal `pathsBasePath` property that TS6 populates when `paths` is specified without `baseUrl`.
- **Diagnostic filtering for unknown compiler options**: When the user's tsconfig contains options that the bundled TS6 doesn't recognize (e.g. future TS7-specific options), those warnings are now silently filtered. They're noise — the user's own TS validates the tsconfig. The program still creates correctly.

### Phase 2: Future migration to TS7 API (planned)

Once the TS7 compiler API stabilizes (expected with TS 7.1), the plan is to migrate from the bundled TS6 to the native TS7 API. Since we always bundle exactly one TypeScript version, this is a straightforward cutover: update the bundled dependency, adapt the call sites to the new API surface, and ship a new version.

No abstraction layer or runtime API switching is needed — we don't support multiple TS backends simultaneously.

The TS compiler API is used in these modules:

- `typeScriptEnvironment.ts` — watch mode setup (`createWatchCompilerHost`, `createWatchProgram`, `createSemanticDiagnosticsBuilderProgram`)
- `interfaceGenerationHelper.ts` — heavy TypeChecker usage (symbol resolution, type inspection, class hierarchy walking, JSDoc extraction)
- `astGenerationHelper.ts` — 40+ `ts.factory.*` call sites for AST construction
- `astToString.ts` — `createSourceFile`, `createPrinter`, `printer.printNode`
- `addSourceExports.ts` — `typeChecker.getSymbolAtLocation`, `typeChecker.getExportsOfModule`
- `generateTSInterfacesAPI.ts` — `program.getCompilerOptions`, `program.getSourceFiles`, `program.isSourceFileFromExternalLibrary`

The TS7 API is structured differently from TS6 (class-based instead of function-based, different import paths, some APIs renamed or missing — see the mapping table below). When the time comes, the migration will touch all of these modules, but the changes are mechanical (import path + call pattern). The mapping table below documents the correspondence.

#### Current status

This is **not yet actionable** because the TS7 compiler API is incomplete — the `Program`, `Checker`, and `Emitter` classes exist in `typescript/unstable/sync` but their methods fail at runtime in TS 7.0.2 (the Go IPC mechanism is not connected). The AST layer (factory, type guards, enums) works standalone already, but without a functioning TypeChecker the tool cannot operate. Phase 2 is on hold until the API matures.

## Risks and limitations

### Language-level ceiling

The bundled TS6 compiler can only parse syntax it knows. If a future TypeScript 7.x release introduces **new syntax** (not just new compiler options or type system features), the bundled TS6 won't be able to parse files using that syntax.

In practice, this is low risk for now:

- TS 7.0 itself adds no new syntax — it's a runtime rewrite
- New syntax tends to arrive in minor releases (7.1, 7.2, ...) and adoption is gradual
- When it happens, we upgrade the bundled compiler (to a newer TS6 point release, or to TS7 if its API is ready)

### SyntaxKind enum stability

The `SyntaxKind` enum values are **stable across TS versions** (verified identical across TS 5.7 through 6.0). The TS7 unstable API also exports the same `SyntaxKind`. This is not a risk.

### Unknown compiler options

When the user's `tsconfig.json` contains options that the bundled TS6 doesn't recognize, TS6 emits diagnostic codes 5023/5025 ("Unknown compiler option"). These are now filtered. The program still creates and the TypeChecker still works — these diagnostics are informational, not fatal.

### Two TypeScript installations

With the bundled approach, a user's project may have two TypeScript installations: their own (e.g. TS 7.x for `tsc`) and the ts-interface-generator's bundled TS6. Package managers (npm, pnpm) resolve them independently, so they don't interfere with each other. The bundled TS is visible under `@ui5/ts-interface-generator` in `node_modules` but does not affect the user's own compilation.

### Watch mode

The TS7 unstable API does not yet expose any equivalent to `createWatchCompilerHost` or `createWatchProgram`. The ts-interface-generator's watch mode relies entirely on these TS6 APIs. A future TS7 migration will need to either:

- Wait for watch-mode support in the TS7 API
- Implement file watching externally (e.g. via `chokidar`) and re-create the Program on each change
- Use the TS7 `Project` class if it turns out to support incremental updates

## TS7 unstable API surface (as of 7.0.2)

TypeScript 7.0.2 ships `./unstable/*` subpaths inside the `typescript` package. These are ESM-only imports. The API is structured into layers:

### AST layer (works standalone — no Go backend needed)

| Subpath                           | Exports                                                                                                                                                                                  | Notes                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `typescript/unstable/ast`         | `SyntaxKind`, `ScriptTarget`, `ScriptKind`, `NodeFlags`, `ModifierFlags`, JSDoc utilities (`getJSDocTags`, `getAllJSDocTags`, `getTextOfJSDocComment`), comment range utilities, scanner | 409 exports total                                     |
| `typescript/unstable/ast/factory` | `createIdentifier`, `createTypeReferenceNode`, `createSourceFile`, `createNodeArray`, `createClassDeclaration`, ...                                                                      | 370 factory functions — covers most of `ts.factory.*` |
| `typescript/unstable/ast/is`      | `isClassDeclaration`, `isIdentifier`, `isPropertyDeclaration`, `isTypeReferenceNode`, ...                                                                                                | 347 type guard functions — covers `ts.is*`            |
| `typescript/unstable/ast/visitor` | `visitEachChild`, `visitNode`, `visitNodes`                                                                                                                                              | 8 exports                                             |
| `typescript/unstable/ast/utils`   | `escapeLeadingUnderscores`, `formatSyntaxKind`, `cast`, `tryCast`                                                                                                                        | 6 exports                                             |
| `typescript/unstable/ast/scanner` | Scanner for tokenizing                                                                                                                                                                   |                                                       |
| `typescript/unstable/ast/clone`   | Node cloning utilities                                                                                                                                                                   |                                                       |

These are pure JavaScript functions that work without the Go backend. They can be used today for AST construction and inspection.

### Compiler layer (requires Go backend — not functional in 7.0.2)

| Subpath                     | Exports                                                                                                              | Notes      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| `typescript/unstable/sync`  | `API`, `Program`, `Checker`, `Emitter`, `Project`, `Snapshot`, `Symbol`, `Signature`, `NodeHandle` + type flag enums | 44 exports |
| `typescript/unstable/async` | Async versions of the above                                                                                          |            |

The sync API follows a class-based pattern:

```js
const api = new API();
api.ensureInitialized();
const config = api.parseConfigFile("tsconfig.json");
const program = new Program(api, config);
const checker = new Checker(program);
const emitter = new Emitter(program);
```

**Current status (7.0.2):** The classes can be instantiated, but any method that touches the compiler (e.g. `program.getSourceFileNames()`, `checker.getSymbolAtLocation()`, `emitter.printNode()`) fails with `Cannot read properties of undefined (reading 'apiRequest')`. The Go IPC mechanism is not connected. This is expected to be resolved in TS 7.1.

### API mapping: TS6 → TS7 unstable

| TS6 API                                      | TS7 Unstable equivalent                                           | Status in 7.0.2          |
| -------------------------------------------- | ----------------------------------------------------------------- | ------------------------ |
| `ts.createWatchCompilerHost()`               | _None found_                                                      | ❌ Not available         |
| `ts.createWatchProgram()`                    | _None found_                                                      | ❌ Not available         |
| `ts.createSemanticDiagnosticsBuilderProgram` | _None found_                                                      | ❌ Not available         |
| `ts.createProgram()` / `new ts.Program()`    | `new Program(api, config)`                                        | ⚠️ Exists, Go IPC broken |
| `program.getTypeChecker()`                   | `new Checker(program)`                                            | ⚠️ Exists, Go IPC broken |
| `program.getSourceFiles()`                   | `program.getSourceFileNames()` + `program.getSourceFile(name)`    | ⚠️ Exists, Go IPC broken |
| `program.isSourceFileFromExternalLibrary()`  | `program.isSourceFileFromExternalLibrary()`                       | ⚠️ Exists, Go IPC broken |
| `ts.createPrinter()` / `printer.printNode()` | `new Emitter(program)` / `emitter.printNode()`                    | ⚠️ Exists, Go IPC broken |
| `ts.factory.createIdentifier()` etc.         | `typescript/unstable/ast/factory`                                 | ✅ Works                 |
| `ts.isClassDeclaration()` etc.               | `typescript/unstable/ast/is`                                      | ✅ Works                 |
| `ts.SyntaxKind.*`                            | `typescript/unstable/ast` → `SyntaxKind`                          | ✅ Works                 |
| `ts.ScriptTarget.*`                          | `typescript/unstable/ast` → `ScriptTarget`                        | ✅ Works                 |
| `ts.getJSDocCommentsAndTags()`               | `typescript/unstable/ast` → `getJSDocTags()`, `getAllJSDocTags()` | ✅ Works                 |
| `ts.addSyntheticLeadingComment()`            | _Not found in unstable exports_                                   | ❌ Not available         |
| `typeChecker.getSymbolAtLocation()`          | `checker.getSymbolAtLocation()`                                   | ⚠️ Exists, Go IPC broken |
| `typeChecker.getExportsOfModule()`           | `checker.getExportsOfModule()`                                    | ⚠️ Exists, Go IPC broken |
| `typeChecker.getTypeOfSymbol()`              | `checker.getTypeOfSymbol()`                                       | ⚠️ Exists, Go IPC broken |
| `typeChecker.getAmbientModules()`            | _Not found_                                                       | ❌ Not available         |
| `typeChecker.typeToString()`                 | `checker.typeToString()`                                          | ⚠️ Exists, Go IPC broken |

### Key observations for future migration

1. **The AST layer is ready.** Factory functions, type guards, and enums work today. The 40+ `ts.factory.*` call sites in `astGenerationHelper.ts` could theoretically be migrated to `typescript/unstable/ast/factory` imports already.

2. **The compiler layer is not ready.** Program creation, type checking, and emission all depend on Go IPC that doesn't function in 7.0.2.

3. **Watch mode has no equivalent.** The TS7 API has `Project` (which might handle incremental updates) but no `createWatchCompilerHost`. External file watching may be needed.

4. **Some APIs are missing entirely.** `addSyntheticLeadingComment` (used for adding comments to generated AST nodes) and `getAmbientModules` (used to enumerate declared modules) have no equivalent in the unstable API surface.

5. **The API is class-based, not function-based.** Instead of `program.getTypeChecker()` returning a TypeChecker, you construct `new Checker(program)`. This changes the instantiation pattern but the methods on `Checker` closely mirror the old `TypeChecker`.

6. **ESM only.** The unstable subpaths are ES modules. If the ts-interface-generator is compiled to CommonJS, it would need to use dynamic `import()` or be converted to ESM.

## References

- [TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/typescript-7/)
- [TS 7.1 milestone (API work)](https://github.com/microsoft/TypeScript/milestone/224)
- [`@typescript/typescript6` package](https://www.npmjs.com/package/@typescript/typescript6)
- [Blog post: TypeScript 6 and 7 — What UI5 TypeScript Developers Need to Know](https://community.sap.com/t5/technology-blog-posts-by-sap/typescript-6-and-7-what-ui5-typescript-developers-need-to-know-in-2026/ba-p/14393526)
