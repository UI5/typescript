---
"@ui5/dts-generator": minor
---

Event parameter interfaces now reflect actual optionality from the UI5 source data. Previously all event parameters were unconditionally generated as optional (`?`); now parameters marked `optional: false` in the API are generated as required. A new `eventsWithAllParamsOptional` directive in `.dtsgenrc` lets you preserve the legacy all-optional behavior for specific events whose optionality hasn't been verified upstream yet.
