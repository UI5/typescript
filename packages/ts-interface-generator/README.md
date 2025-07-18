# @ui5/ts-interface-generator

This npm package supports UI5 control development in TypeScript by generating TypeScript interfaces which declare the methods generated by UI5 only at runtime.

## Status

<b>IMPORTANT: this tool is BETA-quality work in progress right now, with limitations. And there might be changes ahead which require users to adapt. However, it should already be capable of creating useful control interfaces which will save you quite some manual work.</b> Feedback has been thoroughly positive; the issues encountered so far (and their solutions) can be monitored in the [issue tracker](https://github.com/UI5/typescript/issues?q=is%3Aissue+label%3Ats-interface-generator+).<br>
Note the "TODO" section below as well.<br>
Also note that the purpose of this tool is _not_ to transpile the TypeScript controls to JavaScript. It only ensures TypeScript development can happen smoothly without being blocked by the TypeScript compiler not knowing the methods and structures generated by UI5 at runtime.

To keep track of changes and improvements, see the [Change Log](https://github.com/UI5/typescript/blob/main/packages/ts-interface-generator/CHANGELOG.md)

## Installation

Go into a directory containing a TypeScript project which includes UI5 controls written in TypeScript (written as ES6 classes!). Install this generator as dev dependency by doing:

```sh
npm install --save-dev @ui5/ts-interface-generator
```

## Usage

To start the generator, run:

```sh
npx @ui5/ts-interface-generator --watch
```

This requires a `tsconfig.json` file to be present in the same directory in order to find the source files and the dependencies (e.g. those declaring the UI5 types). You can alternatively specify the tsconfig file to be used by adding the `--config ./path/to/my-better-tsconfig.json` parameter.

The interface generation is then run a) initially and b) on every TypeScript source file modification or addition.
In case you want only a single generation run, omit the `--watch` parameter.

For further options, e.g. regarding the generated JSDoc, see the respective section below.

After generation, next to the control implementation there will be an additional `MyClassName.gen.d.ts` file. (More precisely: for every class which derives from ManagedObject and defines API metadata.) This file contains an interface declaring the methods generated at runtime and an interface defining the constructor settings object. It is generated in a way that makes TypeScript recognize it as <i>addition</i> to the regular control implementation (using [interface merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#merging-interfaces) and [module augmentation](https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation)).

Generated interfaces are (as of now) never deleted (even when the original class is deleted), but always completely overridden in case of a new interface generation run.

In case you want to delete all generated interface files, you can do so manually, e.g. by doing the following (first line only needed once):

```sh
npm install shx --save-dev
npx shx rm **/*.gen.d.ts
```

### Commandline Options

This is the list of available command-line arguments, including the ones already mentioned above:

- `--help`: Display this list of command-line arguments
- `--version`: Display the version of the generator
- `-c`, `--config`: Path to the configuration file to use
- `-w`, `--watch`: Run in watch mode
- `--loglevel`: Set the console logging verbosity; options are: `error`, `warn`, `info`, `debug`, `trace`; default level is `info`
- `--jsdoc`: Set the amount of JSDoc which should be generated; options are: `none`, `minimal`, `verbose`; default is `verbose`: by default, the JSDoc documentation written in the control metadata for the properties, aggregations etc. is added to the generated methods, plus generic documentation for the `@param` and `@returns` tags as well as some additional generic documentation like for default values (if any). By setting `--jsdoc none` or `--jsdoc minimal` you can decide to omit all JSDoc or to only add the JSDoc written in the control.

## Why?

When developing UI5 controls, the control metadata declares properties, aggregations, events etc. The methods related to these (like `getText()` for a `text` property or `attachPress(...)` for a `press` event) do not need to be implemented - they are generated by the UI5 framework at runtime.

However, as the TypeScript environment does not know about these methods, a call to any of them will be marked as error in the source code. And on top of this, there is also no code completion for these methods and no type information and in-place documentation for parameters and return values.

This is a problem for application code using controls developed in TypeScript as well as for the development of these controls in TypeScript. Both development scenarios involve calling those API methods which are not known to the TypeScript environment. Thus, there needs to be a way to make TypeScript aware of them.

(Remark: the controls shipped with the UI5 framework are implemented in JavaScript and a complete set of TypeScript type definitions is created during the framework build from the JSDoc comments. So both facets of the problem do not apply to them.)

## How it Works

This tool scans all TypeScript source files for <b>top-level definitions of classes</b> inheriting from `sap.ui.base.ManagedObject` (in most cases those might be sub-classes of `sap.ui.core.Control`, so they will be called "controls" for simplicity).

For any such control, the metadata is parsed, analyzed, and a new TypeScript file is constructed, which contains an interface declaration with the methods generated by UI5 at runtime. This generated interface gets merged with the already existing code using TypeScript's [Declaration Merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) concept.

Unfortunately, these separate interface declarations cannot define new constructors (see e.g. [this related TS issue](https://github.com/microsoft/TypeScript/issues/2957)). Hence those must be manually added to each control (one-time effort, pasting 3 lines of code). The interface generator writes the required lines to the console.

Oh, and the tool itself is implemented in TypeScript because TypeScript makes development more efficient. ;-)

## Limitations

See the [TODO](#TODO) section for examples of features not yet implemented.

In general, if something does not work, try to make the code structure as close as possible to the sample control in this project because right now only the straightforward standard case is supported.

### Recognition of Applicable Classes

There are limits to what the tool can achieve, trying to find and parse the classes for which it needs to generate an interface.

Certain requirements need to be fulfilled to make the detection of classes work, for which interfaces need to be generated:

- the class declaration must be a top-level statement in the file
- the metadata must be declared as a PropertyDeclaration, which is a top-level static member of the class with the name "metadata"
- ...

To detect whether the required constructor signatures are already present in the class implementation, the constructors must syntactically match the content of the suggested three code lines.

### Second(+)-level Inheritance

When there are at least two levels of custom controls (inheriting from each other) and you get the error message: `Class static side 'typeof SomeOtherControl' incorrectly extends base class static side 'typeof MyControl'. The types of 'metadata.properties' are incompatible between these types.`, then you have missed to assign the `MetadataOptions` type to the `metadata` field in the parent class. (Before UI5 version 1.110, you can use the type `object` instead):

```ts
static readonly metadata: MetadataOptions = {
	...
```

See [#338](https://github.com/UI5/typescript/issues/338) for more details.

## TODO

- make sure watch mode does it right (also run on deletion? Delete interfaces before-creating? Only create interfaces for updated files?)
- consider further information like deprecation etc.
- ...

## Support

This tool is supplied as-is, with no support provided. [Issue reports](https://github.com/UI5/typescript/issues) are welcome, as we want to improve it, but there is no guarantee that issue reports will be handled.
