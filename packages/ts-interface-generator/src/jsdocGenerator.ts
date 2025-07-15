import Preferences from "./preferences";

// converted to TypeScript after copying from https://github.com/UI5/openui5/blob/b21d5c95cbba5a6ad455a9276659e4698bc7421a/lib/jsdoc/ui5/plugin.js#L1618-L2307
// Then all type information stripped from the generated JSDoc, as well as visibility, @synthetic, @name, @function etc.
// hungarian prefixing is removed as well

let minimal: boolean;

const rEmptyLine = /^\s*$/;

// removes leading and trailing empty lines as well as duplicate empty lines within the content
function trim(lines: string[]) {
  let contentSeen = false,
    lastLineWasEmpty = false;
  lines = lines.filter((line) => {
    const lineHasContent = line != null && !rEmptyLine.test(line);
    contentSeen = contentSeen || lineHasContent;
    if (lineHasContent) {
      lastLineWasEmpty = false;
      return true;
    } else if (!contentSeen) {
      // all lines so far empty
      return false;
    } else {
      // this line is empty, but there was content before
      if (!lastLineWasEmpty) {
        // line is empty, but previous had content => preserve
        lastLineWasEmpty = true;
        return true;
      } else {
        // lastLineWasEmpty
        return false;
      }
    }
  });
  if (lastLineWasEmpty) {
    lines.pop();
  }

  return lines;
}

export function createJSDocCenterPart(info: APIMember, lines: string[] = []) {
  if (info.doc) {
    lines.push(info.doc.trim());
    lines.push("");
  }

  if (info.since) {
    lines.push("@since " + info.since);
  }
  if (info.deprecation !== undefined) {
    // "undefined" check to even output the tag when there is empty text}
    lines.push("@deprecated " + info.deprecation);
  }
  if (info.experimental !== undefined) {
    // "undefined" check to even output the tag when there is empty text}
    lines.push("@experimental " + info.experimental);
  }

  return lines;
}

export function buildJSDocStringFromLines(lines: string[]) {
  lines = Array.prototype.concat.apply([], lines) as string[]; // flatten
  lines = trim(lines);

  if (lines.length > 0) {
    const comment = "\r\n * " + lines.join("\r\n * ") + "\r\n ";
    return comment;
  }
}

