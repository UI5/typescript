import path from "path";
import fs from "fs";
import ts from "typescript";
import Hjson from "hjson";
import collectClassInfo, { expandDefaultKey } from "./collectClassInfo";
import {
  generateMethods,
  generateSettingsInterface,
  addLineBreakBefore,
  generateEventParameterInterfaces,
  generateEventTypeAliases,
  generateEventWithGenericsCompatibilityModule,
} from "./astGenerationHelper";
import astToString from "./astToString";
import log from "loglevel";
import { addJSDoc as addJSDocAST } from "./jsdocGenerator";
import Preferences from "./preferences";

const factory = ts.factory;

let ManagedObjectSymbol: ts.Symbol,
  ElementSymbol: ts.Symbol,
  ControlSymbol: ts.Symbol,
  WebComponentSymbol: ts.Symbol;

// needs to be called to reset the base classes cache, so they are re-identified in the new type world
function resetBaseClasses() {
  ManagedObjectSymbol = undefined;
  ElementSymbol = undefined;
  ControlSymbol = undefined;
  WebComponentSymbol = undefined;
}

function interestingBaseClassForSymbol(
  typeChecker: ts.TypeChecker,
  symbol: ts.Symbol,
): "ManagedObject" | "Element" | "Control" | "WebComponent" | undefined {
  if (!ManagedObjectSymbol) {
    // cache (execution takes one-digit milliseconds) - TODO: does it need to be refreshed when the UI5 type definitions are updated during a run of the tool, or is the clearing from generateInterfaces sufficient?
    // identify the symbols for the interesting classes
    const managedObjectModuleDeclaration = typeChecker
      .getAmbientModules()
      .filter((m) => m.name === '"sap/ui/base/ManagedObject"')[0]
      ?.declarations[0] as ts.ModuleDeclaration;
    const managedObjectClassDeclaration = (
      managedObjectModuleDeclaration?.body as ts.ModuleBlock
    )?.statements.filter(
      (s) => ts.isClassDeclaration(s) && s.name?.text === "ManagedObject",
    )[0] as ts.ClassDeclaration;
    ManagedObjectSymbol = typeChecker.getSymbolAtLocation(
      managedObjectClassDeclaration?.name,
    );

    const elementModuleDeclaration = typeChecker
      .getAmbientModules()
      .filter((m) => m.name === '"sap/ui/core/Element"')[0]
      ?.declarations[0] as ts.ModuleDeclaration;
    const elementClassDeclaration = (
      elementModuleDeclaration?.body as ts.ModuleBlock
    )?.statements.filter(
      (s) => ts.isClassDeclaration(s) && s.name?.text === "UI5Element",
    )[0] as ts.ClassDeclaration;
    ElementSymbol = typeChecker.getSymbolAtLocation(
      elementClassDeclaration?.name,
    );

    const controlModuleDeclaration = typeChecker
      .getAmbientModules()
      .filter((m) => m.name === '"sap/ui/core/Control"')[0]
      ?.declarations[0] as ts.ModuleDeclaration;
    const controlClassDeclaration = (
      controlModuleDeclaration?.body as ts.ModuleBlock
    )?.statements.filter(
      (s) => ts.isClassDeclaration(s) && s.name?.text === "Control",
    )[0] as ts.ClassDeclaration;
    ControlSymbol = typeChecker.getSymbolAtLocation(
      controlClassDeclaration?.name,
    );

    const webComponentModuleDeclaration = typeChecker
      .getAmbientModules()
      .filter((m) => m.name === '"sap/ui/core/webc/WebComponent"')[0]
      ?.declarations[0] as ts.ModuleDeclaration;
    const webComponentClassDeclaration = (
      webComponentModuleDeclaration?.body as ts.ModuleBlock
    )?.statements.filter(
      (s) => ts.isClassDeclaration(s) && s.name?.text === "WebComponent",
    )[0] as ts.ClassDeclaration;
    WebComponentSymbol = typeChecker.getSymbolAtLocation(
      webComponentClassDeclaration?.name,
    );
  }
  if (symbol === ControlSymbol) {
    return "Control";
  } else if (symbol === ElementSymbol) {
    return "Element";
  } else if (symbol === WebComponentSymbol) {
    return "WebComponent";
  } else if (symbol === ManagedObjectSymbol) {
    return "ManagedObject";
  }
}

