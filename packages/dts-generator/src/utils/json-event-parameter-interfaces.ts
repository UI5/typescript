import { getLogger } from "@ui5/logger";
import {
  ApiJSON,
  ClassSymbol,
  ConcreteSymbol,
  InterfaceSymbol,
  ObjCallableParameter,
  ObjEvent,
  ObjMethod,
  TypedefSymbol,
  Ui5Event,
} from "../types/api-json.js";
const log = getLogger("@ui5/dts-generator/constructor-settings-interfaces");
import { splitName } from "./base-utils.js";
import {
  addJsDocProps,
  isA,
  makeSettingsNames,
} from "./json-constructor-settings-interfaces.js";
import { FunctionType, TypeReference } from "../types/ast.js";

/**
 * Creates for each event in an `EventProvider` subclass an interface that describes the
 * event parameters which are received when listening to an event.
 *
 * The corresponding parameter of the event-related methods is re-typed to this
 * interface.
 *
 * For the dependencies of the currently processed library, only the interface itself
 * is generated (`addDetails = false`), not the individual properties of it. The interface
 * itself is needed so that classes of the currently processed library can find the
 * super-interface for their settings interfaces.
 *
 * This method requires the dependencies to check whether a class is a subclass of
 * `EventProvider`.
 *
 * @param symbols
 * @param dependencies
 * @param addDetails Whether the interface should contain all parameters
 */
