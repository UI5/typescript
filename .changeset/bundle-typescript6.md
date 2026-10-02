---
"@ui5/ts-interface-generator": minor
---

The `typescript` peer dependency has been removed. The tool now bundles its own TypeScript compiler internally (pinned to TypeScript 6.0.3), so it works regardless of which TypeScript version your project uses — including TypeScript 7.

Also fixes path resolution for projects that use `paths` without `baseUrl` and suppresses spurious diagnostics for unrecognized compiler options.
