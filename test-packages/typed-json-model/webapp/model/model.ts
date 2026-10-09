import Message from "sap/ui/core/message/Message";
import ClientContextBinding from "sap/ui/model/ClientContextBinding";
import Context from "sap/ui/model/Context";
import Filter from "sap/ui/model/Filter";
import Sorter from "sap/ui/model/Sorter";
import JSONModel from "sap/ui/model/json/JSONModel";
import JSONListBinding from "sap/ui/model/json/JSONListBinding";
import JSONPropertyBinding from "sap/ui/model/json/JSONPropertyBinding";
import JSONTreeBinding from "sap/ui/model/json/JSONTreeBinding";
import {
  AbsoluteBindingPath,
  AbsoluteListBindingPath,
  PropertyByAbsoluteBindingPath,
  PropertyByRelativeBindingPath,
  RelativeBindingPath,
  RelativeListBindingPath,
  AbsoluteObjectBindingPath,
  RelativeObjectBindingPath,
  AbsoluteTreeBindingPath,
  RelativeTreeBindingPath,
} from "./typing";

export class TypedJSONContext<Data extends object, Root extends AbsoluteBindingPath<Data>> extends Context {
  constructor(oModel: TypedJSONModel<Data>, sPath: Root) {
    super(oModel, sPath);
  }

  getModel(): TypedJSONModel<Data> {
    return super.getModel() as TypedJSONModel<Data>;
  }

  getProperty<P extends RelativeBindingPath<Data, Root>>(
    sPath: P extends RelativeBindingPath<Data, Root> ? P : never,
  ): PropertyByRelativeBindingPath<Data, Root, P> {
    return super.getProperty(sPath) as PropertyByRelativeBindingPath<Data, Root, P>;
  }
}

export class TypedJSONModel<Data extends object> extends JSONModel {
  constructor(oData?: Data, bObserve?: boolean) {
    super(oData, bObserve);
  }

  createBindingContext<Path extends AbsoluteBindingPath<Data>>(
    sPath: Path,
    oContext?: Context,
    mParameters?: object,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    fnCallBack?: Function,
    bReload?: boolean,
  ): TypedJSONContext<Data, Path> {
    return super.createBindingContext(sPath, oContext, mParameters, fnCallBack, bReload) as TypedJSONContext<Data, Path>;
  }

  // Overload for absolute paths
  bindContext<Path extends AbsoluteObjectBindingPath<Data>>(
    sPath: Path,
    oContext?: undefined,
    mParameters?: object,
  ): ClientContextBinding;
  // Overload for relative paths
  bindContext<Path extends RelativeObjectBindingPath<Data, Root>, Root extends AbsoluteObjectBindingPath<Data>>(
    sPath: Path,
    oContext: TypedJSONContext<Data, Root>,
    mParameters?: object,
  ): ClientContextBinding;
  // Implementation
  bindContext<
    Path extends AbsoluteObjectBindingPath<Data> | RelativeObjectBindingPath<Data, Root>,
    Root extends AbsoluteObjectBindingPath<Data>,
  >(sPath: Path, oContext?: TypedJSONContext<Data, Root>, mParameters?: object): ClientContextBinding {
    return super.bindContext(sPath, oContext, mParameters);
  }

  // Overload for absolute paths
  bindList<Path extends AbsoluteListBindingPath<Data>>(
    sPath: Path,
    oContext?: undefined,
    aSorters?: Sorter | Sorter[],
    aFilters?: Filter | Filter[],
    mParameters?: object,
  ): JSONListBinding;
  // Overload for relative paths
  bindList<Path extends RelativeListBindingPath<Data, Root>, Root extends AbsoluteBindingPath<Data>>(
    sPath: Path,
    oContext: TypedJSONContext<Data, Root>,
    aSorters?: Sorter | Sorter[],
    aFilters?: Filter | Filter[],
    mParameters?: object,
  ): JSONListBinding;
  // Implementation
  bindList<
    Path extends AbsoluteListBindingPath<Data> | RelativeListBindingPath<Data, Root>,
    Root extends AbsoluteBindingPath<Data>,
  >(
    sPath: Path,
    oContext?: TypedJSONContext<Data, Root>,
    aSorters?: Sorter | Sorter[],
    aFilters?: Filter | Filter[],
    mParameters?: object,
  ): JSONListBinding {
    return super.bindList(sPath, oContext, aSorters, aFilters, mParameters);
  }

