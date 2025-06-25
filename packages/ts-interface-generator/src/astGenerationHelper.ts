import ts = require("typescript");
import astToString from "./astToString";
import log from "loglevel";
import {
  buildJSDocStringFromLines,
  createJSDocCenterPart,
} from "./jsdocGenerator";
import Preferences from "./preferences";

// CAUTION: incompatible changes in TypeScript!
// factory.createParameterDeclaration -> use fixedCreateParameterDeclaration
// factory.createModuleDeclaration -> check TS version or als obuild a fixed one
// factory.createTypeAliasDeclaration -> same

const factory = ts.factory;

const fixedCreateParameterDeclaration =
  parseFloat(ts.version) >= 4.8
    ? factory.createParameterDeclaration.bind(this) // not used, but required by linting
    : function (
        ...args: [
          readonly ts.ModifierLike[],
          ts.DotDotDotToken,
          string | ts.BindingName,
          ts.QuestionToken?,
          ts.TypeNode?,
          ts.Expression?,
        ]
      ) {
        // @ts-ignore old signature before 4.8 is used here
        return factory.createParameterDeclaration(undefined, ...args);
      };

function generateSettingsInterface(
  classInfo: ClassInfo,
  classFileName: string,
  constructorSignaturesAvailable: boolean,
  settingsTypeFullName: string,
  requiredImports: RequiredImports,
  knownGlobals: GlobalToModuleMapping,
  eventTypeAliases: { [eventName: string]: ts.TypeAliasDeclaration },
) {
  const interfaceProperties = [];
  const currentClassName = classInfo.name;

  // properties
  for (const n in classInfo.properties) {
    const property = classInfo.properties[n];
    if (property.visibility !== "hidden") {
      const propertyTypes: ts.TypeNode[] = [
        // allowed types: 1. the actual type, ...
        createTSTypeNode(
          property.type,
          requiredImports,
          knownGlobals,
          currentClassName,
        ),
        createTSTypeNode(
          // 2. a binding info object...
          "sap.ui.base.ManagedObject.PropertyBindingInfo",
          requiredImports,
          knownGlobals,
          currentClassName,
        ),
      ];

      if (property.type !== "string") {
        // ...and if "string" is not allowed, anyway, then:
        propertyTypes.push(createBindingStringTypeNode()); // 3. a binding string
      }

      const propertySignature = factory.createPropertySignature(
        undefined,
        property.name,
        factory.createToken(ts.SyntaxKind.QuestionToken),
        factory.createUnionTypeNode(propertyTypes),
      );
      addJSDocCommentToNode(
        propertySignature,
        buildJSDocStringFromLines(createJSDocCenterPart(property)),
      );
      interfaceProperties.push(propertySignature);
    }
  }

  // aggregations
  for (const n in classInfo.aggregations) {
    const aggregation = classInfo.aggregations[n];

    if (aggregation.visibility !== "hidden") {
      let aggregationInitializationTypeNode;
      const aggregationSingleTypeNode = createTSTypeNode(
        aggregation.type,
        requiredImports,
        knownGlobals,
        currentClassName,
      );

      if (aggregation.cardinality === "0..1") {
        if (
          Array.isArray(aggregation.altTypes) &&
          aggregation.altTypes.length > 0
        ) {
          const typesToUse: ts.TypeNode[] = [
            aggregationSingleTypeNode,
            createTSTypeNode(
              // add first altType as alternative - only ONE is supported by UI5
              aggregation.altTypes[0],
              requiredImports,
              knownGlobals,
              currentClassName,
            ),
          ];
          typesToUse.push(
            createTSTypeNode(
              // altType can be bound via property binding
              "sap.ui.base.ManagedObject.PropertyBindingInfo",
              requiredImports,
              knownGlobals,
              currentClassName,
            ),
          );
          if (aggregation.altTypes[0] !== "string") {
            // if "string" is not anyway allowed, also allow binding strings
            typesToUse.push(createBindingStringTypeNode());
          }
          aggregationInitializationTypeNode =
            factory.createUnionTypeNode(typesToUse);
        } else {
          // no altTypes
          aggregationInitializationTypeNode = aggregationSingleTypeNode;
        }
      } else {
        // 0..n
        aggregationInitializationTypeNode = factory.createUnionTypeNode([
          factory.createArrayTypeNode(aggregationSingleTypeNode), // 1. the type in an array
          aggregationSingleTypeNode, // 2. the type as single object
          createTSTypeNode(
            // 3. an aggregation binding info object
            "sap.ui.base.ManagedObject.AggregationBindingInfo",
            requiredImports,
            knownGlobals,
            currentClassName,
          ),
          createBindingStringTypeNode(), // 4. a binding string
        ]);
      }

      const propertySignature = factory.createPropertySignature(
        undefined,
        aggregation.name,
        factory.createToken(ts.SyntaxKind.QuestionToken),
        aggregationInitializationTypeNode,
      );
      addJSDocCommentToNode(
        propertySignature,
        buildJSDocStringFromLines(createJSDocCenterPart(aggregation)),
      );
      interfaceProperties.push(propertySignature);
    }
  }

  // associations
  for (const n in classInfo.associations) {
    const association = classInfo.associations[n];
    if (association.visibility !== "hidden") {
      let associationInitializationTypeNode;
      const associationSingleTypeNode = createTSTypeNode(
        association.type,
        requiredImports,
        knownGlobals,
        currentClassName,
      );

      // allow object and string (=ID) and in case of multiple associations also arrays
      if (association.cardinality === "0..1") {
        associationInitializationTypeNode = factory.createUnionTypeNode([
          associationSingleTypeNode,
          factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        ]);
      } else {
        // 0..n
        associationInitializationTypeNode = factory.createUnionTypeNode([
          associationSingleTypeNode,
          factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          factory.createArrayTypeNode(
            factory.createUnionTypeNode([
              associationSingleTypeNode,
              factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
            ]),
          ),
        ]);
      }

      const propertySignature = factory.createPropertySignature(
        undefined,
        association.name,
        factory.createToken(ts.SyntaxKind.QuestionToken),
        associationInitializationTypeNode,
      );
      addJSDocCommentToNode(
        propertySignature,
        buildJSDocStringFromLines(createJSDocCenterPart(association)),
      );
      interfaceProperties.push(propertySignature);
    }
  }

  // events
  for (const n in classInfo.events) {
    const event = classInfo.events[n];
    if (event.visibility !== "hidden") {
      const propertySignature = factory.createPropertySignature(
        undefined,
        event.name,
        factory.createToken(ts.SyntaxKind.QuestionToken),
        factory.createFunctionTypeNode(
          [],
          [
            fixedCreateParameterDeclaration(
              undefined,
              undefined,
              "event",
              undefined,
              factory.createTypeReferenceNode(
                eventTypeAliases[event.name].name,
              ),
            ),
          ],
          factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
        ),
      );
      addJSDocCommentToNode(
        propertySignature,
        buildJSDocStringFromLines(createJSDocCenterPart(event)),
      );
      interfaceProperties.push(propertySignature);
    }
  }

  let ownSettingsTypeName = "$" + classInfo.name + "Settings";
  if (settingsTypeFullName.endsWith(ownSettingsTypeName)) {
    // name clash
    ownSettingsTypeName += "_1"; // append suffix to make the name unique
  }

  const localName = uniqueImport(
    settingsTypeFullName,
    requiredImports,
    knownGlobals,
    currentClassName,
  );

  if (!constructorSignaturesAvailable) {
    printConstructorBlockWarning(
      ownSettingsTypeName,
      classInfo.name,
      classFileName,
    ); // TODO: only print when the original class is missing the constructors!
  } else {
    log.debug(
      `Constructor signatures are present in implementation file of ${classInfo.name}.`,
    );
  }

  const settingsSuperclass = factory.createIdentifier(localName);
  const settingsSuperclassAsExpression =
    factory.createExpressionWithTypeArguments(settingsSuperclass, undefined);
  const heritageClauses = [
    factory.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, [
      settingsSuperclassAsExpression,
    ]),
  ];
  let myInterface;
  if (parseFloat(ts.version) >= 4.8) {
    myInterface = factory.createInterfaceDeclaration(
      undefined,
      ownSettingsTypeName,
      undefined,
      heritageClauses,
      interfaceProperties,
    );
  } else {
    myInterface = factory.createInterfaceDeclaration(
      undefined,
      undefined,
      ownSettingsTypeName,
      undefined,
      heritageClauses,
      // @ts-ignore: below TS 4.8 there were more params
      interfaceProperties,
    );
  }

  addLineBreakBefore(myInterface, 2);
  ts.addSyntheticLeadingComment(
    myInterface,
    ts.SyntaxKind.MultiLineCommentTrivia,
    "*\n * Interface defining the settings object used in constructor calls\n ",
  );
  addLineBreakBefore(myInterface);
  return myInterface;
}

