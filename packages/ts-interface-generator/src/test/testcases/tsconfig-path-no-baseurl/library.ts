import DataType from "sap/ui/base/DataType";
import Lib from "sap/ui/core/Lib";

const thisLib: object&{MyJSEnum?: object; MyTSEnum?: object} = Lib.init({
    name: "my",
    version: "${version}",
    dependencies: ["sap.ui.core"],
    types: [],
    interfaces: [],
    controls: [],
    elements: [],
    noLibraryCSS: false,
});

export const MyJSEnum = {
    Foo: "foo",
    Bar: "bar",
} as const;
thisLib.MyJSEnum = MyJSEnum;
DataType.registerEnum("mylib.MyJSEnum", thisLib.MyJSEnum);

export enum MyTSEnum {
    Foo = "foo",
    Bar = "bar",
}
thisLib.MyTSEnum = MyTSEnum;
DataType.registerEnum("mylib.MyTSEnum", thisLib.MyTSEnum);

export default thisLib;