  // Overload for absolute paths
  bindProperty<Path extends AbsoluteBindingPath<Data>>(
    sPath: Path,
    oContext?: undefined,
    mParameters?: object,
  ): JSONPropertyBinding;
  // Overload for relative paths
  bindProperty<Path extends RelativeBindingPath<Data, Root>, Root extends AbsoluteBindingPath<Data>>(
    sPath: Path,
    oContext: TypedJSONContext<Data, Root>,
    mParameters?: object,
  ): JSONPropertyBinding;
  bindProperty<
    Path extends AbsoluteBindingPath<Data> | RelativeBindingPath<Data, Root>,
    Root extends AbsoluteBindingPath<Data>,
  >(sPath: Path, oContext?: TypedJSONContext<Data, Root>, mParameters?: object): JSONPropertyBinding {
    return super.bindProperty(sPath, oContext, mParameters);
  }

  // Overload for absolute paths
  bindTree<Path extends AbsoluteTreeBindingPath<Data>>(
    sPath: Path,
    oContext?: undefined,
    aFilters?: Filter | Filter[],
    mParameters?: object,
    aSorters?: Sorter | Sorter[],
  ): JSONTreeBinding;
  // Overload for relative paths
  bindTree<Path extends RelativeTreeBindingPath<Data, Root>, Root extends AbsoluteBindingPath<Data>>(
    sPath: Path,
    oContext: TypedJSONContext<Data, Root>,
    aFilters?: Filter | Filter[],
    mParameters?: object,
    aSorters?: Sorter | Sorter[],
  ): JSONTreeBinding;
  // Implementation
  bindTree<
    Path extends AbsoluteTreeBindingPath<Data> | RelativeTreeBindingPath<Data, Root>,
    Root extends AbsoluteBindingPath<Data>,
  >(
    sPath: Path,
    oContext?: TypedJSONContext<Data, Root>,
    aFilters?: Filter | Filter[],
    mParameters?: object,
    aSorters?: Sorter | Sorter[],
  ): JSONTreeBinding {
    return super.bindTree(sPath, oContext, aFilters, mParameters, aSorters);
  }

  getData(): Data {
    return super.getData() as Data;
  }

  getMessagesByPath<Path extends AbsoluteBindingPath<Data>>(sPath: Path, bPrefixMatch?: boolean): Message[] {
    return super.getMessagesByPath(sPath, bPrefixMatch);
  }

  getProperty<Path extends AbsoluteBindingPath<Data>>(sPath: Path): PropertyByAbsoluteBindingPath<Data, Path>;
  getProperty<Path extends RelativeBindingPath<Data, Root>, Root extends AbsoluteBindingPath<Data>>(
    sPath: Path,
    oContext: TypedJSONContext<Data, Root>,
  ): PropertyByRelativeBindingPath<Data, Root, Path>;
  getProperty<Path extends AbsoluteBindingPath<Data> | RelativeBindingPath<Data, Root>, Root extends AbsoluteBindingPath<Data>>(
    sPath: Path,
    oContext?: TypedJSONContext<Data, Root>,
  ): PropertyByAbsoluteBindingPath<Data, Path> | PropertyByRelativeBindingPath<Data, Root, Path> {
    return super.getProperty(sPath, oContext) as
      PropertyByAbsoluteBindingPath<Data, Path> | PropertyByRelativeBindingPath<Data, Root, Path>;
  }

  setData(oData: Data, bMerge?: boolean): void {
    super.setData(oData, bMerge);
  }

  // setProperty with AbsoluteBindingPath (context === undefined),
  // PLEASE NOTE: the parameter is still necessary so
  // the bAsyncUpdate parameter can also be used with absolute paths.
  setProperty<Path extends AbsoluteBindingPath<Data>>(
    sPath: Path,
    oValue: PropertyByAbsoluteBindingPath<Data, Path>,
    oContext?: undefined,
    bAsyncUpdate?: boolean,
  ): boolean;
  setProperty<Path extends RelativeBindingPath<Data, Root>, Root extends AbsoluteBindingPath<Data>>(
    sPath: Path,
    oValue: PropertyByRelativeBindingPath<Data, Root, Path>,
    oContext: TypedJSONContext<Data, Root>,
    bAsyncUpdate?: boolean,
  ): boolean;
  setProperty<Path extends AbsoluteBindingPath<Data> | RelativeBindingPath<Data, Root>, Root extends AbsoluteBindingPath<Data>>(
    sPath: Path,
    oValue: Path extends AbsoluteBindingPath<Data>
      ? PropertyByAbsoluteBindingPath<Data, Path>
      : PropertyByRelativeBindingPath<Data, Root, Path>,
    oContext?: TypedJSONContext<Data, Root>,
    bAsyncUpdate?: boolean,
  ): boolean {
    return super.setProperty(sPath, oValue, oContext, bAsyncUpdate);
  }
}