// creates a template string that matches all binding strings
function createBindingStringTypeNode() {
  return factory.createTemplateLiteralType(
    factory.createTemplateHead("{", "{"),
    [
      factory.createTemplateLiteralTypeSpan(
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        factory.createTemplateTail("}", "}"),
      ),
    ],
  );
}

function printConstructorBlockWarning(
  settingsTypeName: string,
  className: string,
  fileName: string,
) {
  const constructorBlock = createConstructorBlock(settingsTypeName);

  const message = `
NOTE:
Class ${className} in file ${fileName} needs to contain the following constructors, in order to make TypeScript aware of the possible constructor settings. Please copy&paste the block manually, as the ts-interface-generator will not touch your source files:
===== BEGIN =====
// The following three lines were generated and should remain as-is to make TypeScript aware of the constructor signatures
${astToString(constructorBlock)}===== END =====
`;
  log.warn(message);
}

// adds the content into a multiline comment before the given node; the asterisk preceding each line must be present in the content
function addJSDocCommentToNode(node: ts.Node, content: string) {
  if (content && Preferences.get().jsdoc !== "none") {
    addLineBreakBefore(node, 2); // some space before the JSDoc
    // cannot explicitly create JSDoc: https://github.com/microsoft/TypeScript/issues/17146, so prepend a "*" at the very beginning to make it one
    ts.addSyntheticLeadingComment(
      node,
      ts.SyntaxKind.MultiLineCommentTrivia,
      "*" + content,
      true,
    );
  }
}

