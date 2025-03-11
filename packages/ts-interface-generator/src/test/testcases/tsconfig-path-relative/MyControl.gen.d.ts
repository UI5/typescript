import { MyJSEnum } from "my/library";
import { MyTSEnum } from "my/library";
import MyDependency from "my/MyDependency";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";
import { $ControlSettings } from "sap/ui/core/Control";

declare module "./MyControl" {

    /**
     * Interface defining the settings object used in constructor calls
     */
    interface $MyControlSettings extends $ControlSettings {
        myJSEnumVal?: MyJSEnum | PropertyBindingInfo | `{${string}}`;
        myTSEnumVal?: MyTSEnum | PropertyBindingInfo | `{${string}}`;
        myDependency?: MyDependency | PropertyBindingInfo | `{${string}}`;
    }

    export default interface MyControl {

        // property: myJSEnumVal

        /**
         * Gets current value of property "myJSEnumVal".
         *
         * Default value is: "MyJSEnum.Foo,"
         * @returns Value of property "myJSEnumVal"
         */
        getMyJSEnumVal(): MyJSEnum;

        /**
         * Sets a new value for property "myJSEnumVal".
         *
         * When called with a value of "null" or "undefined", the default value of the property will be restored.
         *
         * Default value is: "MyJSEnum.Foo,"
         * @param [myJSEnumVal="MyJSEnum.Foo,"] New value for property "myJSEnumVal"
         * @returns Reference to "this" in order to allow method chaining
         */
        setMyJSEnumVal(myJSEnumVal: MyJSEnum): this;

        // property: myTSEnumVal

        /**
         * Gets current value of property "myTSEnumVal".
         *
         * Default value is: "MyTSEnum.Foo,"
         * @returns Value of property "myTSEnumVal"
         */
        getMyTSEnumVal(): MyTSEnum;

        /**
         * Sets a new value for property "myTSEnumVal".
         *
         * When called with a value of "null" or "undefined", the default value of the property will be restored.
         *
         * Default value is: "MyTSEnum.Foo,"
         * @param [myTSEnumVal="MyTSEnum.Foo,"] New value for property "myTSEnumVal"
         * @returns Reference to "this" in order to allow method chaining
         */
        setMyTSEnumVal(myTSEnumVal: MyTSEnum): this;

        // property: myDependency

        /**
         * Gets current value of property "myDependency".
         *
         * @returns Value of property "myDependency"
         */
        getMyDependency(): MyDependency;

        /**
         * Sets a new value for property "myDependency".
         *
         * When called with a value of "null" or "undefined", the default value of the property will be restored.
         *
         * @param myDependency New value for property "myDependency"
         * @returns Reference to "this" in order to allow method chaining
         */
        setMyDependency(myDependency: MyDependency): this;
    }
}
