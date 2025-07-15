# Contribution Guide

This is the dts-generator package contribution guide.
Please read the shared [mono-repo contribution](../../CONTRIBUTING.md) guide first.

## Issue Reporting

For problems caused by the transformation process implemented in this dts-generator, please open [issues](https://github.com/UI5/typescript/issues) in this repository on GitHub.<br>
However, issues in the UI5 type definitions which are also present in the [API documentation](https://ui5.sap.com/#/api) originate from the JSDoc comments in the original OpenUI5/SAPUI5 code, so please directly open an [OpenUI5](https://github.com/UI5/openui5/issues)/SAPUI5 ticket in this case.

## SAPUI5 Integration

When proposing changes or contributing code keep in mind that a change also needs to work with SAP's internal build of the various UI5 deliveries. It's not obvious what this means, but this topic might come up when a change is being discussed.

## Heuristics

The transformation process from an api.json to a d.ts file is not straight-forward.
This is because:

- The api.json structure is not well defined and also subject to change.
- The contents of the api.json files are collected from SAPUI5 source code, This means that we are dealing
  with manually entered data which is often not even well validated (e.g JSDoc syntax).
- The semantics of the SAPUI5 type system often does not perfectly match the semantics of the TypeScript type system.

Due to these reasons there are many heuristics and transformations happening during the compilation process.
Inspect the source code and the log when the dts-generator is executed to learn more.