function generateMethods(
  classInfo: ClassInfo,
  requiredImports: RequiredImports,
  knownGlobals: GlobalToModuleMapping,
  eventParameterInterfaces: { [eventName: string]: ts.InterfaceDeclaration },
  eventTypeAliases: { [eventName: string]: ts.TypeAliasDeclaration },
) {
  const allMethods: ts.MethodSignature[] = [];
  const currentClassName = classInfo.name;

  // properties
  for (const n in classInfo.properties) {
    const property = classInfo.properties[n];
    if (property.visibility === "hidden") {
      continue;
    }

    // property getter
    const getter = factory.createMethodSignature(
      undefined,
      property.methods.get,
      undefined,
      [],
      [],
      createTSTypeNode(
        property.type,
        requiredImports,
        knownGlobals,
        currentClassName,
      ),
    );
    addLineBreakBefore(getter, 2);
    ts.addSyntheticLeadingComment(
      getter,
      ts.SyntaxKind.SingleLineCommentTrivia,
      " property: " + n,
    );
    addJSDocCommentToNode(getter, classInfo.generatedJSDoc?.PropertyGet[n]);
    allMethods.push(getter);

    // property setter
    const setter = factory.createMethodSignature(
      undefined,
      property.methods.set,
      undefined,
      [],
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          n,
          undefined,
          createTSTypeNode(
            property.type,
            requiredImports,
            knownGlobals,
            currentClassName,
          ),
        ),
      ],
      factory.createThisTypeNode(),
    );
    addJSDocCommentToNode(setter, classInfo.generatedJSDoc?.PropertySet[n]);
    allMethods.push(setter);

    if (property.bindable) {
      // bind property
      const bind = factory.createMethodSignature(
        undefined,
        property.methods.bind,
        undefined,
        [],
        [
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            "bindingInfo",
            undefined,
            createTSTypeNode(
              "sap.ui.base.ManagedObject.PropertyBindingInfo",
              requiredImports,
              knownGlobals,
              currentClassName,
            ),
          ),
        ],
        factory.createThisTypeNode(),
      );
      addJSDocCommentToNode(bind, classInfo.generatedJSDoc?.PropertyBind[n]);
      allMethods.push(bind);

      // unbind property
      const unbind = factory.createMethodSignature(
        undefined,
        property.methods.unbind,
        undefined,
        [],
        [],
        factory.createThisTypeNode(),
      );
      addJSDocCommentToNode(
        unbind,
        classInfo.generatedJSDoc?.PropertyUnbind[n],
      );
      allMethods.push(unbind);
    }
  }

  // aggregations
  for (const n in classInfo.aggregations) {
    const aggregation = classInfo.aggregations[n];
    if (aggregation.visibility === "hidden") {
      continue;
    }

    // aggregation getter
    const getter = factory.createMethodSignature(
      undefined,
      aggregation.methods.get,
      undefined,
      [],
      [],
      aggregation.cardinality === "0..n"
        ? factory.createArrayTypeNode(
            createTSTypeNode(
              aggregation.type,
              requiredImports,
              knownGlobals,
              currentClassName,
            ),
          )
        : createTSTypeNode(
            aggregation.type,
            requiredImports,
            knownGlobals,
            currentClassName,
          ),
    );
    addLineBreakBefore(getter, 2);
    ts.addSyntheticLeadingComment(
      getter,
      ts.SyntaxKind.SingleLineCommentTrivia,
      " aggregation: " + n,
    );
    addJSDocCommentToNode(getter, classInfo.generatedJSDoc?.AggregationGet[n]);
    allMethods.push(getter);

    if (aggregation.cardinality === "0..n") {
      // add aggregation
      const add = factory.createMethodSignature(
        undefined,
        aggregation.methods.add,
        undefined,
        [],
        [
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            n,
            undefined,
            createTSTypeNode(
              aggregation.type,
              requiredImports,
              knownGlobals,
              currentClassName,
            ),
          ),
        ],
        factory.createThisTypeNode(),
      );
      addJSDocCommentToNode(add, classInfo.generatedJSDoc?.AggregationAdd[n]);
      allMethods.push(add);

      // insert aggregation
      const insert = factory.createMethodSignature(
        undefined,
        aggregation.methods.insert,
        undefined,
        [],
        [
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            n,
            undefined,
            createTSTypeNode(
              aggregation.type,
              requiredImports,
              knownGlobals,
              currentClassName,
            ),
          ),
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            "index",
            undefined,
            factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
          ),
        ],
        factory.createThisTypeNode(),
      );
      addJSDocCommentToNode(
        insert,
        classInfo.generatedJSDoc?.AggregationInsert[n],
      );
      allMethods.push(insert);

      // remove aggregation
      const remove = factory.createMethodSignature(
        undefined,
        aggregation.methods.remove,
        undefined,
        [],
        [
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            n,
            undefined,
            factory.createUnionTypeNode([
              factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
              factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              createTSTypeNode(
                aggregation.type,
                requiredImports,
                knownGlobals,
                currentClassName,
              ),
            ]),
          ),
        ],
        factory.createUnionTypeNode([
          // the removed child or null if not found
          createTSTypeNode(
            aggregation.type,
            requiredImports,
            knownGlobals,
            currentClassName,
          ),
          factory.createLiteralTypeNode(ts.factory.createNull()),
        ]),
      );
      addJSDocCommentToNode(
        remove,
        classInfo.generatedJSDoc?.AggregationRemove[n],
      );
      allMethods.push(remove);

      // remove all aggregation
      const removeAll = factory.createMethodSignature(
        undefined,
        aggregation.methods.removeAll,
        undefined,
        [],
        [],
        factory.createArrayTypeNode(
          createTSTypeNode(
            aggregation.type,
            requiredImports,
            knownGlobals,
            currentClassName,
          ),
        ),
      );
      addJSDocCommentToNode(
        removeAll,
        classInfo.generatedJSDoc?.AggregationRemoveAll[n],
      );
      allMethods.push(removeAll);

      // index of aggregation
      const indexOf = factory.createMethodSignature(
        undefined,
        aggregation.methods.indexOf,
        undefined,
        [],
        [
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            n,
            undefined,
            createTSTypeNode(
              aggregation.type,
              requiredImports,
              knownGlobals,
              currentClassName,
            ),
          ),
        ],
        factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
      );
      addJSDocCommentToNode(
        indexOf,
        classInfo.generatedJSDoc?.AggregationIndexOf[n],
      );
      allMethods.push(indexOf);

      //	this._sUpdater = 'update' + N;
      //	this._sRefresher = 'refresh' + N;
    } else {
      // set aggregation
      const set = factory.createMethodSignature(
        undefined,
        aggregation.methods.set,
        undefined,
        [],
        [
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            n,
            undefined,
            createTSTypeNode(
              aggregation.type,
              requiredImports,
              knownGlobals,
              currentClassName,
            ),
          ),
        ],
        factory.createThisTypeNode(),
      );
      addJSDocCommentToNode(set, classInfo.generatedJSDoc?.AggregationSet[n]);
      allMethods.push(set);
    }

    // destroy aggregation
    const destroy = factory.createMethodSignature(
      undefined,
      aggregation.methods.destroy,
      undefined,
      [],
      [],
      factory.createThisTypeNode(),
    );
    addJSDocCommentToNode(
      destroy,
      classInfo.generatedJSDoc?.AggregationDestroy[n],
    );
    allMethods.push(destroy);

    if (aggregation.bindable) {
      // bind aggregation
      const bind = factory.createMethodSignature(
        undefined,
        aggregation.methods.bind,
        undefined,
        [],
        [
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            "bindingInfo",
            undefined,
            createTSTypeNode(
              "sap.ui.base.ManagedObject.AggregationBindingInfo",
              requiredImports,
              knownGlobals,
              currentClassName,
            ),
          ),
        ],
        factory.createThisTypeNode(),
      );
      addJSDocCommentToNode(bind, classInfo.generatedJSDoc?.AggregationBind[n]);
      allMethods.push(bind);

      // unbind aggregation
      const unbind = factory.createMethodSignature(
        undefined,
        aggregation.methods.unbind,
        undefined,
        [],
        [],
        factory.createThisTypeNode(),
      );
      addJSDocCommentToNode(
        unbind,
        classInfo.generatedJSDoc?.AggregationUnbind[n],
      );
      allMethods.push(unbind);
    }
  }

  // associations
  for (const n in classInfo.associations) {
    const association = classInfo.associations[n];
    if (association.visibility === "hidden") {
      continue;
    }

    // association getter
    const getter = factory.createMethodSignature(
      undefined,
      association.methods.get,
      undefined,
      [],
      [],
      association.cardinality === "0..n"
        ? factory.createArrayTypeNode(
            factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          )
        : factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
    );
    addLineBreakBefore(getter, 2);
    ts.addSyntheticLeadingComment(
      getter,
      ts.SyntaxKind.SingleLineCommentTrivia,
      " association: " + n,
    );
    addJSDocCommentToNode(getter, classInfo.generatedJSDoc?.AssociationGet[n]);
    allMethods.push(getter);

    // association setter
    if (association.cardinality === "0..1") {
      // set association
      const setter = factory.createMethodSignature(
        undefined,
        association.methods.set,
        undefined,
        [],
        [
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            n,
            factory.createToken(ts.SyntaxKind.QuestionToken),
            factory.createUnionTypeNode([
              factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              createTSTypeNode(
                association.type,
                requiredImports,
                knownGlobals,
                currentClassName,
              ),
            ]),
          ),
        ],
        factory.createThisTypeNode(),
      );
      addJSDocCommentToNode(
        setter,
        classInfo.generatedJSDoc?.AssociationSet[n],
      );
      allMethods.push(setter);
    } else {
      // 0..n

      // add association
      const add = factory.createMethodSignature(
        undefined,
        association.methods.add,
        undefined,
        [],
        [
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            n,
            undefined,
            factory.createUnionTypeNode([
              factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              createTSTypeNode(
                association.type,
                requiredImports,
                knownGlobals,
                currentClassName,
              ),
            ]),
          ),
        ],
        factory.createThisTypeNode(),
      );
      addJSDocCommentToNode(add, classInfo.generatedJSDoc?.AssociationAdd[n]);
      allMethods.push(add);

      // remove association
      const remove = factory.createMethodSignature(
        undefined,
        association.methods.remove,
        undefined,
        [],
        [
          fixedCreateParameterDeclaration(
            undefined,
            undefined,
            n,
            undefined,
            factory.createUnionTypeNode([
              factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
              factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              createTSTypeNode(
                association.type,
                requiredImports,
                knownGlobals,
                currentClassName,
              ),
            ]),
          ),
        ],
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      );
      addJSDocCommentToNode(
        remove,
        classInfo.generatedJSDoc?.AssociationRemove[n],
      );
      allMethods.push(remove);

      // remove all aggregation
      const removeAll = factory.createMethodSignature(
        undefined,
        association.methods.removeAll,
        undefined,
        [],
        [],
        factory.createArrayTypeNode(
          factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        ),
      );
      addJSDocCommentToNode(
        removeAll,
        classInfo.generatedJSDoc?.AssociationRemoveAll[n],
      );
      allMethods.push(removeAll);
    }
  }

  // events
  for (const n in classInfo.events) {
    const event = classInfo.events[n];
    if (event.visibility === "hidden") {
      continue;
    }

    // attach event
    const callback = factory.createFunctionTypeNode(
      [],
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "event",
          undefined,
          factory.createTypeReferenceNode(eventTypeAliases[event.name].name),
        ),
      ],
      factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
    );
    const attach = factory.createMethodSignature(
      undefined,
      event.methods.attach,
      undefined,
      [],
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "fn",
          undefined,
          callback,
        ),
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "listener",
          factory.createToken(ts.SyntaxKind.QuestionToken),
          factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword),
        ),
      ],
      factory.createThisTypeNode(),
    );
    addLineBreakBefore(attach, 2);
    ts.addSyntheticLeadingComment(
      attach,
      ts.SyntaxKind.SingleLineCommentTrivia,
      " event: " + n,
    );
    addJSDocCommentToNode(attach, classInfo.generatedJSDoc?.EventAttach[n]);
    allMethods.push(attach);

    // attach event (with data)
    const callbackWithData = factory.createFunctionTypeNode(
      [],
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "event",
          undefined,
          factory.createTypeReferenceNode(eventTypeAliases[event.name].name),
        ),
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "data",
          undefined,
          factory.createTypeReferenceNode("CustomDataType"),
        ),
      ],
      factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
    );
    const attach2 = factory.createMethodSignature(
      undefined,
      event.methods.attach,
      undefined,
      [
        parseFloat(ts.version) >= 4.8
          ? factory.createTypeParameterDeclaration(
              undefined,
              "CustomDataType",
              factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword),
            )
          : factory.createTypeParameterDeclaration(
              // @ts-ignore this is the old method signature before TS 4.8
              "CustomDataType",
              factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword),
            ),
      ],
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "data",
          undefined,
          factory.createTypeReferenceNode("CustomDataType"),
        ),
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "fn",
          undefined,
          callbackWithData,
        ),
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "listener",
          factory.createToken(ts.SyntaxKind.QuestionToken),
          factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword),
        ),
      ],
      factory.createThisTypeNode(),
    );
    addJSDocCommentToNode(
      attach2,
      classInfo.generatedJSDoc?.EventAttachWithData[n],
    );
    allMethods.push(attach2);

    // detach event
    const detach = factory.createMethodSignature(
      undefined,
      event.methods.detach,
      undefined,
      [],
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "fn",
          undefined,
          callback,
        ),
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "listener",
          factory.createToken(ts.SyntaxKind.QuestionToken),
          factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword),
        ),
      ],
      factory.createThisTypeNode(),
    );
    addJSDocCommentToNode(detach, classInfo.generatedJSDoc?.EventDetach[n]);
    allMethods.push(detach);

    const returnValue = event.allowPreventDefault
      ? factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
      : factory.createThisTypeNode();

    // fire event
    const fire = factory.createMethodSignature(
      undefined,
      event.methods.fire,
      undefined,
      [],
      [
        // TODO: describe parameter object with all details
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "parameters",
          factory.createToken(ts.SyntaxKind.QuestionToken),
          factory.createTypeReferenceNode(
            eventParameterInterfaces[event.name].name,
          ),
        ),
      ],
      returnValue,
    );
    addJSDocCommentToNode(fire, classInfo.generatedJSDoc?.EventFire[n]);
    allMethods.push(fire);
  }

  return allMethods;
}

