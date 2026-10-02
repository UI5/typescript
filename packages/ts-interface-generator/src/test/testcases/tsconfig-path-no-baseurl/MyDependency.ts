import Control from "sap/ui/core/Control";
import type { MetadataOptions } from "sap/ui/core/Element";

export default class MyDependency extends Control {
    static readonly metadata: MetadataOptions = {
        properties: {
            foo: {
                type: "string",
                defaultValue: "bar",
            },
        },
    };

    constructor(idOrSettings?: string | $MyDependencySettings);
    constructor(id?: string, settings?: $MyDependencySettings);
    constructor(id?: string, settings?: $MyDependencySettings) { super(id, settings); }
}