const interestingBaseSettingsClasses: {
  [key: string]:
    | "$ManagedObjectSettings"
    | "$ElementSettings"
    | "$ControlSettings"
    | "$WebComponentSettings"
    | undefined;
} = {
  '"sap/ui/base/ManagedObject".$ManagedObjectSettings':
    "$ManagedObjectSettings",
  '"sap/ui/core/Element".$UI5ElementSettings': "$ElementSettings",
  '"sap/ui/core/Control".$ControlSettings': "$ControlSettings",
  '"sap/ui/core/webc/WebComponent".$WebComponentSettings':
    "$WebComponentSettings",
};

type MetadataSectionName = keyof ClassInfo &
  ("properties" | "aggregations" | "associations" | "events");

/**
 * Checks the given source file for any classes derived from sap.ui.base.ManagedObject and generates for each one an interface file next to the source file
 * with the name <className>.gen.d.ts
 *
 * @param sourceFile
 * @param typeChecker
 * @param allKnownGlobals
 * @param {function} [resultProcessor]
 *
 * @public
 */
function generateInterfaces(
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
  allKnownGlobals: GlobalToModuleMapping,
  resultProcessor: (
    sourceFileName: string,
    className: string,
    interfaceText: string,
  ) => void = writeInterfaceFile,
) {
  resetBaseClasses(); // typeChecker might be from a new type world
  const mos = getManagedObjects(sourceFile, typeChecker);

  // find out whether type version 1.115.1 or later is used, where "Event" is a class with generics (this influences what we need to generate)
  let isEventGeneric = false;
  const eventClassDeclaration = typeChecker
    .getAmbientModules()
    .filter((m) => m.name === '"sap/ui/base/Event"')[0]
    ?.exports // @ts-ignore we are asking for the default export
    ?.get("default")?.declarations?.[0];
  if (eventClassDeclaration && ts.isClassDeclaration(eventClassDeclaration)) {
    isEventGeneric =
      eventClassDeclaration.typeParameters?.[0]?.name?.text === "ParamsType";
  }

  mos.forEach((managedObjectOccurrence) => {
    const interfaceText = generateInterface(
      managedObjectOccurrence,
      allKnownGlobals,
      { generateEventWithGenerics: !isEventGeneric },
    ); // only returns the interface text if actually needed (it's not for ManagedObjects without metadata etc.)
    if (interfaceText) {
      resultProcessor(
        sourceFile.fileName,
        managedObjectOccurrence.className,
        interfaceText,
      );
    }
  });
}

/**
 *
 * @param sourceFileName the complete path and name of the original source file, so the generated file can be placed next to it
 * @param className the name of the class for which the interface shall be generated (there may be several classes within one sourceFile)
 * @param interfaceText the interface file content to write
 */
function writeInterfaceFile(
  sourceFileName: string,
  className: string,
  interfaceText: string,
) {
  // file output
  const pathName = path.dirname(sourceFileName);
  const newFileName = path.join(pathName, className + ".gen.d.ts");
  log.info(`Writing interface file: ${newFileName}\n\n`);
  fs.writeFileSync(newFileName, interfaceText);
}

