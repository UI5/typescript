[![Continuous Integration](https://github.com/UI5/typescript/actions/workflows/ci.yml/badge.svg?event=push)](https://github.com/UI5/typescript/actions/workflows/ci.yml)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![REUSE status](https://api.reuse.software/badge/github.com/UI5/typescript)](https://api.reuse.software/info/github.com/UI5/typescript)

# UI5-TypeScript

UI5-TypeScript is an npm [mono-repo][mono-repo] that contains tooling to support [TypeScript][typescript] in SAPUI5 and OpenUI5 Projects.
This tooling can enable:

- Better IDE integration for UI5 projects (e.g content assist).
- Using TypeScript compiler to perform type checks on UI5 application code.
- More easily implementing UI5 applications and controls in TypeScript thus enjoying the general benefits of TypeScript.

It currently contains two public packages:

- [@ui5/dts-generator](./packages/dts-generator) [![npm-ui5-dts-generator][npm-ui5-dts-generator-image]][npm-ui5-dts-generator-url] A generator which transforms the UI5 `api.json` format to TypeScript type definition (`*.d.ts`) format. This is useful to enable the type-safe usage of a UI5 control library written in JavaScript in code that uses TypeScript.

- [@ui5/ts-interface-generator](./packages/ts-interface-generator) [![npm-ui5-ts-interface-generator][npm-ui5-ts-interface-generator-image]][npm-ui5-ts-interface-generator-url] A tool supporting control development in TypeScript. It is used at development time and generates type definitions for the control API methods which are only created at runtime by the UI5 framework.

[npm-ui5-dts-generator-image]: https://img.shields.io/npm/v/@ui5/dts-generator.svg
[npm-ui5-dts-generator-url]: https://www.npmjs.com/package/@ui5/dts-generator
[npm-ui5-ts-interface-generator-image]: https://img.shields.io/npm/v/@ui5/ts-interface-generator.svg
[npm-ui5-ts-interface-generator-url]: https://www.npmjs.com/package/@ui5/ts-interface-generator

## How to obtain the UI5 TypeScript signatures?

The UI5 type signatures are created and published as part of the UI5 build process. They are available for SAPUI5 as well as OpenUI5. The SAPUI5 type definitions can be obtained like this:

With npm

`npm install @sapui5/types --save-dev`

With Yarn

`yarn add @sapui5/types --dev`

> **NOTE:** the type definitions define ES6-style module names for the entities. They require the usage of modern JavaScript syntax with ES modules and classes, which requires an additional transformation step that can be run together with the anyway required TypeScript transpilation.
>
> Before the type definitions were generated in ES module style, they did declare all APIs with their global names, which are discouraged to be used and will no longer be available in UI5 2.x. The dts-generator still has the capability to generate this legacy "globals" version of the type definitions, for compatibility reasons. These legacy definitions are released as "ts-types" instead of "types", but will no longer be produced for UI5 2.x.

Find all information about using UI5 with TypeScript at https://sap.github.io/ui5-typescript!

## Usage

To see the suggested project setup for TypeScript development with the `types` packages, please check out the [TypeScript Hello World app](https://github.com/SAP-samples/ui5-typescript-helloworld). It not only can serve as copy template, but also includes a [detailed step-by-step guide](https://github.com/SAP-samples/ui5-typescript-helloworld/blob/main/step-by-step.md) for creating this setup from scratch.

The [TypeScript branch of the "UI5 CAP Event App"](https://github.com/SAP-samples/ui5-cap-event-app/tree/typescript) sample demonstrates a slightly more complex application, using the same setup. It comes with an [explanation](https://github.com/SAP-samples/ui5-cap-event-app/blob/typescript/docs/typescript.md) of what UI5 TypeScript code usually looks like and what to consider.

As mentioned, the best resource for using UI5 with TypeScript is https://sap.github.io/ui5-typescript.

See the [demos](./demos) directory for consumption examples of the legacy signatures.

## Support

For issues caused by the generators please open [issues](https://github.com/UI5/typescript/issues) on GitHub.<br>
However, issues in the UI5 type definitions which are also present in the [API documentation](https://ui5.sap.com/#/api) originate from the JSDoc comments in the original OpenUI5/SAPUI5 code, so please directly open an [OpenUI5](https://github.com/SAP/openui5/issues)/SAPUI5 ticket in this case.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

[typescript]: https://www.typescriptlang.org/
[mono-repo]: https://github.com/babel/babel/blob/master/doc/design/monorepo.md
[openui5]: https://openui5.org/
[ui5-tooling]: https://github.com/SAP/ui5-tooling
