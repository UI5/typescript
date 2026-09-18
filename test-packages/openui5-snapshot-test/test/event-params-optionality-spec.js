"use strict";

const assert = require("assert");

describe("event parameter optionality", function () {
  this.timeout(10000);

  let generateFromObjects;

  before(async () => {
    ({ generateFromObjects } = await import("@ui5/dts-generator"));
  });

  const directives = {
    badSymbols: [],
    badMethods: [],
    badInterfaces: [],
    typeTyposMap: {},
    namespacesToInterfaces: {},
    forwardDeclarations: {},
    fqnToIgnore: {},
    overlays: {},
    deprecatedEnumAliases: {},
    modulesWithNamedExports: [],
    eventsWithAllParamsOptional: [],
  };

  function makeEvent(name, parameterProperties) {
    return {
      name,
      visibility: "public",
      parameters: [
        {
          name: "oControlEvent",
          type: "sap.ui.base.Event",
          parameterProperties: {
            getSource: {
              name: "getSource",
              type: "sap.ui.base.EventProvider",
              optional: false,
            },
            getParameters: {
              name: "getParameters",
              type: "object",
              optional: false,
              parameterProperties,
            },
          },
        },
      ],
    };
  }

  function findPropertyLine(dtsText, propName) {
    return dtsText
      .split("\n")
      .find(
        (l) =>
          l.includes(propName) &&
          l.includes(":") &&
          !l.includes("/**") &&
          !l.includes("*"),
      );
  }

  async function generate(apiObject, dependencyApiObjects, customDirectives) {
    return generateFromObjects({
      apiObject,
      dependencyApiObjects,
      directives: customDirectives || directives,
    });
  }

  describe("default behavior (trusts source data)", function () {
    const baseLibApi = {
      library: "sap.ui.core",
      version: "1.0.0",
      symbols: [
        {
          kind: "namespace",
          name: "sap.ui.base",
          basename: "base",
          resource: "sap/ui/base/library.js",
          module: "sap/ui/base/library",
          export: "",
          visibility: "public",
          description: "",
        },
        {
          kind: "class",
          name: "sap.ui.base.EventProvider",
          basename: "EventProvider",
          resource: "sap/ui/base/EventProvider.js",
          module: "sap/ui/base/EventProvider",
          export: "",
          visibility: "public",
          abstract: true,
          description: "Base event provider.",
          methods: [
            {
              name: "attachEvent",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "sEventId", type: "string", optional: false },
                { name: "oData", type: "object", optional: true },
                { name: "fnFunction", type: "function", optional: false },
                { name: "oListener", type: "object", optional: true },
              ],
            },
            {
              name: "detachEvent",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "sEventId", type: "string", optional: false },
                { name: "fnFunction", type: "function", optional: false },
                { name: "oListener", type: "object", optional: true },
              ],
            },
            {
              name: "fireEvent",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "sEventId", type: "string", optional: false },
                { name: "mParameters", type: "object", optional: true },
              ],
            },
          ],
        },
      ],
    };

    function makeTestLib(events) {
      return {
        library: "testlib",
        version: "1.0.0",
        symbols: [
          {
            kind: "namespace",
            name: "testlib",
            basename: "testlib",
            resource: "testlib/library.js",
            module: "testlib/library",
            export: "",
            visibility: "public",
            description: "",
          },
          {
            kind: "class",
            name: "testlib.MyClass",
            basename: "MyClass",
            resource: "testlib/MyClass.js",
            module: "testlib/MyClass",
            export: "",
            visibility: "public",
            extends: "sap.ui.base.EventProvider",
            description: "A test class extending EventProvider.",
            events,
            methods: [
              {
                name: "attachChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "oData", type: "object", optional: true },
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "detachChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "fireChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "mParameters", type: "object", optional: true },
                ],
              },
            ],
          },
        ],
      };
    }

    it("parameters with optional: false become required", async () => {
      const event = makeEvent("change", {
        selectedItem: {
          name: "selectedItem",
          type: "string",
          optional: false,
          description: "The selected item.",
        },
      });

      const result = await generate(makeTestLib([event]), [baseLibApi]);

      const selectedItemLine = findPropertyLine(result.dtsText, "selectedItem");
      assert.ok(selectedItemLine, "selectedItem should appear in output");
      assert.ok(
        !selectedItemLine.includes("?"),
        `selectedItem should be required (no '?'), got: "${selectedItemLine.trim()}"`,
      );
    });

    it("parameters with optional: true stay optional", async () => {
      const event = makeEvent("change", {
        selectedItem: {
          name: "selectedItem",
          type: "string",
          optional: true,
          description: "The selected item.",
        },
      });

      const result = await generate(makeTestLib([event]), [baseLibApi]);

      assert.match(result.dtsText, /selectedItem\?/);
    });

    it("mixed: optional: false → required, optional: true → optional", async () => {
      const event = makeEvent("change", {
        selectedItem: {
          name: "selectedItem",
          type: "string",
          optional: false,
          description: "The selected item.",
        },
        value: {
          name: "value",
          type: "string",
          optional: true,
          description: "The value.",
        },
      });

      const result = await generate(makeTestLib([event]), [baseLibApi]);

      const selectedItemLine = findPropertyLine(result.dtsText, "selectedItem");
      const valueLine = findPropertyLine(result.dtsText, "value");

      assert.ok(selectedItemLine, "selectedItem should appear in output");
      assert.ok(valueLine, "value should appear in output");
      assert.ok(
        !selectedItemLine.includes("?"),
        `selectedItem should be required (no '?'), got: "${selectedItemLine.trim()}"`,
      );
      assert.ok(
        valueLine.includes("?"),
        `value should be optional (has '?'), got: "${valueLine.trim()}"`,
      );
    });

    // All parameters should have optional: true or false in practice;
    // this test documents the defensive fallback behavior (treated as optional).
    it("parameters without optional field default to optional", async () => {
      const event = makeEvent("change", {
        source: {
          name: "source",
          type: "string",
          description: "The event source.",
        },
      });

      const result = await generate(makeTestLib([event]), [baseLibApi]);

      assert.match(result.dtsText, /source\?/);
    });
  });

  describe("eventsWithAllParamsOptional deny-list", function () {
    const baseLibApi = {
      library: "sap.ui.core",
      version: "1.0.0",
      symbols: [
        {
          kind: "namespace",
          name: "sap.ui.base",
          basename: "base",
          resource: "sap/ui/base/library.js",
          module: "sap/ui/base/library",
          export: "",
          visibility: "public",
          description: "",
        },
        {
          kind: "class",
          name: "sap.ui.base.EventProvider",
          basename: "EventProvider",
          resource: "sap/ui/base/EventProvider.js",
          module: "sap/ui/base/EventProvider",
          export: "",
          visibility: "public",
          abstract: true,
          description: "Base event provider.",
          methods: [
            {
              name: "attachEvent",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "sEventId", type: "string", optional: false },
                { name: "oData", type: "object", optional: true },
                { name: "fnFunction", type: "function", optional: false },
                { name: "oListener", type: "object", optional: true },
              ],
            },
            {
              name: "detachEvent",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "sEventId", type: "string", optional: false },
                { name: "fnFunction", type: "function", optional: false },
                { name: "oListener", type: "object", optional: true },
              ],
            },
            {
              name: "fireEvent",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "sEventId", type: "string", optional: false },
                { name: "mParameters", type: "object", optional: true },
              ],
            },
          ],
        },
      ],
    };

    function makeTestLib(events) {
      return {
        library: "testlib",
        version: "1.0.0",
        symbols: [
          {
            kind: "namespace",
            name: "testlib",
            basename: "testlib",
            resource: "testlib/library.js",
            module: "testlib/library",
            export: "",
            visibility: "public",
            description: "",
          },
          {
            kind: "class",
            name: "testlib.MyClass",
            basename: "MyClass",
            resource: "testlib/MyClass.js",
            module: "testlib/MyClass",
            export: "",
            visibility: "public",
            extends: "sap.ui.base.EventProvider",
            description: "A test class extending EventProvider.",
            events,
            methods: [
              {
                name: "attachChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "oData", type: "object", optional: true },
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "detachChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "fireChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "mParameters", type: "object", optional: true },
                ],
              },
            ],
          },
        ],
      };
    }

    it("deny-listed event has all parameters optional", async () => {
      const event = makeEvent("change", {
        selectedItem: {
          name: "selectedItem",
          type: "string",
          optional: false,
          description: "The selected item.",
        },
        value: {
          name: "value",
          type: "string",
          optional: true,
          description: "The value.",
        },
      });

      const denyListDirectives = {
        ...directives,
        eventsWithAllParamsOptional: ["testlib.MyClass:change"],
      };

      const result = await generate(
        makeTestLib([event]),
        [baseLibApi],
        denyListDirectives,
      );

      assert.match(result.dtsText, /selectedItem\?/);
      assert.match(result.dtsText, /value\?/);
    });

    it("deny-list only affects listed events", async () => {
      const apiObject = {
        library: "testlib",
        version: "1.0.0",
        symbols: [
          {
            kind: "namespace",
            name: "testlib",
            basename: "testlib",
            resource: "testlib/library.js",
            module: "testlib/library",
            export: "",
            visibility: "public",
            description: "",
          },
          {
            kind: "class",
            name: "testlib.MyClass",
            basename: "MyClass",
            resource: "testlib/MyClass.js",
            module: "testlib/MyClass",
            export: "",
            visibility: "public",
            extends: "sap.ui.base.EventProvider",
            description: "A test class.",
            events: [
              makeEvent("change", {
                selectedItem: {
                  name: "selectedItem",
                  type: "string",
                  optional: false,
                  description: "The selected item.",
                },
              }),
              makeEvent("press", {
                source: {
                  name: "source",
                  type: "string",
                  optional: false,
                  description: "The source.",
                },
              }),
            ],
            methods: [
              {
                name: "attachChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "oData", type: "object", optional: true },
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "detachChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "fireChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "mParameters", type: "object", optional: true },
                ],
              },
              {
                name: "attachPress",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "oData", type: "object", optional: true },
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "detachPress",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "firePress",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "mParameters", type: "object", optional: true },
                ],
              },
            ],
          },
        ],
      };

      const denyListDirectives = {
        ...directives,
        eventsWithAllParamsOptional: ["testlib.MyClass:change"],
      };

      const result = await generate(
        apiObject,
        [baseLibApi],
        denyListDirectives,
      );

      // "change" is deny-listed → selectedItem stays optional
      assert.match(result.dtsText, /selectedItem\?/);

      // "press" is NOT deny-listed → source becomes required
      const sourceLine = findPropertyLine(result.dtsText, "source");
      assert.ok(sourceLine, "source should appear in output");
      assert.ok(
        !sourceLine.includes("?"),
        `source should be required (no '?'), got: "${sourceLine.trim()}"`,
      );
    });
  });

  describe("inheritance", function () {
    const baseLibApi = {
      library: "sap.ui.core",
      version: "4.0.0",
      symbols: [
        {
          kind: "namespace",
          name: "sap.ui.base",
          basename: "base",
          resource: "sap/ui/base/library.js",
          module: "sap/ui/base/library",
          export: "",
          visibility: "public",
          description: "",
        },
        {
          kind: "class",
          name: "sap.ui.base.EventProvider",
          basename: "EventProvider",
          resource: "sap/ui/base/EventProvider.js",
          module: "sap/ui/base/EventProvider",
          export: "",
          visibility: "public",
          abstract: true,
          description: "Base event provider.",
          methods: [
            {
              name: "attachEvent",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "sEventId", type: "string", optional: false },
                { name: "oData", type: "object", optional: true },
                { name: "fnFunction", type: "function", optional: false },
                { name: "oListener", type: "object", optional: true },
              ],
            },
            {
              name: "detachEvent",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "sEventId", type: "string", optional: false },
                { name: "fnFunction", type: "function", optional: false },
                { name: "oListener", type: "object", optional: true },
              ],
            },
            {
              name: "fireEvent",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "sEventId", type: "string", optional: false },
                { name: "mParameters", type: "object", optional: true },
              ],
            },
          ],
        },
        {
          kind: "class",
          name: "sap.ui.base.Parent",
          basename: "Parent",
          resource: "sap/ui/base/Parent.js",
          module: "sap/ui/base/Parent",
          export: "",
          visibility: "public",
          extends: "sap.ui.base.EventProvider",
          description: "A parent class with a change event.",
          events: [
            makeEvent("change", {
              value: {
                name: "value",
                type: "string",
                optional: false,
                description: "The value.",
              },
            }),
          ],
          methods: [
            {
              name: "attachChange",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "oData", type: "object", optional: true },
                { name: "fnFunction", type: "function", optional: false },
                { name: "oListener", type: "object", optional: true },
              ],
            },
            {
              name: "detachChange",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "fnFunction", type: "function", optional: false },
                { name: "oListener", type: "object", optional: true },
              ],
            },
            {
              name: "fireChange",
              visibility: "public",
              returnValue: { type: "this" },
              parameters: [
                { name: "mParameters", type: "object", optional: true },
              ],
            },
          ],
        },
      ],
    };

    it("inherited parameters are not redeclared in child interface", async () => {
      const childEvent = makeEvent("change", {
        value: {
          name: "value",
          type: "string",
          optional: false,
          description: "The value.",
        },
        extra: {
          name: "extra",
          type: "string",
          optional: false,
          description: "Extra param added by child.",
        },
      });

      const apiObject = {
        library: "testlib",
        version: "1.0.0",
        symbols: [
          {
            kind: "namespace",
            name: "testlib",
            basename: "testlib",
            resource: "testlib/library.js",
            module: "testlib/library",
            export: "",
            visibility: "public",
            description: "",
          },
          {
            kind: "class",
            name: "testlib.Child",
            basename: "Child",
            resource: "testlib/Child.js",
            module: "testlib/Child",
            export: "",
            visibility: "public",
            extends: "sap.ui.base.Parent",
            description: "A child class.",
            events: [childEvent],
            methods: [
              {
                name: "attachChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "oData", type: "object", optional: true },
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "detachChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "fireChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "mParameters", type: "object", optional: true },
                ],
              },
            ],
          },
        ],
      };

      const result = await generate(apiObject, [baseLibApi]);

      // "extra" is new in the child → required (optional: false, no deny-list)
      const extraLine = findPropertyLine(result.dtsText, "extra");
      assert.ok(extraLine, "extra should appear in output");
      assert.ok(
        !extraLine.includes("?"),
        `extra should be required (no '?'), got: "${extraLine.trim()}"`,
      );

      // "value" is inherited from parent → not redeclared in child interface
      assert.ok(
        !findPropertyLine(result.dtsText, "value"),
        "value should NOT appear in child interface (it is inherited from parent)",
      );

      // The child interface should extend the parent interface
      assert.match(
        result.dtsText,
        /Child\$ChangeEventParameters extends Parent\$ChangeEventParameters/,
      );
    });

    it("parent deny-listed: inherited params stay optional, child's new params are required", async () => {
      const childEvent = makeEvent("change", {
        value: {
          name: "value",
          type: "string",
          optional: false,
          description: "The value.",
        },
        extra: {
          name: "extra",
          type: "string",
          optional: false,
          description: "Extra param added by child.",
        },
      });

      const apiObject = {
        library: "testlib",
        version: "1.0.0",
        symbols: [
          {
            kind: "namespace",
            name: "testlib",
            basename: "testlib",
            resource: "testlib/library.js",
            module: "testlib/library",
            export: "",
            visibility: "public",
            description: "",
          },
          {
            kind: "class",
            name: "testlib.Child",
            basename: "Child",
            resource: "testlib/Child.js",
            module: "testlib/Child",
            export: "",
            visibility: "public",
            extends: "sap.ui.base.Parent",
            description: "A child class.",
            events: [childEvent],
            methods: [
              {
                name: "attachChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "oData", type: "object", optional: true },
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "detachChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "fnFunction", type: "function", optional: false },
                  { name: "oListener", type: "object", optional: true },
                ],
              },
              {
                name: "fireChange",
                visibility: "public",
                returnValue: { type: "this" },
                parameters: [
                  { name: "mParameters", type: "object", optional: true },
                ],
              },
            ],
          },
        ],
      };

      const denyListDirectives = {
        ...directives,
        eventsWithAllParamsOptional: ["sap.ui.base.Parent:change"],
      };

      const result = await generate(apiObject, [baseLibApi], denyListDirectives);

      // "extra" is new in the child (not deny-listed) → required
      const extraLine = findPropertyLine(result.dtsText, "extra");
      assert.ok(extraLine, "extra should appear in output");
      assert.ok(
        !extraLine.includes("?"),
        `extra should be required (no '?'), got: "${extraLine.trim()}"`,
      );

      // child extends parent interface
      assert.match(
        result.dtsText,
        /Child\$ChangeEventParameters extends Parent\$ChangeEventParameters/,
      );
    });
  });
});