function createTSTypeNode(
  typeName: string,
  requiredImports: RequiredImports,
  knownGlobals: GlobalToModuleMapping,
  currentClassName: string,
  typeArguments: ts.TypeNode[] = [],
): ts.TypeNode {
  switch (typeName) {
    case "string":
      return factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);

    case "string[]":
      return factory.createArrayTypeNode(
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      );

    case "int":
    case "float":
      return factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);

    case "int[]":
    case "float[]":
      return factory.createArrayTypeNode(
        factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
      );

    case "boolean":
      return factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);

    case "boolean[]":
      return factory.createArrayTypeNode(
        factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword),
      );

    case "object":
      return factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword);

    case "object[]":
      return factory.createArrayTypeNode(
        factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword),
      );

    case "function":
      return factory.createTypeReferenceNode(
        factory.createIdentifier("Function"),
      );

    case "function[]":
      return factory.createArrayTypeNode(
        factory.createTypeReferenceNode(factory.createIdentifier("Function")),
      );

    case "any":
      return factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);

    case "any[]": // a kinda strange type, but to be complete, let's cover it
      return factory.createArrayTypeNode(
        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
      );

    default:
      // UI5 type
      if (typeName.endsWith("[]")) {
        // rare case: an array thereof, something like "sap.ui.core.CSSSize[]"
        return factory.createArrayTypeNode(
          factory.createTypeReferenceNode(
            uniqueImport(
              typeName.slice(0, -2).trim(),
              requiredImports,
              knownGlobals,
              currentClassName,
            ),
            typeArguments,
          ),
        );
      } else {
        // common case: something like "sap.ui.core.CSSSize"
        return factory.createTypeReferenceNode(
          uniqueImport(
            typeName,
            requiredImports,
            knownGlobals,
            currentClassName,
          ),
          typeArguments,
        );
      }
  }
}

