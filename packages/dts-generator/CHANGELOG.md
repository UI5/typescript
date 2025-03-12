# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.6.0](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@3.5.0...@ui5/dts-generator@3.6.0) (2025-03-12)

### Bug Fixes

- **dts-generator:** fix download-apijson by querying differently ([#489](https://github.com/SAP/ui5-typescript/issues/489)) ([0e7e951](https://github.com/SAP/ui5-typescript/commit/0e7e9514e42747c6bf517af7c94e5ae3ebe7f582))

### Features

- **dts-generator:** allow "esmOnly" in directives and "readonly" props ([#491](https://github.com/SAP/ui5-typescript/issues/491)) ([b2c4d50](https://github.com/SAP/ui5-typescript/commit/b2c4d509e51bf2ecb9e820175c391d22955d35ab))

# [3.5.0](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@3.4.1...@ui5/dts-generator@3.5.0) (2025-02-08)

### Features

- **dts-generator:** improve support for function types ([#487](https://github.com/SAP/ui5-typescript/issues/487)) ([28b412e](https://github.com/SAP/ui5-typescript/commit/28b412e73cafe7888aa79b8855e1da9745876322))

### Reverts

- support constructor types and option parameters in function types ([#485](https://github.com/SAP/ui5-typescript/issues/485)) ([#486](https://github.com/SAP/ui5-typescript/issues/486)) ([27ce957](https://github.com/SAP/ui5-typescript/commit/27ce957db450e6c8fe9ab455dc588f083310aa4c))

## [3.4.1](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@3.4.0...@ui5/dts-generator@3.4.1) (2025-01-08)

### Bug Fixes

- take the changed enum representation into account for array types ([#483](https://github.com/SAP/ui5-typescript/issues/483)) ([1a1a660](https://github.com/SAP/ui5-typescript/commit/1a1a6609a69c6f6ad57c7d078e4e282a16e59d04))

# [3.4.0](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@3.3.1...@ui5/dts-generator@3.4.0) (2025-01-08)

### Features

- **dts-generator:** change how enums are referenced in the generated… ([#478](https://github.com/SAP/ui5-typescript/issues/478)) ([42fc290](https://github.com/SAP/ui5-typescript/commit/42fc290bb359a2962949a7d6da32407b69f01c32))

## [3.3.1](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@3.3.0...@ui5/dts-generator@3.3.1) (2024-09-11)

### Bug Fixes

- **dts-generator:** align deprecation/experimental tags with UI5 SDK ([#469](https://github.com/SAP/ui5-typescript/issues/469)) ([aa36d21](https://github.com/SAP/ui5-typescript/commit/aa36d21309695d8cd30a77b192f495df8db75101))

# [3.3.0](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@3.2.0...@ui5/dts-generator@3.3.0) (2024-07-04)

### Features

- **dts-generator:** allow changing names in .dtsgenrc overlays ([#464](https://github.com/SAP/ui5-typescript/issues/464)) ([5d5e690](https://github.com/SAP/ui5-typescript/commit/5d5e69082b174c2336ce36d9c90401eab49da60c))

# [3.2.0](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@3.1.0...@ui5/dts-generator@3.2.0) (2024-06-27)

### Features

- **dts-generator:** add user-agent to HTTP requests ([#462](https://github.com/SAP/ui5-typescript/issues/462)) ([b65eafa](https://github.com/SAP/ui5-typescript/commit/b65eafab80155b548c5abc7e9e175a04987a5669))

# [3.1.0](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@3.0.2...@ui5/dts-generator@3.1.0) (2024-05-07)

### Features

- add dependenciesTypePackagesForCheck option ([#451](https://github.com/SAP/ui5-typescript/issues/451)) ([2b2259b](https://github.com/SAP/ui5-typescript/commit/2b2259bde8eb8722b988b14f5884c4abae8e41c3))
- **dts-generator:** add download-apijson API and CLI ([49f0db2](https://github.com/SAP/ui5-typescript/commit/49f0db20d917a9820767814326f037c80e4ea64c))

## [3.0.2](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@3.0.1...@ui5/dts-generator@3.0.2) (2024-04-26)

### Bug Fixes

- make the dtslint dependency a real one, as it is used at runtime ([#450](https://github.com/SAP/ui5-typescript/issues/450)) ([9fbf892](https://github.com/SAP/ui5-typescript/commit/9fbf892212b56a964abf7539f5e9eed869b22197))

## [3.0.1](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@3.0.0...@ui5/dts-generator@3.0.1) (2024-04-25)

### Bug Fixes

- dtslint adaptations ([#447](https://github.com/SAP/ui5-typescript/issues/447)) ([944411c](https://github.com/SAP/ui5-typescript/commit/944411c2cdcb136c8e9f40560dbc954b5563c9ea))
- set up the dtslint temp folder only when needed ([#449](https://github.com/SAP/ui5-typescript/issues/449)) ([2a4f38e](https://github.com/SAP/ui5-typescript/commit/2a4f38e9fd6bab591e3ae6058283bbe3a4133b6b))

# [3.0.0](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@2.3.2...@ui5/dts-generator@3.0.0) (2024-04-25)

### Features

- HUGE update to the currently used generator ([1b2fbf5](https://github.com/SAP/ui5-typescript/commit/1b2fbf550678d12502abee3f5abf258dd0ab5fa9)). This change updates the dts-generator from the vastly outdated version 2.3.2 to the one developed internally over the past years, which is used to generate the new production-ready type definitions for UI5. The new dts-generator is based on the old version which was developed here, but has undergone huge changes and extensions. These changes include:
  - Conversion of the implementation to TypeScript
  - Creation of type definitions which declare ES modules instead of globals
    (globals are still supported as alternative generator output, though)
  - Entirely new API
  - Loads of adaptations to generate better type definitions (partly
    depending on changes in the UI5 codebase, so this new version might not
    run with `api.json` files generated by older versions of the UI5 tooling, like those provided with UI5 versions like 1.90)
  - MUCH more... in general better consider this to be a new
    project, although at the core of it quite some parts of the old
    implementation and overall structure are still there

### Bug Fixes

- avoid potential polynomial RegExp execution in type-parser ([#439](https://github.com/SAP/ui5-typescript/issues/439)) ([2e03607](https://github.com/SAP/ui5-typescript/commit/2e036073a0ab452f20297ab3646fe9493c83cca0))

### BREAKING CHANGES

- The API and behavior and generation results of the
  dts-generator have completely changed (See above). To migrate, basically re-write
  the usage of it.

## [2.3.2](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@2.3.1...@ui5/dts-generator@2.3.2) (2022-11-15)

**Note:** Version bump only for package @ui5/dts-generator

## [2.3.1](https://github.com/SAP/ui5-typescript/compare/@ui5/dts-generator@2.3.0...@ui5/dts-generator@2.3.1) (2022-01-18)

### Bug Fixes

- update project dependencies and fix tests ([#313](https://github.com/SAP/ui5-typescript/issues/313)) ([62626f4](https://github.com/SAP/ui5-typescript/commit/62626f4069d0fa701528d84ae431ccc2a4b69933))

# [2.3.0](https://github.com/SAP/ui5-typescript/compare/v2.2.1...v2.3.0) (2021-07-14)

### Features

- enable use for custom namespaces ([#272](https://github.com/SAP/ui5-typescript/issues/272)) ([874111d](https://github.com/SAP/ui5-typescript/commit/874111d68b3255f794a280bc28ac3ad231ceb6b6))

## [2.2.1](https://github.com/SAP/ui5-typescript/compare/v2.2.0...v2.2.1) (2021-04-22)

### Bug Fixes

- enable auto-complete for methods overriding ([#245](https://github.com/SAP/ui5-typescript/issues/245)) ([f5d9474](https://github.com/SAP/ui5-typescript/commit/f5d947489fcbc820cdb03a019f188c41413a5429))

# [2.2.0](https://github.com/SAP/ui5-typescript/compare/v2.1.0...v2.2.0) (2021-02-16)

### Features

- export replacement interfaces for module declaration ([#222](https://github.com/SAP/ui5-typescript/issues/222)) ([1a5dc02](https://github.com/SAP/ui5-typescript/commit/1a5dc02adfd0dc44f4c3fd53bcd371079cb20bfd))

# [2.1.0](https://github.com/SAP/ui5-typescript/compare/v2.0.6...v2.1.0) (2021-01-28)

### Features

- align set of allowedProperties with newer UI5 versions ([#218](https://github.com/SAP/ui5-typescript/issues/218)) ([e28646b](https://github.com/SAP/ui5-typescript/commit/e28646b8ac5734f886351074f41e7b100ac5f66f))
- Support UI5 interfaces extending classes or other interfaces ([#217](https://github.com/SAP/ui5-typescript/issues/217)) ([503fa56](https://github.com/SAP/ui5-typescript/commit/503fa56b37a8a350074fba1956e8786ae4976ae1))

## [2.0.6](https://github.com/SAP/ui5-typescript/compare/v2.0.5...v2.0.6) (2020-12-22)

### Bug Fixes

- namespaces may be **both** types and runtime structure ([#208](https://github.com/SAP/ui5-typescript/issues/208)) ([6d7480e](https://github.com/SAP/ui5-typescript/commit/6d7480e5db40450acba3867716cad545c1929394)), closes [#51](https://github.com/SAP/ui5-typescript/issues/51)

## [2.0.5](https://github.com/SAP/ui5-typescript/compare/v2.0.4...v2.0.5) (2020-11-25)

### Bug Fixes

- oClassInfo in extend method is incomplete ([#194](https://github.com/SAP/ui5-typescript/issues/194)) ([7064812](https://github.com/SAP/ui5-typescript/commit/70648125bcb46584cc11a715c53060649d9105a2))

## [2.0.4](https://github.com/SAP/ui5-typescript/compare/v2.0.3...v2.0.4) (2020-09-08)

### Bug Fixes

- missing prettier dependency. ([24e0afc](https://github.com/SAP/ui5-typescript/commit/24e0afca1aab9a52b372a966751caa3d28bcf213))

## [2.0.3](https://github.com/SAP/ui5-typescript/compare/v2.0.2...v2.0.3) (2020-09-07)

### Bug Fixes

- missing lib folder in published package ([a708ab4](https://github.com/SAP/ui5-typescript/commit/a708ab47cc30eb205e5d50e46e821fb31709c123))

## [2.0.2](https://github.com/SAP/ui5-typescript/compare/v2.0.1...v2.0.2) (2020-09-01)

### Bug Fixes

- incorrect "this" type inside `oClassInfo` parameter of `extend` method ([#171](https://github.com/SAP/ui5-typescript/issues/171)) ([1290e60](https://github.com/SAP/ui5-typescript/commit/1290e60a8b9d5b83d471bdbce1337d4d7339ac40))

## [2.0.1](https://github.com/SAP/ui5-typescript/compare/v2.0.0...v2.0.1) (2020-05-21)

### Bug Fixes

- **dts-generator:** directive to ignore api.json symbols by fqn. ([f328662](https://github.com/SAP/ui5-typescript/commit/f3286622c274b01dd6a3194ebd8d0f827792ddb1))

# [2.0.0](https://github.com/SAP/ui5-typescript/compare/v1.60.5...v2.0.0) (2020-05-13)

### Features

- better naming for mSetting interfaces ([8a3091d](https://github.com/SAP/ui5-typescript/commit/8a3091da7535240f96996f47a0aa80821d1f2c68))
- support skipping of UI5 symbols by FQN. ([758b0b0](https://github.com/SAP/ui5-typescript/commit/758b0b044b198b1f1ce6a85ef681f14343277fc5))

## [1.60.5](https://github.com/SAP/ui5-typescript/compare/v1.60.4...v1.60.5) (2019-11-25)

## [1.60.4](https://github.com/SAP/ui5-typescript/compare/v1.60.3...v1.60.4) (2019-11-19)

## [1.60.3](https://github.com/SAP/ui5-typescript/compare/v1.60.2...v1.60.3) (2019-09-10)

## [1.60.2](https://github.com/SAP/ui5-typescript/compare/v1.60.1...v1.60.2) (2019-07-22)

## [1.60.1](https://github.com/SAP/ui5-typescript/compare/v1.60.0...v1.60.1) (2019-07-17)

# [1.60.0](https://github.com/SAP/ui5-typescript/compare/v1.65.1...v1.60.0) (2019-07-15)

### Features

- Ignore restricted interfaces ([#29](https://github.com/SAP/ui5-typescript/issues/29)) ([6ba301d](https://github.com/SAP/ui5-typescript/commit/6ba301d7f1a218d2ab9ea1c3481dcdae0a3dd14a))

# [1.65.0](https://github.com/SAP/ui5-typescript/compare/v1.64.1...v1.65.0) (2019-05-09)