export function addJSDoc(oClassInfo: ClassInfo) {
  let lines;

  minimal = Preferences.get().jsdoc !== "verbose";

  oClassInfo.generatedJSDoc = {};

  function isEmpty(obj: object) {
    if (!obj) {
      return true;
    }
    for (const n in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, n)) {
        return false;
      }
    }
    return true;
  }

  function newJSDoc(
    methodType: MethodType,
    propertyName: string,
    info: APIMember,
    lines: string[],
    suffixLines: string[],
  ) {
    if (!oClassInfo.generatedJSDoc[methodType]) {
      oClassInfo.generatedJSDoc[methodType] = {};
    }

    if (minimal) {
      lines = []; // ignore generated prefix when prefs are set to "minimal"
    }
    lines.push("");

    createJSDocCenterPart(info, lines);

    if (!minimal) {
      // only add generated suffix when prefs are not set to "minimal"
      suffixLines && suffixLines.forEach((line) => lines.push(line));
      lines.push("");
    }

    oClassInfo.generatedJSDoc[methodType][propertyName] =
      buildJSDocStringFromLines(lines);
  }

  function generateParamTag(
    n: string,
    type: string,
    description: string,
    defaultValue: string,
  ) {
    let s = "@param ";

    if (defaultValue !== null) {
      s += "[" + n + "=" + JSON.stringify(defaultValue) + "]";
    } else {
      s += n;
    }

    s += " " + description;

    return s;
  }

  for (const n in oClassInfo.properties) {
    const info = oClassInfo.properties[n];
    if (info.visibility === "hidden") {
      continue;
    }

    newJSDoc(
      MethodType.PropertyGet,
      n,
      info,
      ['Gets current value of property "' + n + '".'],
      [
        info.defaultValue !== null // && info.defaultValue.value !== null
          ? "Default value is: " + JSON.stringify(info.defaultValue)
          : "",
        '@returns Value of property "' + n + '"',
      ],
    );
    newJSDoc(
      MethodType.PropertySet,
      n,
      info,
      ['Sets a new value for property "' + n + '".'],
      [
        'When called with a value of "null" or "undefined", the default value of the property will be restored.',
        "",
        info.defaultValue !== null // && info.defaultValue.value !== null
          ? "Default value is: " + JSON.stringify(info.defaultValue)
          : "",
        generateParamTag(
          n,
          info.type,
          'New value for property "' + n + '"',
          info.defaultValue as string,
        ),
        '@returns Reference to "this" in order to allow method chaining',
      ],
    );
    if (info.bindable) {
      newJSDoc(
        MethodType.PropertyBind,
        n,
        info,
        ['Binds property "' + n + '" to model data.'],
        [
          "See {@link sap.ui.base.ManagedObject#bindProperty ManagedObject.bindProperty} for a ",
          'detailed description of the possible properties of "oBindingInfo"',
          "@param oBindingInfo The binding information",
          '@returns Reference to "this" in order to allow method chaining',
        ],
      );
      newJSDoc(
        MethodType.PropertyUnbind,
        n,
        info,
        ['Unbinds property "' + n + '" from model data.'],
        ['@returns Reference to "this" in order to allow method chaining'],
      );
    }
  }

  for (const n in oClassInfo.aggregations) {
    const info = oClassInfo.aggregations[n];
    if (info.visibility === "hidden") {
      continue;
    }
    newJSDoc(
      MethodType.AggregationGet,
      n,
      info,
      [
        'Gets content of aggregation "' + n + '".',
        n === oClassInfo.defaultAggregation
          ? "Note: this is the default aggregation for " + n + "."
          : "",
      ],
      [
        // TODO: @returns missing?!?
      ],
    );
    if (info.cardinality == "0..n") {
      const n1 = info.singularName;
      newJSDoc(
        MethodType.AggregationInsert,
        n,
        info,
        ["Inserts a " + n1 + ' into the aggregation "' + n + '".'],
        [
          "@param " +
            n1 +
            " The " +
            n1 +
            " to insert; if empty, nothing is inserted",
          '@param index The "0"-based index the ' +
            n1 +
            " should be inserted at; for",
          '             a negative value of "iIndex", the ' +
            n1 +
            " is inserted at position 0; for a value",
          "             greater than the current size of the aggregation, the " +
            n1 +
            " is inserted at",
          "             the last position",
          '@returns Reference to "this" in order to allow method chaining',
        ],
      );
      newJSDoc(
        MethodType.AggregationAdd,
        n,
        info,
        ["Adds some " + n1 + ' to the aggregation "' + n + '".'],
        [
          "@param " +
            n1 +
            " The " +
            n1 +
            " to add; if empty, nothing is inserted",
          '@returns Reference to "this" in order to allow method chaining',
        ],
      );
      newJSDoc(
        MethodType.AggregationRemove,
        n,
        info,
        ["Removes a " + n1 + ' from the aggregation "' + n + '".'],
        [
          "@param " + n1 + " The " + n1 + " to remove or its index or id",
          "@returns The removed " + n1 + ' or "null"',
        ],
      );
      newJSDoc(
        MethodType.AggregationRemoveAll,
        n,
        info,
        [
          'Removes all the controls from the aggregation "' + n + '".',
          "Additionally, it unregisters them from the hosting UIArea.",
        ],
        ["@returns  An array of the removed elements (might be empty)"],
      );
      newJSDoc(
        MethodType.AggregationIndexOf,
        n,
        info,
        [
          'Checks for the provided "' +
            info.type +
            '" in the aggregation "' +
            n +
            '".',
          "and returns its index if found or -1 otherwise.",
        ],
        [
          "@param " + n1 + " The " + n1 + " whose index is looked for",
          "@returns The index of the provided control in the aggregation if found, or -1 otherwise",
        ],
      );
    } else {
      newJSDoc(
        MethodType.AggregationSet,
        n,
        info,
        ["Sets the aggregated " + n + "."],
        [
          "@param " + n + " The " + n + " to set",
          '@returns Reference to "this" in order to allow method chaining',
        ],
      );
    }
    newJSDoc(
      MethodType.AggregationDestroy,
      n,
      info,
      [
        "Destroys " +
          (info.cardinality === "0..n" ? "all " : "") +
          "the " +
          n +
          ' in the aggregation "' +
          n +
          '".',
      ],
      ['@returns Reference to "this" in order to allow method chaining'],
    );
    if (info.bindable) {
      newJSDoc(
        MethodType.AggregationBind,
        n,
        info,
        ['Binds aggregation "' + n + '" to model data.'],
        [
          "See {@link sap.ui.base.ManagedObject#bindAggregation ManagedObject.bindAggregation} for a ",
          'detailed description of the possible properties of "oBindingInfo".',
          "@param oBindingInfo The binding information",
          '@returns Reference to "this" in order to allow method chaining',
        ],
      );
      newJSDoc(
        MethodType.AggregationUnbind,
        n,
        info,
        ['Unbinds aggregation "' + n + '" from model data.'],
        ['@returns Reference to "this" in order to allow method chaining'],
      );
    }
  }

  for (const n in oClassInfo.associations) {
    const info = oClassInfo.associations[n];
    if (info.visibility === "hidden") {
      continue;
    }
    newJSDoc(
      MethodType.AssociationGet,
      n,
      info,
      [
        info.cardinality === "0..n"
          ? 'Returns array of IDs of the elements which are the current targets of the association "' +
            n +
            '".'
          : 'ID of the element which is the current target of the association "' +
            n +
            '", or "null".',
      ],
      [],
    );
    if (info.cardinality === "0..n") {
      const n1 = info.singularName;
      newJSDoc(
        MethodType.AssociationAdd,
        n,
        info,
        ["Adds some " + n1 + ' into the association "' + n + '".'],
        [
          "@param " +
            n1 +
            " The " +
            n +
            " to add; if empty, nothing is inserted",
          '@returns Reference to "this" in order to allow method chaining',
        ],
      );
      newJSDoc(
        MethodType.AssociationRemove,
        n,
        info,
        ["Removes an " + n1 + " from the association named " + n + "."],
        [
          "@param " + n1 + " The " + n1 + " to be removed or its index or ID",
          "@returns The removed " + n1 + ' or "null"',
        ],
      );
      newJSDoc(
        MethodType.AssociationRemoveAll,
        n,
        info,
        ["Removes all the controls in the association named " + n + "."],
        ["@returns An array of the removed elements (might be empty)"],
      );
    } else {
      newJSDoc(
        MethodType.AssociationSet,
        n,
        info,
        ["Sets the associated " + n + "."],
        [
          "@param " +
            n +
            ' ID of an element which becomes the new target of this "' +
            n +
            '" association; alternatively, an element instance may be given',
          '@returns Reference to "this" in order to allow method chaining',
        ],
      );
    }
  }

  for (const n in oClassInfo.events) {
    const info = oClassInfo.events[n];
    lines = [
      info.doc ? info.doc : "",
      "",
      info.allowPreventDefault
        ? 'Listeners may prevent the default action of this event by calling the "preventDefault" method on the event object.'
        : "",
      "",
      info.enableEventBubbling
        ? "This event bubbles up the control hierarchy."
        : "",
      "",
      info.since ? "@since " + info.since : "",
      info.deprecation ? "@deprecated " + info.deprecation : "",
      info.experimental ? "@experimental " + info.experimental : "",
      "@param oControlEvent",
      "@param oControlEvent.getSource",
      "@param oControlEvent.getParameters",
    ];
    for (const pName in info.parameters) {
      lines.push(
        "@param oControlEvent.getParameters." +
          pName +
          " " +
          (info.parameters[pName].doc || ""),
      );
    }
    //newJSDoc(lines); // TODO

    newJSDoc(
      MethodType.EventAttach,
      n,
      info,
      [
        'Attaches event handler "fn" to the "' +
          n +
          '" event of this "' +
          oClassInfo.name +
          '".',
      ],
      [
        'When called, the context of the event handler (its "this") will be bound to "oListener" if specified, ',
        'otherwise it will be bound to this "' + oClassInfo.name + '" itself.',
        "",
        "@param fn The function to be called when the event occurs",
        '@param listener Context object to call the event handler with. Defaults to this "' +
          oClassInfo.name +
          '" itself',
        "",
        '@returns Reference to "this" in order to allow method chaining',
      ],
    );
    newJSDoc(
      MethodType.EventAttachWithData,
      n,
      info,
      [
        'Attaches event handler "fn" to the "' +
          n +
          '" event of this "' +
          oClassInfo.name +
          '".',
      ],
      [
        'When called, the context of the event handler (its "this") will be bound to "oListener" if specified, ',
        'otherwise it will be bound to this "' + oClassInfo.name + '" itself.',
        "",
        "@param data An application-specific payload object that will be passed to the event handler along with the event object when firing the event",
        "@param fn The function to be called when the event occurs",
        '@param listener Context object to call the event handler with. Defaults to this "' +
          oClassInfo.name +
          '" itself',
        "",
        '@returns Reference to "this" in order to allow method chaining',
      ],
    );
    newJSDoc(
      MethodType.EventDetach,
      n,
      info,
      [
        'Detaches event handler "fn" from the "' +
          n +
          '" event of this "' +
          oClassInfo.name +
          '".',
      ],
      [
        "The passed function and listener object must match the ones used for event registration.",
        "",
        "@param fn The function to be called, when the event occurs",
        "@param listener Context object on which the given function had to be called",
        '@returns Reference to "this" in order to allow method chaining',
        info.since ? "@since " + info.since : "",
        info.deprecation ? "@deprecated " + info.deprecation : "",
        info.experimental ? "@experimental " + info.experimental : "",
      ],
    );

    // build documentation for fireEvent. It contains conditional parts which makes it a bit more complicated
    lines = ['Fires event "' + n + '" to attached listeners.'];
    const suffixLines = [];
    if (info.allowPreventDefault) {
      suffixLines.push(
        "",
        'Listeners may prevent the default action of this event by calling the "preventDefault" method on the event object.',
        "The return value of this method indicates whether the default action should be executed.",
        "",
      );
    }
    suffixLines.push(
      "",
      "@param parameters Parameters to pass along with the event",
    );
    if (!isEmpty(info.parameters)) {
      for (const pName in info.parameters) {
        suffixLines.push(
          "@param [mParameters." +
            pName +
            "] " +
            (info.parameters[pName].doc || ""),
        );
      }
      suffixLines.push("");
    }
    if (info.allowPreventDefault) {
      suffixLines.push("@returns Whether or not to prevent the default action");
    } else {
      suffixLines.push(
        '@returns Reference to "this" in order to allow method chaining',
      );
    }
    newJSDoc(MethodType.EventFire, n, info, lines, suffixLines);
  }
}
