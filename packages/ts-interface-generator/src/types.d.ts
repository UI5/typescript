interface GlobalToModuleMapping {
  [key: string]: { moduleName: string; exportName?: string };
}

interface ManagedObjectInfo {
  sourceFile: ts.SourceFile;
  className: string;
  classDeclaration: ts.ClassDeclaration;
  isDefaultExport: boolean;
  settingsTypeFullName: string;
  interestingBaseClass:
    "ManagedObject" | "WebComponent" | "Element" | "Control" | undefined;
  constructorSignaturesAvailable: boolean;
  metadata: ts.PropertyDeclaration[];
}

interface RequiredImports {
  selfIsUsed?: boolean;
  [key: string]: { localName: string; moduleName: string; exportName?: string };
}

interface APIMember {
  name: string;
  doc?: string;
  since?: string;
  deprecation?: string;
  experimental?: string;
  visibility?: string;
  generatedJSDoc?: string;
}

interface APIMemberWithMethods extends APIMember {
  methods: { [key: string]: string };
}

interface APIMemberWithType extends APIMember {
  type: string;
}

interface Property extends APIMemberWithMethods, APIMemberWithType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultValue?: any;
  bindable?: boolean;
}

interface Aggregation extends APIMemberWithMethods, APIMemberWithType {
  cardinality: "0..1" | "0..n";
  altTypes: [string] | null;
  //dnd: any,
  singularName: string;
  bindable: boolean;
}

interface AggregationMetadata extends Aggregation {
  multiple: true;
}

interface Association extends APIMemberWithMethods, APIMemberWithType {
  cardinality: "0..1" | "0..n";
  singularName: string;
}

interface AssociationMetadata extends Association {
  multiple: true;
}

interface UI5Event extends APIMemberWithMethods {
  allowPreventDefault: boolean;
  enableEventBubbling: boolean;
  parameters: { [key: string]: EventParameter };
}

interface EventParameter {
  name: string;
  doc: string;
  deprecation: string;
  since: string;
  experimental: string;
  type: string;
}

type SpecialSetting = APIMemberWithType;

interface ClassInfo {
  name?: string;
  interfaces?: string[];
  doc?: string;
  deprecation?: string;
  since?: string;
  experimental?: string;
  specialSettings?: { [key: string]: SpecialSetting };
  properties?: { [key: string]: Property };
  defaultProperty?: string;
  aggregations?: { [key: string]: Aggregation };
  defaultAggregation?: string;
  associations?: { [key: string]: Association };
  events?: { [key: string]: UI5Event };
  methods?: Array<string>; // TODO (used for sap/ui/core/webc/WebComponent)
  getters?: Array<string>; // TODO (used for sap/ui/core/webc/WebComponent)
  annotations?: Record<string, unknown>; // TODO
  designtime?: boolean | string;
  designTime?: boolean | string;
  stereotype?: null;
  metadataClass?: undefined;
  library?: string;
  //dnd: any,

  abstract?: boolean;
  final?: boolean;

  generatedJSDoc?: GeneratedJSDoc;
}

type TypeForMetadataSectionName = {
  properties: Property;
  aggregations: Aggregation;
  associations: Association;
  events: UI5Event;
};

const enum MethodType {
  PropertySet = "PropertySet",
  PropertyGet = "PropertyGet",
  PropertyBind = "PropertyBind",
  PropertyUnbind = "PropertyUnbind",

  AggregationGet = "AggregationGet",
  AggregationInsert = "AggregationInsert",
  AggregationAdd = "AggregationAdd",
  AggregationRemove = "AggregationRemove",
  AggregationRemoveAll = "AggregationRemoveAll",
  AggregationIndexOf = "AggregationIndexOf",
  AggregationSet = "AggregationSet",
  AggregationDestroy = "AggregationDestroy",
  AggregationBind = "AggregationBind",
  AggregationUnbind = "AggregationUnbind",

  AssociationGet = "AssociationGet",
  AssociationAdd = "AssociationAdd",
  AssociationRemove = "AssociationRemove",
  AssociationRemoveAll = "AssociationRemoveAll",
  AssociationSet = "AssociationSet",

  EventAttach = "EventAttach",
  EventAttachWithData = "EventAttachWithData",
  EventDetach = "EventDetach",
  EventFire = "EventFire",
}
type GeneratedJSDoc = Partial<{
  [name in MethodType]: { [name: string]: string };
}>;

interface Doclet {
  description: string;
  deprecated: string;
  since: string;
  experimental: string;
  augments: string;
}