function getManagedObjects(
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
) {
  // First find the default export (in contrast to named exports) of this ES module - we want to find top-level statements like:
  //   export default class MyControl extends Control {...} // direct export of the class
  //   export default MyControl; // export of a variable which holds the class
  // we don't care about other default exports, including instances of the class:
  //   export default new MyControl(); // instance export
  // and we are also not interested in named exports of the class here
  //   export class MyControl extends Control {...} // etc.
  let defaultExport: ts.Identifier | ts.ClassDeclaration | undefined;
  sourceFile.statements.forEach((statement) => {
    if (
      ts.isExportAssignment(statement) &&
      ts.isIdentifier(statement.expression)
    ) {
      defaultExport = statement.expression;
    } else if (ts.isClassDeclaration(statement)) {
      const hasDefaultModifier = statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      );
      if (hasDefaultModifier) {
        defaultExport = statement;
      }
    }
  });

  const managedObjects: ManagedObjectInfo[] = [];
  sourceFile.statements.forEach((statement) => {
    if (ts.isClassDeclaration(statement) && statement.heritageClauses) {
      let managedObjectFound = false;
      statement.heritageClauses.forEach((heritageClause) => {
        heritageClause.types?.forEach((typeNode) => {
          const type = typeChecker.getTypeFromTypeNode(typeNode);
          const symbol = type.getSymbol();
          if (!symbol) {
            throw new Error(
              `Type '${typeNode.getText()}' referenced in ${
                sourceFile.fileName
              } in the inheritance clause '${heritageClause.getFullText()}' could not be resolved.
Check the respective line in the source code: ts there an error for this type? Make sure the type is properly imported.
If a working "import" is not possible and it is a UI5 type (or type from another library), the issue could be caused by the respective type definitions not being available. They must be found by the TypeScript compiler according to the configuration in tsconfig. To verify this step-by-step, you can do the following:
1. Check whether the (UI5 or other) types are added as dependency in package.json (or available as transitive dependency)
2. Check inside which "node_modules" folder the types are actually available - if they are not, check whether "npm install" (or "yarn" etc.) has run successfully - maybe re-run it
3. Check the "tsconfig.json" file: types outside the default "@types" package must be explicitly added in the "types" or "typeRoots" section. Is the name and path correct?
One known cause of this error is that the "typeRoots" setting in tsconfig.json has wrong paths, which are not actually pointing to the correct location of the type definitions.
Or is there a different reason why this type would not be known?`,
            );
          }

          // now check whether this type from which has been inherited is a ManagedObject
          const interestingBaseClass = getInterestingBaseClass(
            type,
            typeChecker,
          );
          if (!interestingBaseClass) {
            return;
          }
          managedObjectFound = true;

          // ok, we have a ManagedObject/Control; now check whether it contains a metadata section, which means that accessor methods need to be generated
          const metadata: ts.PropertyDeclaration[] = <ts.PropertyDeclaration[]>(
            statement.members.filter((member) => {
              if (
                ts.isPropertyDeclaration(member) &&
                ts.isIdentifier(member.name) &&
                // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
                member.name.escapedText === "metadata" &&
                member.modifiers &&
                member.modifiers.some((modifier) => {
                  return modifier.kind === ts.SyntaxKind.StaticKeyword;
                })
              ) {
                return true;
              }
            })
          );
          if (!metadata || metadata.length === 0) {
            // no metadata? => nothing to do
            log.debug(
              `Class ${statement.name ? statement.name.text : ""} in ${
                sourceFile.fileName
              } inherits from ${interestingBaseClass} but has no metadata. This is not necessarily an issue, but if there is a metadata member in this class which *should* be recognized, make sure it has the 'static' keyword!`,
            );
            return;
          } else if (metadata.length > 1) {
            // more than one metadata block??
            log.warn(
              `ManagedObject with ${
                metadata.length
              } static metadata members in class ${
                statement.name ? statement.name.text : ""
              } inside ${
                sourceFile.fileName
              }. This is unexpected. Ignoring this class.`,
            );
            return;
          } else if (!metadata[0].initializer) {
            // exactly one "metadata" declaration, BUT not initialized with the actual metadata value
            // this may mean that someone accidentally wrote "metadata: {...}" instead of "metadata = {...}", which is syntactically correct,
            // but assigns a type structure, not a value. This would fail at runtime, as none of the intended API declarations work, but before
            // failing at runtime, it would fail here in the generator, which later on tries to access the data. So let's warn the user.
            log.warn(
              `Inside file ${sourceFile.fileName}${
                statement.name ? " in class " + statement.name.text : ""
              } there is a metadata declaration without a value. Did you accidentally write "metadata: ..." instead of "metadata = ..."?`,
            );
            return;
          }

          // invariant: there is exactly one metadata block with an initializer

          // now check whether there is a settings type in the superclass
          // (which the generated settings type needs to inherit from)
          // There really should be, because all descendants of ManagedObject should have one!
          let settingsTypeFullName;
          const settingsTypeNode = getSettingsType(type, typeChecker);
          if (settingsTypeNode) {
            const settingsType =
              typeChecker.getTypeFromTypeNode(settingsTypeNode);
            const symbol = settingsType.getSymbol();
            settingsTypeFullName = typeChecker.getFullyQualifiedName(symbol);

            if (settingsTypeFullName.startsWith('"./')) {
              const settingsTypeDeclaration = symbol.getDeclarations()[0];
              const settingsTypeSourceFile =
                settingsTypeDeclaration.getSourceFile().fileName;
              const settingsTypeDirectory = path.dirname(
                settingsTypeSourceFile,
              );
              const managedObjectDirectory = path.dirname(sourceFile.fileName);
              if (managedObjectDirectory !== settingsTypeDirectory) {
                // settings type of superclass is in different directory, hence the generated import will have to traverse to that directory
                const relativePath = path
                  .relative(managedObjectDirectory, settingsTypeDirectory)
                  .replace(/\\/g, "/");
                const match = settingsTypeFullName.match(
                  /".\/([^/]+\/)*([^/]+)".*/,
                );
                if (match) {
                  // insert the relative path
                  settingsTypeFullName =
                    '"./' + relativePath + settingsTypeFullName.slice(2);
                }
              }
            }
          } else if (metadata) {
            throw new Error(
              `'${
                statement.name ? statement.name.text : ""
              }' inherits from '${interestingBaseClass}' and has metadata, but the parent class '${typeChecker.getFullyQualifiedName(
                type.getSymbol(),
              )}' seems to have no settings type. It might have no constructors - this is where the settings type is used. Or the settings type used there and its inheritance chain could not be resolved.

In case this parent class is also in your project, make sure to add its constructors, then try again. A comment with instructions might be in the console output above.
Otherwise, you can temporarily remove this file (${
                sourceFile.fileName
              }) from the project and try again to get the console output with the suggested constructors.
In any case, you need to make the parent class ${typeChecker.getFullyQualifiedName(
                type.getSymbol(),
              )} have constructors with typed settings object to overcome this issue.
`,
            );
          }

          // check for already available constructor signatures (if not found, the console output prompts the user to add them)
          const constructorSignaturesAvailable = checkConstructors(statement);

          const className = statement.name ? statement.name.text : "";

          // is this class a default export?
          const isDefaultExport =
            defaultExport &&
            ((ts.isIdentifier(defaultExport) &&
              defaultExport.text === className) ||
              defaultExport === statement);

          // store the information about the identified ManagedObject/Control
          managedObjects.push({
            sourceFile,
            className,
            isDefaultExport,
            classDeclaration: statement,
            settingsTypeFullName,
            interestingBaseClass,
            constructorSignaturesAvailable,
            metadata,
          });
          return;
        });
        if (managedObjectFound) {
          // do not look at any other heritage clauses
          return;
        }
      });
    }
  });
  return managedObjects;
}

