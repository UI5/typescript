import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";
import { $ControlSettings } from "sap/ui/core/Control";

declare module "./MyDependency" {

    /**
     * Interface defining the settings object used in constructor calls
     */
    interface $MyDependencySettings extends $ControlSettings {
        foo?: string | PropertyBindingInfo;
    }

    export default interface MyDependency {

        // property: foo

        /**
         * Gets current value of property "foo".
         *
         * Default value is: "bar"
         * @returns Value of property "foo"
         */
        getFoo(): string;

        /**
         * Sets a new value for property "foo".
         *
         * When called with a value of "null" or "undefined", the default value of the property will be restored.
         *
         * Default value is: "bar"
         * @param [foo="bar"] New value for property "foo"
         * @returns Reference to "this" in order to allow method chaining
         */
        setFoo(foo: string): this;
    }
}