function uniqueImport(
  typeName: string,
  requiredImports: RequiredImports,
  knownGlobals: GlobalToModuleMapping,
  currentClassName: string,
) {
  if (typeName === currentClassName) {
    // this is the class we are currently dealing with; no import and no name uniqueness check required
    requiredImports.selfIsUsed = true; // FIXME: improve this shortcut
    return typeName;
  }

  if (requiredImports[typeName]) {
    return requiredImports[typeName].localName;
  }

  const parts = typeName.split(".");
  let localName = parts[parts.length - 1];

  // ensure uniqueness
  while (nameIsUsed(localName, requiredImports)) {
    localName += "_";
  }

  let moduleInfo: {
    moduleName: string;
    exportName?: string;
    localName?: string;
  } = knownGlobals[typeName];

  if (!moduleInfo) {
    // FIXME  e.g. a local module within the app
    const match = typeName.match(/"([^"]+)"\.(.*)/);
    if (match) {
      moduleInfo = {
        localName: localName,
        moduleName: match[1],
        exportName: match[2] || undefined,
      };
    } else {
      const moduleName = typeName.replace(/\./g, "/"); // FIXME
      moduleInfo = {
        localName,
        moduleName,
        exportName: undefined, // FIXME
      };
      log.warn(
        `For the type '${typeName}' an import is created with module name '${moduleName}', using its default export. Is this correct?
Usually this indicates some kind of issue. Maybe this import will also show up as error in your code editor.
The cause of this could be that the type '${typeName}' is referenced somewhere in Class '${currentClassName}', but is mis-spelled or does actually not exist.`,
      );
    }
  }

  requiredImports[typeName] = {
    localName: localName,
    moduleName: moduleInfo.moduleName,
    exportName: moduleInfo.exportName,
  };
  return localName;
}

