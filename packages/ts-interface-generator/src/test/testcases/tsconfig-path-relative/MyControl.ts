import Control from "sap/ui/core/Control";
import type { MetadataOptions } from "sap/ui/core/Element";
import { MyJSEnum, MyTSEnum } from "./library";

export default class MyControl extends Control {
    static readonly metadata: MetadataOptions = {
        properties: {
            myJSEnumVal: {
                type: "my.MyJSEnum",
                defaultValue: MyJSEnum.Foo,
            },
            myTSEnumVal: {
                type: "my.MyTSEnum",
                defaultValue: MyTSEnum.Foo,
            },
            myDependency: {
                type: "my.MyDependency",
            },
        },
    };
    constructor(idOrSettings?: string | $MyControlSettings);
    constructor(id?: string, settings?: $MyControlSettings);
    constructor(id?: string, settings?: $MyControlSettings) { super(id, settings); }
}