// checks for the presence of the standard constructor signatures, so the tool can report them as missing
function checkConstructors(classDeclaration: ts.ClassDeclaration) {
  let singleParameterDeclarationFound = false,
    doubleParameterDeclarationFound = false,
    implementationFound = false;

  classDeclaration.members.forEach((member: ts.ClassElement) => {
    if (ts.isConstructorDeclaration(member)) {
      if (member.parameters.length === 1 && member.body === undefined) {
        const parameter = member.parameters[0];
        if (parameter.questionToken && ts.isUnionTypeNode(parameter.type)) {
          if (parameter.type.types.length === 2) {
            if (
              isOneAStringAndTheOtherASettingsObject(
                parameter.type.types[0],
                parameter.type.types[1],
              )
            ) {
              singleParameterDeclarationFound = true;
            }
          }
        }
      } else if (member.parameters.length === 2) {
        if (
          isOneAStringAndTheOtherASettingsObject(
            member.parameters[0].type,
            member.parameters[1].type,
          )
        ) {
          if (member.body) {
            implementationFound = true;
          } else {
            doubleParameterDeclarationFound = true;
          }
        }
      } else {
        log.warn(
          `Unexpected constructor signature with a parameter number other than 1 or 2 in class ${member.parent.name.text}`,
        );
      }
    }
  });

  const found =
    singleParameterDeclarationFound &&
    doubleParameterDeclarationFound &&
    implementationFound;
  if (!found) {
    log.debug(
      classDeclaration.name.text +
        " is missing required constructor signatures: " +
        (singleParameterDeclarationFound
          ? ""
          : "\n- constructor declaration with single parameter") +
        (doubleParameterDeclarationFound
          ? ""
          : "\n- constructor declaration with two parameters") +
        (implementationFound
          ? ""
          : "\n- constructor implementation with two parameters"),
    );
  }
  return found;
}

function isOneAStringAndTheOtherASettingsObject(
  type1: ts.TypeNode,
  type2: ts.TypeNode,
) {
  return (
    (type1.kind === ts.SyntaxKind.StringKeyword &&
      ts.isTypeReferenceNode(type2)) || // TODO: more specific check for second type
    (type2.kind === ts.SyntaxKind.StringKeyword &&
      ts.isTypeReferenceNode(type1))
  );
}

/**
 * Returns the type of the settings object used in the constructor of the given type
 * Needed to derive the new settings object type for the subclass from it.
 */