function nameIsUsed(localName: string, requiredImports: RequiredImports) {
  for (const importName in requiredImports) {
    if (requiredImports[importName].localName === localName) {
      // name already used
      return true;
    }
  }
}

function addLineBreakBefore(node: ts.Node, count = 1) {
  for (let i = 0; i < count; i++) {
    ts.addSyntheticLeadingComment(
      node,
      ts.SyntaxKind.SingleLineCommentTrivia,
      "",
    );
  }
}

function createConstructorBlock(settingsTypeName: string) {
  const nodes: ts.Node[] = [];

  // This creates:
  //   constructor(id?: string | $SampleControlSettings);
  nodes.push(
    factory.createConstructorDeclaration(
      undefined,
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "idOrSettings",
          factory.createToken(ts.SyntaxKind.QuestionToken),
          factory.createUnionTypeNode([
            factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
            factory.createTypeReferenceNode(settingsTypeName),
          ]),
        ),
      ],
      undefined,
    ),
  );

  // This creates:
  //   constructor(id?: string, settings?: $SampleControlSettings);
  nodes.push(
    factory.createConstructorDeclaration(
      undefined,
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "id",
          factory.createToken(ts.SyntaxKind.QuestionToken),
          factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        ),
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "settings",
          factory.createToken(ts.SyntaxKind.QuestionToken),
          factory.createTypeReferenceNode(settingsTypeName),
        ),
      ],
      undefined,
    ),
  );

  // This creates:
  //   constructor(id?: string, settings?: $SampleControlSettings) {
  //      super(id, settings);
  //   }
  nodes.push(
    factory.createConstructorDeclaration(
      undefined,
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "id",
          factory.createToken(ts.SyntaxKind.QuestionToken),
          factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        ),
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          "settings",
          factory.createToken(ts.SyntaxKind.QuestionToken),
          factory.createTypeReferenceNode(settingsTypeName),
        ),
      ],
      factory.createBlock([
        factory.createExpressionStatement(
          factory.createCallExpression(factory.createSuper(), undefined, [
            factory.createIdentifier("id"),
            factory.createIdentifier("settings"),
          ]),
        ),
      ]),
    ),
  );

  return nodes;
}