function createEventParameterInterfaces(
  symbols: ConcreteSymbol[],
  dependencies: ApiJSON[],
  addDetails: boolean,
) {
  const typeUniverse = new Map();

  [symbols, ...dependencies.map((api) => api.symbols)].forEach(
    (symArray: ConcreteSymbol[]) => {
      symArray.forEach((symbol) => typeUniverse.set(symbol.name, symbol));
    },
  );

  const isEventProvider = (
    symbol: ConcreteSymbol | string,
  ): symbol is ClassSymbol => {
    return isA(symbol, "sap.ui.base.EventProvider", typeUniverse);
  };

  const makeEventParametersName = (fqn: string, eventName: string) => {
    const capitalizedEventName =
      eventName.charAt(0).toUpperCase() + eventName.slice(1);
    const [pkgname, basename] = splitName(fqn);
    return {
      fullEventParametersName: `${pkgname}.${basename}\$${capitalizedEventName}EventParameters`,
      shortEventParametersName: `${basename}\$${capitalizedEventName}EventParameters`,
      fullEventTypealiasName: `${pkgname}.${basename}\$${capitalizedEventName}Event`,
      shortEventTypealiasName: `${basename}\$${capitalizedEventName}Event`,
    };
  };

  function buildProperties(srcProperties) {
    const transformedProperties = [];
    for (let propertyName in srcProperties) {
      const prop = srcProperties[propertyName];
      transformedProperties.push(
        addJsDocProps(
          {
            name: prop.name,
            type: prop.type,
            visibility: "public", // prop.visibility,
          },
          prop,
        ),
      );
    }
    return transformedProperties;
  }

  function nextEventProviderSuperClass(symbol) {
    if (
      !symbol.extends ||
      symbol.extends === "sap.ui.base.EventProvider" ||
      !isEventProvider(symbol.extends)
    ) {
      return undefined;
    }
    const superClass = typeUniverse.get(symbol.extends) as ClassSymbol;
    return superClass;
  }

  function nextSuperClassWithSameEvent(
    symbol,
    eventName,
  ): { superClass: ClassSymbol; superEvent: Ui5Event } {
    let superClassSymbol = nextEventProviderSuperClass(symbol);
    while (superClassSymbol) {
      const superEvents =
        superClassSymbol.events &&
        superClassSymbol.events.filter(
          (superEvent) => superEvent.name === eventName,
        );
      if (superEvents && superEvents.length === 1) {
        return {
          superClass: superClassSymbol,
          superEvent: superEvents[0],
        };
      } else if (superEvents && superEvents.length > 1) {
        debugger; // should never happen
      } else {
        // superclass does not have the event -> go up the class hierarchy
        superClassSymbol = nextEventProviderSuperClass(superClassSymbol);
      }
    }
    return undefined; // no parent class with same event found
  }

  function typesDiffer(type1, type2) {
    if (JSON.stringify(type1) !== JSON.stringify(type2)) {
      return true;
    }
    return false;
  }

  function getEventMethods(symbol: ClassSymbol, eventName: string) {
    const capitalizedEventName =
      eventName.charAt(0).toUpperCase() + eventName.slice(1);
    return {
      attach: symbol.methods.find(
        (method) => method.name === `attach${capitalizedEventName}`,
      ),
      detach: symbol.methods.find(
        (method) => method.name === `detach${capitalizedEventName}`,
      ),
      fire: symbol.methods.find(
        (method) => method.name === `fire${capitalizedEventName}`,
      ),
    };
  }

  function convertToFunctionTypeWithParameterizedEvent(
    paramType: TypeReference,
    eventTypeName: string,
  ) {
    const functionType = Object.assign(paramType, {
      kind: "FunctionType",
      type: {
        kind: "TypeReference",
        typeName: "void",
      },
      parameters: [
        {
          name: "evt",
          kind: "Parameter",
          type: {
            kind: "TypeReference",
            typeName: eventTypeName,
          },
        },
      ],
    }) as unknown as FunctionType;

    delete paramType.typeName;
    return functionType;
  }

  function enrichEventMethods(
    symbol: ClassSymbol,
    eventName: string,
    eventTypeName: string,
    eventParametersInterfaceName: string,
  ) {
    const { attach, detach, fire } = getEventMethods(symbol, eventName);

    // attach
    let param = attach?.parameters[1];
    if (param?.name === "fnFunction") {
      if (
        param.type.kind === "TypeReference" &&
        param.type.typeName === "Function"
      ) {
        param.type = convertToFunctionTypeWithParameterizedEvent(
          param.type,
          eventTypeName,
        );
      } else if (
        param.type.kind === "FunctionType" &&
        param.type.parameters &&
        param.type.parameters[0].type.kind === "TypeReference" &&
        param.type.parameters[0].type.typeName === "sap.ui.base.Event"
      ) {
        param.type.parameters[0].type.typeName = eventTypeName; // replace "Event" with the fully typed event
      } else {
        console.error(
          `Unusual event attach method: ${symbol.name} ${eventName}`,
        );
      }
    }

    // detach
    param = detach?.parameters[0];
    if (param?.name === "fnFunction") {
      if (
        param.type.kind === "TypeReference" &&
        param.type.typeName === "Function"
      ) {
        param.type = convertToFunctionTypeWithParameterizedEvent(
          param.type,
          eventTypeName,
        );
      } else if (
        param.type.kind === "FunctionType" &&
        param.type.parameters &&
        param.type.parameters[0].type.kind === "TypeReference" &&
        param.type.parameters[0].type.typeName === "sap.ui.base.Event"
      ) {
        param.type.parameters[0].type.typeName = eventTypeName; // replace "Event" with the fully typed event
      } else {
        console.error(
          `Unusual event detach method: ${symbol.name} ${eventName}`,
        );
      }
    }

    // fire
    param = fire?.parameters[0];
    if (
      param &&
      ["mParameters", "oParameters"].includes(param.name) &&
      param.type.kind === "TypeReference" &&
      param.type.typeName === "object"
    ) {
      param.type.typeName = `${eventParametersInterfaceName}`; // replace parameter object type with the fully typed parameters object
    } else if (fire) {
      // often the fire method is simply missing
      console.error(`Unusual event fire method: ${symbol.name} ${eventName}`);
    }
  }

  const eventRelatedInterfaces: (InterfaceSymbol | TypedefSymbol)[] = [];
  symbols.forEach((symbol) => {
    if (isEventProvider(symbol)) {
      log.verbose(`adding event parameter interfaces for ${symbol.name}`);
      if (symbol.events) {
        symbol.events.forEach((event) => {
          // build the interface (with no properties (event parameters) yet)
          const {
            fullEventParametersName,
            shortEventParametersName,
            fullEventTypealiasName,
            shortEventTypealiasName,
          } = makeEventParametersName(symbol.name, event.name);
          const eventParametersInterface: InterfaceSymbol = {
            kind: "interface",
            name: fullEventParametersName,
            basename: shortEventParametersName,
            module: symbol.module,
            resource: symbol.resource,
            export: shortEventParametersName,
            visibility: symbol.visibility,
            __isNotAMarkerInterface: true,
          };

          // collect parameters
          const allParameters =
            (addDetails &&
              event.parameters &&
              (event.parameters[0] as ObjCallableParameter).parameterProperties
                ?.getParameters?.parameterProperties) ||
            [];
          const hasParameters = Object.keys(allParameters).length > 0; // remember because elements from allParameters are removed below; if true, then at least somesuperclass has parameters

          // search superclasses for same event
          let superClassWithSameEvent =
            addDetails && nextSuperClassWithSameEvent(symbol, event.name);
          while (allParameters && superClassWithSameEvent) {
            let { superClass, superEvent } = superClassWithSameEvent;
            if (!eventParametersInterface.extends) {
              // only the first time
              eventParametersInterface.extends = makeEventParametersName(
                superClass.name,
                superEvent.name,
              ).fullEventParametersName;
            }

            // get inherited parameters to check compatibility and remove them from the new inheriting interface
            const superParameters =
              superEvent.parameters &&
              (superEvent.parameters[0] as ObjCallableParameter)
                .parameterProperties?.getParameters?.parameterProperties;
            for (let superParamName in superParameters) {
              const superParam = superParameters[superParamName];
              if (allParameters[superParamName]) {
                // check compatibility
                if (
                  typesDiffer(
                    superParam.type,
                    allParameters[superParamName].type,
                  )
                ) {
                  // happens only once in entire UI5 and in this case, the event of the subclass uses a subclass of the type, so it is fine
                }
                // remove parameter, as it is inherited
                delete allParameters[superParamName];
              }
            }

            superClassWithSameEvent = nextSuperClassWithSameEvent(
              superClass,
              event.name,
            );
          }

          // now add the parameters to the interface
          const parameters = buildProperties(allParameters);
          eventParametersInterface.properties = parameters;
          eventParametersInterface.description = `Parameters of the ${symbol.basename}#${event.name} event.`;
          if (event.deprecated) {
            eventParametersInterface.deprecated = event.deprecated;
          }
          if (event.experimental) {
            eventParametersInterface.experimental = event.experimental;
          }

          // ...and the interface to the list
          eventRelatedInterfaces.push(eventParametersInterface);

          // now also create a type alias for the event with these parameters and the concrete event source type
          const eventTypedef: TypedefSymbol = {
            kind: "typedef",
            name: fullEventTypealiasName,
            type: {
              kind: "TypeReference",
              typeName: "sap.ui.base.Event",
              typeArguments: [
                {
                  kind: "TypeReference",
                  typeName: shortEventParametersName,
                },
                {
                  kind: "TypeReference",
                  typeName: symbol.basename,
                },
              ],
            },
            basename: shortEventTypealiasName,
            module: symbol.module,
            resource: symbol.resource,
            export: shortEventTypealiasName,
            visibility: symbol.visibility,
          };
          eventTypedef.description = `Event object of the ${symbol.basename}#${event.name} event.`;
          if (event.deprecated) {
            eventTypedef.deprecated = event.deprecated;
          }
          if (event.experimental) {
            eventTypedef.experimental = event.experimental;
          }
          eventRelatedInterfaces.push(eventTypedef);

          // now *use* the interface / type alias
          if (addDetails && hasParameters) {
            // use the interface in the event-related methods - in those cases where it or a superclass has properties
            enrichEventMethods(
              symbol,
              event.name,
              shortEventTypealiasName,
              eventParametersInterface.name,
            );

            // finally also add the event parameter interface to the settings object
            const settingsInterface = typeUniverse.get(
              makeSettingsNames(symbol.name).name,
            );
            let eventProperty;
            if (
              settingsInterface &&
              (eventProperty = settingsInterface.properties.find(
                (prop) => prop.name === event.name,
              ))
            ) {
              const eventPropertyType = eventProperty.type;
              // is it REALLY a property that relates to an event? In case of name clashes it could rarely be NOT (but for a property instead). At the time of writing, there is ONE known instance of this (sap.ui.vk.DrawerToolbar's "expanded").
              if (
                eventPropertyType.kind === "FunctionType" &&
                eventPropertyType.parameters.length === 1 &&
                eventPropertyType.parameters[0].type.kind === "TypeReference" &&
                eventPropertyType.parameters[0].type.typeName ===
                  "sap.ui.base.Event"
              ) {
                eventPropertyType.parameters[0].type.typeName =
                  shortEventTypealiasName; // replace "Event" with the specific event type
              } else {
                log.info(
                  `Property '${event.name}' in the settings object for ${symbol.name} does not relate to an event. Maybe shadowed by a property with same name.`,
                );
              }
            } else {
              // e.g. an object that is no ManagedObject and has hence no settings interface
            }
          }
        });
      }
    }
  });

  symbols.push(...eventRelatedInterfaces);
}

export function addEventParameterInterfaces(
  apijson: ApiJSON,
  dependencies: ApiJSON[],
) {
  dependencies.forEach((dep) => {
    createEventParameterInterfaces(dep.symbols, dependencies, false);
  });
  createEventParameterInterfaces(apijson.symbols, dependencies, true);
}