function getSettingsType(
  type: ts.Type,
  typeChecker: ts.TypeChecker,
): ts.TypeNode | undefined {
  const declarations = type.getSymbol().getDeclarations();
  for (let i = 0; i < declarations.length; i++) {
    const declaration = declarations[i] as ts.ClassDeclaration;
    const members = declaration.members;
    for (let j = 0; j < members.length; j++) {
      if (ts.isConstructorDeclaration(members[j])) {
        const settingsType = getSettingsTypeFromConstructor(
          members[j] as ts.ConstructorDeclaration,
          typeChecker,
        );
        if (settingsType) {
          return settingsType;
        }
      }
    }

    // if no constructor is found, check the base type
    // TODO: it would be better to try to find the settings type directly, by guessing its name, in this case.
    //       If present, it should be used even if it does not add anything to the parent class' settings type,
    //       because in the future it could add something.
    const heritageClauses = declaration.heritageClauses;
    if (heritageClauses) {
      for (const clause of heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          const baseTypeNode = clause.types[0];
          const baseType = typeChecker.getTypeAtLocation(baseTypeNode);
          const baseSettingsType = getSettingsType(baseType, typeChecker);
          if (baseSettingsType) {
            return baseSettingsType;
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * Returns the type of the first found settings object (inheriting from sap/ui/base/ManagedObject/$ManagedObjectSettings
 * occurring among the parameters of the given constructor. Or undefined.
 */
function getSettingsTypeFromConstructor(
  ctor: ts.ConstructorDeclaration,
  typeChecker: ts.TypeChecker,
) {
  for (let i = 0; i < ctor.parameters.length; i++) {
    const parameter = ctor.parameters[i];
    if (parameter.type.kind === ts.SyntaxKind.TypeReference) {
      // This i-th parameter of the base class' constructor could be the settings type
      log.debug(
        `Checking constructor parameter ${parameter.name.getText()} (type ${(
          parameter.type as ts.TypeReferenceNode
        ).typeName.getText()}) to find out whether it is the settings type of the base class.`,
      );
      const potentialSettingsType = typeChecker.getTypeFromTypeNode(
        parameter.type,
      );
      const interestingBaseSettingsClass = getInterestingBaseSettingsClass(
        potentialSettingsType,
        typeChecker,
      );
      if (interestingBaseSettingsClass) {
        return parameter.type;
      }
    }
  }
}

/**
 * Returns "ManagedObject", "Element", "Control" - or undefined
 */
function getInterestingBaseClass(
  type: ts.Type,
  typeChecker: ts.TypeChecker,
): "ManagedObject" | "Element" | "Control" | "WebComponent" | undefined {
  //const typeName = typeChecker.typeToString(type);
  //log.debug("-> " + typeName + " (" + typeChecker.getFullyQualifiedName(type.getSymbol()) + ")");

  let interestingBaseClass = interestingBaseClassForSymbol(
    typeChecker,
    type.getSymbol(),
  );
  if (interestingBaseClass) {
    return interestingBaseClass;
  }
  if (!type.isClassOrInterface()) {
    return;
  }
  const baseTypes = typeChecker.getBaseTypes(type);
  for (let i = 0; i < baseTypes.length; i++) {
    if (
      (interestingBaseClass = getInterestingBaseClass(
        baseTypes[i],
        typeChecker,
      ))
    ) {
      return interestingBaseClass;
    }
  }
  return undefined;
}

/**
 * Returns the name of the closest base class settings type ("$ManagedObjectSettings" | "$ElementSettings" | "$ControlSettings") - or undefined
 */
function getInterestingBaseSettingsClass(
  type: ts.Type,
  typeChecker: ts.TypeChecker,
):
  | "$ManagedObjectSettings"
  | "$ElementSettings"
  | "$ControlSettings"
  | "$WebComponentSettings"
  | undefined {
  const symbol = type.getSymbol();
  if (!symbol) {
    log.error(`Symbol ${
      type.aliasSymbol ? `for type '${type.aliasSymbol.getName()}'` : ""
    } could not be resolved.
    This means that TypeScript did not find out what this type actually is.
    Check the source code: is this type defined where it is written? If not, why not?`);
  }
  let interestingBaseSettingsClass =
    interestingBaseSettingsClasses[typeChecker.getFullyQualifiedName(symbol)];
  if (interestingBaseSettingsClass) {
    return interestingBaseSettingsClass;
  }
  if (!type.isClassOrInterface()) {
    return;
  }
  const baseTypes = typeChecker.getBaseTypes(type);
  if (
    (!baseTypes || baseTypes.length === 0) &&
    type.symbol &&
    type.symbol.escapedName
  ) {
    console.warn(
      `TypeScript could not resolve any base types for ${type.symbol.escapedName.toString()}.`,
    );
  }
  for (let i = 0; i < baseTypes.length; i++) {
    if (
      (interestingBaseSettingsClass = getInterestingBaseSettingsClass(
        baseTypes[i],
        typeChecker,
      ))
    ) {
      return interestingBaseSettingsClass;
    }
  }
  return undefined;
}

// const sourceFile = ts.createSourceFile("src/control/MyButton.ts", fs.readFileSync("src/control/MyButton.ts").toString(), ts.ScriptTarget.Latest);

function getTagsWithName(
  jsDocs: ReadonlyArray<ts.JSDoc | ts.JSDocTag>,
  tagName: string,
) {
  const fnCheck =
    tagName === "deprecated" ? ts.isJSDocDeprecatedTag : ts.isJSDocUnknownTag;
  let tags: ts.JSDocTag[] = [];

  jsDocs?.forEach((doc) => {
    // for elements of type JSDoc, the actual tags are properties
    if (ts.isJSDoc(doc)) {
      tags = tags.concat(getTagsWithName(doc.tags, tagName));
    } else if (fnCheck(doc) && doc.tagName.getText() === tagName) {
      tags.push(doc);
    }
  });
  return tags;
}

function extractCommentText(jsDocs: ReadonlyArray<ts.JSDoc | ts.JSDocTag>) {
  const comments: string[] = [];
  jsDocs.forEach((doc) => {
    if (ts.isJSDoc(doc)) {
      if (typeof doc.comment === "string") {
        comments.push(doc.comment);
      } else if (Array.isArray(doc.comment)) {
        // NodeArray<JSDocComment>
        doc.comment.forEach((singleDoc) => {
          comments.push(singleDoc.getFullText());
        });
      }
    }
  });
  return comments.join("\n");
}

function handleTag(jsDocs: (ts.JSDoc | ts.JSDocTag)[], tagName: string) {
  const tags = getTagsWithName(jsDocs, tagName);
  if (tags.length === 0) {
    return undefined; // without additional text after the tag, the "else" branch will return an empty string, but this still means the tag is there
    // so with no tag, we need to return something else
  } else {
    return tags.map((tag) => tag.comment).join("; "); // should only be one, but who knows
  }
}

function extractJSDoc(jsDocs: (ts.JSDoc | ts.JSDocTag)[]) {
  return {
    doc: extractCommentText(jsDocs),
    experimental: handleTag(jsDocs, "experimental"),
    since: handleTag(jsDocs, "since"),
    deprecation: handleTag(jsDocs, "deprecated"),
  };
}
// for a single definition in the metadata (a single property, a single aggregation, ...), this method extracts all needed info into the returned APIMember instance
function getMemberFromPropertyAssignment<T extends MetadataSectionName>(
  propertyAssignment: ts.PropertyAssignment,
  memberKind: T,
): TypeForMetadataSectionName[T] {
  // the name
  const memberName = propertyAssignment.name.getText().replace(/['"]/g, "");
  const member: APIMember = {
    name: memberName,
  };

  // the definition object - for the sake of parsing simplicity, let's parse the code as a JSON object
  let definitionObject;
  try {
    definitionObject = Hjson.parse(
      propertyAssignment.initializer.getText(),
    ) as APIMember; // parse with some fault tolerance: it's not a real JSON object, but JS code which may contain comments and property names which are not enclosed in double quotes
    definitionObject = expandDefaultKey(
      definitionObject,
      memberKind === "events" ? null : "type",
    );
    Object.assign(member, definitionObject);
  } catch (e) {
    throw new Error(
      `When parsing the metadata of ${
        member.name
      }: metadata is no valid JSON and could not be quick-fixed to be. Please make the metadata at least close to valid JSON. In particular, TypeScript type annotations cannot be used. Error: ${
        (e as Error).message
      }`,
    );
  }

  // need to type this yet undocumented method
  type GetJSDocCommentsAndTags = (
    pa: ts.PropertyAssignment,
  ) => (ts.JSDoc | ts.JSDocTag)[];

  // enrich with JSDoc
  if (Preferences.get().jsdoc !== "none") {
    const commentsAndTags =
      // @ts-ignore this method already exists in 5.0.4, but was only made public two weeks ago, maybe for 5.1 (https://github.com/microsoft/TypeScript/commit/a1df8f774fd81c389a10d2e44a3568d7f0647c67)
      (ts.getJSDocCommentsAndTags as GetJSDocCommentsAndTags)(
        propertyAssignment,
      );
    Object.assign(member, extractJSDoc(commentsAndTags));
  }
  return member as TypeForMetadataSectionName[T];
}

function generateInterface(
  {
    sourceFile,
    className,
    isDefaultExport,
    settingsTypeFullName,
    interestingBaseClass,
    constructorSignaturesAvailable,
    metadata,
  }:
    | {
        sourceFile: ts.SourceFile;
        className: string;
        isDefaultExport: boolean;
        settingsTypeFullName: string;
        interestingBaseClass:
          "ManagedObject" | "Element" | "Control" | "WebComponent" | undefined;
        constructorSignaturesAvailable: boolean;
        metadata: ts.PropertyDeclaration[];
      }
    | undefined,
  allKnownGlobals: GlobalToModuleMapping,
  options: { generateEventWithGenerics: boolean },
) {
  const fileName = sourceFile.fileName;

  // by now we have something that looks pretty much like a ManagedObject metadata object

  const metadataObject: ClassInfo = {};
  const initializer = metadata[0].initializer;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    // no initializer? => no interface needed
    // TODO: but it could be that the metadata is not an object literal, but a variable or a function call, which returns the metadata object.
    // This is not supported yet, but could be in the future. Warn the user about this.
    log.warn(
      `Class '${className}' inside '${fileName}' inherits from ${interestingBaseClass} and has a 'metadata' property, but no object literal is assigned to this property. This is not supported (yet?), hence no TypeScript interface is generated for this class by @ui5/ts-interface-generator.`,
    );
    return;
  }

  // initializer is now known to be a ts.ObjectLiteralExpression - the entire object literal defining all the control metadata... loop it
  initializer.properties.forEach((propertyAssignment) => {
    // each propertyAssignment is something like  properties: {...}  and  aggregations: {...}
    if (!ts.isPropertyAssignment(propertyAssignment)) {
      return; // huh, not a property assignment? => does not look like something we are interested in
    }
    const memberKind = propertyAssignment.name
      .getText()
      .replace(/['"]/g, "") as MetadataSectionName;
    if (
      !["properties", "aggregations", "associations", "events"].includes(
        memberKind,
      )
    ) {
      return; // not interested in anything else than these four, because methods are generated only for these
    }

    const innerObjectLiteralExpression = propertyAssignment?.initializer; // the object literal defining ONE kind of control metadata - either the properties, or the aggegations or...
    try {
      if (
        ts.isObjectLiteralExpression(innerObjectLiteralExpression) &&
        innerObjectLiteralExpression.properties
      ) {
        metadataObject[memberKind] = {};
        innerObjectLiteralExpression.properties
          .filter((prop) => ts.isPropertyAssignment(prop))
          .forEach((prop) => {
            const name = prop.name.getText().replace(/['"]/g, "");
            metadataObject[memberKind][name] = getMemberFromPropertyAssignment(
              prop,
              memberKind,
            );
          });
      }
    } catch (e) {
      // enrich error info with class/file context
      throw new Error(
        `When parsing the metadata of ${className} in ${fileName}: ${
          (e as Error).message
        }`,
      );
    }
  });

  if (
    !metadataObject.properties &&
    !metadataObject.aggregations &&
    !metadataObject.associations &&
    !metadataObject.events
  ) {
    // No API for which accessors need to be generated? => no interface needed
    return;
  }

  log.debug(
    `\n\nClass ${className} inside ${fileName} inherits from ${interestingBaseClass} and contains metadata.`,
  );

  const classInfo = collectClassInfo(metadataObject, className);

  const moduleName = path.basename(fileName, path.extname(fileName));
  const ast = buildAST(
    classInfo,
    isDefaultExport,
    sourceFile.fileName,
    constructorSignaturesAvailable,
    moduleName,
    settingsTypeFullName,
    allKnownGlobals,
    options,
  );
  if (!ast) {
    // no interface needs to be generated
    return;
  }

  return astToString(ast);
}

function buildAST(
  classInfo: ClassInfo,
  isDefaultExport: boolean,
  classFileName: string,
  constructorSignaturesAvailable: boolean,
  moduleName: string,
  settingsTypeFullName: string,
  allKnownGlobals: GlobalToModuleMapping,
  options?: { generateEventWithGenerics?: boolean },
) {
  const requiredImports: RequiredImports = {};

  // add all the JSDoc for the generated methods
  addJSDocAST(classInfo);

  const eventParameterInterfaces = generateEventParameterInterfaces(
    classInfo.events,
    classInfo.name,
    requiredImports,
    allKnownGlobals,
  );
  let genericEventDefinitionModule;
  if (
    options?.generateEventWithGenerics &&
    Object.keys(eventParameterInterfaces).length > 0
  ) {
    genericEventDefinitionModule = generateEventWithGenericsCompatibilityModule(
      classInfo.name,
      requiredImports,
      allKnownGlobals,
    );
  }

  const eventTypeAliases = generateEventTypeAliases(
    classInfo.events,
    eventParameterInterfaces,
    classInfo.name,
    requiredImports,
    allKnownGlobals,
  );

  const methods = generateMethods(
    classInfo,
    requiredImports,
    allKnownGlobals,
    eventParameterInterfaces,
    eventTypeAliases,
  );
  if (methods.length === 0) {
    // nothing needs to be generated!
    return null;
  }

  const settingsInterface = generateSettingsInterface(
    classInfo,
    classFileName,
    constructorSignaturesAvailable,
    settingsTypeFullName,
    requiredImports,
    allKnownGlobals,
    eventTypeAliases,
  );

  const statements: ts.Statement[] = getImports(requiredImports);

  let myInterface;
  if (isDefaultExport) {
    myInterface = factory.createInterfaceDeclaration(
      [
        factory.createModifier(ts.SyntaxKind.ExportKeyword),
        factory.createModifier(ts.SyntaxKind.DefaultKeyword),
      ],
      classInfo.name,
      undefined,
      undefined,
      methods,
    );
  } else {
    myInterface = factory.createInterfaceDeclaration(
      [], // no export needed for module augmentation when class is a named export in the original file!
      classInfo.name,
      undefined,
      undefined,
      methods,
    );
  }
  addLineBreakBefore(myInterface, 2);

  // assemble the module declaration
  const module = factory.createModuleDeclaration(
    [factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
    factory.createStringLiteral("./" + moduleName),
    factory.createModuleBlock([
      settingsInterface,
      myInterface,
      ...Object.values(eventParameterInterfaces),
      ...Object.values(eventTypeAliases),
    ]),
  );
  if (statements.length > 0) {
    addLineBreakBefore(module, 2);
  }
  statements.push(module);

  // if needed add the Event with added generics
  if (genericEventDefinitionModule) {
    statements.push(genericEventDefinitionModule);
  }

  // If needed, assemble the second module declaration.
  // In case the class is not a default export, the first module declaration will already be without export, so this second module declaration is not needed anyway
  if (requiredImports.selfIsUsed && isDefaultExport) {
    const myInterface2 = factory.createInterfaceDeclaration(
      undefined,
      classInfo.name,
      undefined,
      undefined,
      methods,
    );

    const module2 = factory.createModuleDeclaration(
      [factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
      factory.createStringLiteral("./" + moduleName),
      factory.createModuleBlock([myInterface2]),
    );
    addLineBreakBefore(module2, 2);
    ts.addSyntheticLeadingComment(
      module2,
      ts.SyntaxKind.SingleLineCommentTrivia,
      " this duplicate interface without export is needed to avoid \"Cannot find name '" + // TODO: does not seem to be needed any longer; investigate and try to reproduce
        classInfo.name +
        "'\" TypeScript errors above",
    );

    statements.push(module2);
  }

  return statements;
}

function getImports(requiredImports: RequiredImports) {
  const imports = [];
  for (const dependencyName in requiredImports) {
    if (dependencyName === "selfIsUsed") {
      continue;
    }
    const singleImport = requiredImports[dependencyName];
    const localNameIdentifier = factory.createIdentifier(
      singleImport.localName,
    );
    const namedImportOriginalNameIdentifier =
      singleImport.exportName &&
      singleImport.localName !== singleImport.exportName
        ? factory.createIdentifier(singleImport.exportName)
        : undefined;

    let importClause;
    if (singleImport.exportName) {
      // if we have a named (non-default) export, we need a different import clause (with curly braces around the names to import)
      const importSpecifier = factory.createImportSpecifier(
        false /* typeOnly */,
        namedImportOriginalNameIdentifier,
        localNameIdentifier,
      );
      importClause = factory.createImportClause(
        false,
        undefined,
        factory.createNamedImports([importSpecifier]),
      );
    } else {
      importClause = factory.createImportClause(
        false,
        factory.createIdentifier(singleImport.localName),
        undefined,
      ); // importing the default export, so only the local name matters
    }

    imports.push(
      factory.createImportDeclaration(
        undefined,
        importClause,
        factory.createStringLiteral(singleImport.moduleName),
      ),
    );
  }

  if (!imports.length) {
    // this would result in an ambient module declaration which doesn't work for us. Enforce some implementation code to make it non-ambient.
    const importDeclaration = factory.createImportDeclaration(
      undefined,
      factory.createImportClause(
        false,
        factory.createIdentifier("Core"),
        undefined,
      ),
      factory.createStringLiteral("sap/ui/core/Core"),
    );
    ts.addSyntheticTrailingComment(
      importDeclaration,
      ts.SyntaxKind.SingleLineCommentTrivia,
      " dummy import to make this non-ambient",
    );
    imports.push(importDeclaration);
  }

  return imports;
}

export { generateInterfaces };