const makeEventParametersName = (className: string, eventName: string) => {
  const capitalizedEventName =
    eventName.charAt(0).toUpperCase() + eventName.slice(1);
  return {
    eventParametersName: `${className}$${capitalizedEventName}EventParameters`,
    eventTypealiasName: `${className}$${capitalizedEventName}Event`,
  };
};

function generateEventWithGenericsCompatibilityModule(
  className: string,
  requiredImports: RequiredImports,
  knownGlobals: GlobalToModuleMapping,
) {
  const typeParameters = [
    factory.createTypeParameterDeclaration(
      undefined,
      factory.createIdentifier("ParamsType"),
      factory.createTypeReferenceNode(factory.createIdentifier("Record"), [
        factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
      ]),
      factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword),
    ),
  ];

  const methods = [
    factory.createMethodSignature(
      undefined,
      factory.createIdentifier("constructor"),
      undefined,
      undefined,
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          factory.createIdentifier("id"),
          undefined,
          factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          undefined,
        ),
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          factory.createIdentifier("oSource"),
          undefined,
          createTSTypeNode(
            "sap.ui.base.EventProvider",
            requiredImports,
            knownGlobals,
            className,
          ),
          undefined,
        ),
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          factory.createIdentifier("parameters"),
          undefined,
          factory.createTypeReferenceNode(
            factory.createIdentifier("ParamsType"),
            undefined,
          ),
          undefined,
        ),
      ],
      undefined,
    ),
    factory.createMethodSignature(
      undefined,
      factory.createIdentifier("getParameters"),
      undefined,
      undefined,
      [],
      factory.createTypeReferenceNode(
        factory.createIdentifier("ParamsType"),
        undefined,
      ),
    ),
    factory.createMethodSignature(
      undefined,
      factory.createIdentifier("getParameter"),
      undefined,
      [
        factory.createTypeParameterDeclaration(
          undefined,
          factory.createIdentifier("ParamName"),
          factory.createTypeOperatorNode(
            ts.SyntaxKind.KeyOfKeyword,
            factory.createTypeReferenceNode(
              factory.createIdentifier("ParamsType"),
              undefined,
            ),
          ),
          undefined,
        ),
      ],
      [
        fixedCreateParameterDeclaration(
          undefined,
          undefined,
          factory.createIdentifier("name"),
          undefined,
          factory.createTypeReferenceNode(
            factory.createIdentifier("ParamName"),
            undefined,
          ),
          undefined,
        ),
      ],
      factory.createIndexedAccessTypeNode(
        factory.createTypeReferenceNode(
          factory.createIdentifier("ParamsType"),
          undefined,
        ),
        factory.createTypeReferenceNode(
          factory.createIdentifier("ParamName"),
          undefined,
        ),
      ),
    ),
  ];

  let interfaceDeclaration: ts.InterfaceDeclaration;
  if (parseFloat(ts.version) >= 4.8) {
    interfaceDeclaration = factory.createInterfaceDeclaration(
      [
        factory.createToken(ts.SyntaxKind.ExportKeyword),
        factory.createToken(ts.SyntaxKind.DefaultKeyword),
      ],
      factory.createIdentifier("Event"),
      typeParameters,
      [],
      methods,
    );
  } else {
    interfaceDeclaration = factory.createInterfaceDeclaration(
      undefined,
      [
        factory.createToken(ts.SyntaxKind.ExportKeyword),
        factory.createToken(ts.SyntaxKind.DefaultKeyword),
      ],
      factory.createIdentifier("Event"),
      typeParameters,
      [],
      // @ts-ignore: below TS 4.8 there were more params
      methods,
    );
  }

  const moduleDeclaration =
    parseFloat(ts.version) >= 4.8
      ? factory.createModuleDeclaration(
          [factory.createToken(ts.SyntaxKind.DeclareKeyword)],
          factory.createStringLiteral("sap/ui/base/Event"),
          factory.createModuleBlock([interfaceDeclaration]),
        )
      : factory.createModuleDeclaration(
          undefined,
          // @ts-ignore old signature
          [factory.createToken(ts.SyntaxKind.DeclareKeyword)],
          factory.createStringLiteral("sap/ui/base/Event"),
          factory.createModuleBlock([interfaceDeclaration]),
        );

  ts.addSyntheticLeadingComment(
    moduleDeclaration,
    ts.SyntaxKind.SingleLineCommentTrivia,
    " This module enhances sap.ui.base.Event with Generics, which is needed in UI5 type definition versions below 1.115",
  );

  return moduleDeclaration;
}

