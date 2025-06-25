import { getLogger } from "@ui5/logger";
const log = getLogger("@ui5/dts-generator/post-process");
import * as fs from "fs";
import prettier from "prettier";
const { format } = prettier;

export async function postProcess(
  dtsResult: { library: string; dtsText: string },
  options: { generateGlobals?: boolean },
) {
  switch (dtsResult.library) {
    case "sap.ui.core":
      // TODO rather implement a "preamble" feature in the directives

      let preamble = fs
        .readFileSync(
          new URL("../resources/core-preamble.d.ts", import.meta.url),
        )
        .toString();

      if (options.generateGlobals) {
        preamble = preamble.replace(
          /Array<import\("sap\/ui\/core\/Control"\).default>/g,
          "sap.ui.core.Control[]",
        );
        preamble = preamble.replace(
          /import\("sap\/ui\/core\/Control"\).default/g,
          "sap.ui.core.Control",
        );
      }

      // add the TypedJSONModel - but only if we do not generate globals
      if (!options.generateGlobals) {
        const typedJsonModel = fs
          .readFileSync(
            new URL("../resources/typed-json-model.d.ts", import.meta.url),
          )
          .toString();

        // the position right after JSONModel
        let pos = dtsResult.dtsText.indexOf(
          'declare module "sap/ui/model/json/JSONPropertyBinding" {',
        );
        // or at least before JSONModel
        if (pos === -1) {
          pos = dtsResult.dtsText.indexOf(
            'declare module "sap/ui/model/json/JSONModel" {',
          );
        }
        if (pos > -1) {
          // insert the typedJsonModel after/before the JSONModel module declaration in case we found it
          dtsResult.dtsText = await reformat(
            dtsResult.dtsText.slice(0, pos) +
              typedJsonModel +
              "\n" +
              dtsResult.dtsText.slice(pos),
          );
        } else {
          // otherwise just append it to the end of the dtsText
          dtsResult.dtsText += typedJsonModel;
        }
      }

      // prepend preamble
      dtsResult.dtsText = await reformat(preamble + dtsResult.dtsText);
      break;

    case "sap.ui.export":
      // TODO rather manage "forbidden" names in the DTS generator
      // But how to know a good replacement then?
      // The Kyrillic 'o' was picked to have the same appearance in Intellisense tooltips
      dtsResult.dtsText = await reformat(
        dtsResult.dtsText.replace(
          "namespace export",
          "export { exp\u043ert as export }\nnamespace exp\u043ert",
        ),
      );
      break;
  }
}

async function reformat(text: string): Promise<string> {
  try {
    const formattedText = await format(text, {
      parser: "typescript",
      trailingComma: "es5",
    });
    return formattedText;
  } catch (e) {
    // if we can't format successfully, at least we can manually inspect the un-formatted
    // definitions and find the error...
    log.error(e);
    return text;
  }
}