function generateEventParameterInterfaces(
  events: {
    [key: string]: UI5Event;
  },
  className: string,
  requiredImports: RequiredImports,
  knownGlobals: GlobalToModuleMapping,
) {
  const eventParameterInterfaces: {
    [eventName: string]: ts.InterfaceDeclaration;
  } = {};

  for (const eventName in events) {
    const event = events[eventName];
    if (event.visibility !== "hidden") {
      const properties: ts.PropertySignature[] = [];
      for (const parameterName in event.parameters) {
        const parameter = event.parameters[parameterName];
        const property = factory.createPropertySignature(
          undefined,
          factory.createIdentifier(parameter.name),
          factory.createToken(ts.SyntaxKind.QuestionToken),
          createTSTypeNode(
            parameter.type,
            requiredImports,
            knownGlobals,
            className,
          ),
        );
        /*
         TODO: comments for event parameters are not supported yet. From a certain nesting depth, Hjson.parse without comments is used, so they are lost.
         Once they are available, this can be enabled:
        addJSDocCommentToNode(
          property,
          buildJSDocStringFromLines(createJSDocCenterPart(parameter, []))
        );
        */
        properties.push(property);
      }

      const interfc =
        parseFloat(ts.version) >= 4.8
          ? factory.createInterfaceDeclaration(
              [factory.createToken(ts.SyntaxKind.ExportKeyword)],
              factory.createIdentifier(
                makeEventParametersName(className, eventName)
                  .eventParametersName,
              ),
              undefined,
              undefined,
              properties,
            )
          : factory.createInterfaceDeclaration(
              undefined,
              [factory.createToken(ts.SyntaxKind.ExportKeyword)],
              factory.createIdentifier(
                makeEventParametersName(className, eventName)
                  .eventParametersName,
              ),
              undefined,
              undefined,
              // @ts-ignore: below TS 4.8 there were more params
              properties,
            );
      addJSDocCommentToNode(
        interfc,
        buildJSDocStringFromLines(
          createJSDocCenterPart(event, [
            `Interface describing the parameters of ${className}'${
              className.endsWith("s") ? "" : "s"
            } '${eventName}' event.`,
          ]),
        ),
      );
      // empty interfaces can cause issues with linting
      if (properties.length === 0) {
        ts.addSyntheticLeadingComment(
          interfc,
          ts.SyntaxKind.SingleLineCommentTrivia,
          " eslint-disable-next-line",
        );
      }

      eventParameterInterfaces[eventName] = interfc;
    }
  }

  return eventParameterInterfaces;
}

function generateEventTypeAliases(
  events: { [eventName: string]: UI5Event },
  eventParameterInterfaces: { [eventName: string]: ts.InterfaceDeclaration },
  className: string,
  requiredImports: RequiredImports,
  knownGlobals: GlobalToModuleMapping,
) {
  const eventTypeAliases: { [eventName: string]: ts.TypeAliasDeclaration } = {};

  for (const eventName in eventParameterInterfaces) {
    const typeNode = createTSTypeNode(
      "sap.ui.base.Event",
      requiredImports,
      knownGlobals,
      className,
      [
        factory.createTypeReferenceNode(
          factory.createIdentifier(
            eventParameterInterfaces[eventName].name.text,
          ),
          undefined,
        ),
      ],
    );
    const typeAlias =
      parseFloat(ts.version) >= 4.8
        ? factory.createTypeAliasDeclaration(
            [factory.createToken(ts.SyntaxKind.ExportKeyword)],
            factory.createIdentifier(
              makeEventParametersName(className, eventName).eventTypealiasName,
            ),
            undefined,
            typeNode,
          )
        : factory.createTypeAliasDeclaration(
            undefined,
            [factory.createToken(ts.SyntaxKind.ExportKeyword)],
            factory.createIdentifier(
              makeEventParametersName(className, eventName).eventTypealiasName,
            ),
            undefined,
            // @ts-ignore: below TS 4.8 there were more params
            typeNode,
          );
    addJSDocCommentToNode(
      typeAlias,
      buildJSDocStringFromLines(
        createJSDocCenterPart(events[eventName], [
          `Type describing the ${className}'${
            className.endsWith("s") ? "" : "s"
          } '${eventName}' event.`,
        ]),
      ),
    );

    eventTypeAliases[eventName] = typeAlias;
  }
  return eventTypeAliases;
}

export {
  generateMethods,
  generateEventWithGenericsCompatibilityModule,
  generateSettingsInterface,
  generateEventParameterInterfaces,
  generateEventTypeAliases,
  addLineBreakBefore,
  createConstructorBlock,
};
