# Contribution Guide

This is the common top-level contribution guide for this monorepo.
A sub-package **may** have an additional CONTRIBUTING.md file if needed.

## Legal

All contributors must sign the DCO

- https://cla-assistant.io/SAP-samples/ecmascript-monorepo-template

This is managed automatically via https://cla-assistant.io/ pull request voter.

### Contributing with AI-generated code

As artificial intelligence evolves, AI-generated code is becoming valuable for many software projects, including open-source initiatives. While we recognize the potential benefits of incorporating AI-generated content into our open-source projects there are certain requirements that need to be reflected and adhered to when making contributions.

Please see our [guideline for AI-generated code contributions to SAP Open Source Software Projects](https://github.com/UI5/.github/blob/main/CONTRIBUTING_USING_GENAI.md) for these requirements.

## Development Environment

### pre-requisites

- [Yarn](https://yarnpkg.com/lang/en/docs/install/) >= 1.4.2
- A current [Long-Term Support version](https://nodejs.org/en/about/releases/) of node.js
- (optional) [commitizen](https://github.com/commitizen/cz-cli#installing-the-command-line-tool) for managing commit messages.

### Initial Setup

The initial setup is trivial:

- clone this repo
- `yarn`

### Commit Messages format

This project enforces the [conventional-commits][conventional_commits] commit message formats.
The possible commits types prefixes are limited to those defined by [conventional-commit-types][commit_types].
This promotes a clean project history and enabled automatically generating a changelog.

The commit message format will be inspected both on a git pre-commit hook
and during the central CI build and will **fail the build** if issues are found.

It is recommended to use `git cz` to construct valid conventional commit messages.

- requires [commitizen](https://github.com/commitizen/cz-cli#installing-the-command-line-tool) to be installed.

[commit_types]: https://github.com/commitizen/conventional-commit-types/blob/master/index.json
[conventional_commits]: https://www.conventionalcommits.org/en/v1.0.0/

### Formatting

[Prettier](https://prettier.io/) is used to ensure consistent code formatting in this repository.
This is normally transparent as it automatically activated in a pre-commit hook using [lint-staged](https://github.com/okonet/lint-staged).
However, this does mean that dev flows that do not use a full dev env (e.g editing directly on github) may result in voter failures due to formatting errors.

### Compiling

See the respective sub-packages for instructions (if needed at all).

### Testing

[Mocha][mocha] and [Chai][chai] are used for unit-testing.

[mocha]: https://mochajs.org/
[chai]: https://www.chaijs.com

- To run the tests, execute `yarn test` in a specific sub-package.
  - Note that not all sub-packages contain tests.

### Full Build

To run the full **C**ontinuous **I**ntegration build run `yarn ci` in either the top-level package or a specific subpackage.

### Release Life-Cycle

This monorepo uses Lerna's [Independent][lerna-mode] mode which allows subpackages to have different versions.

[lerna-mode]: https://github.com/lerna/lerna#independent-mode

### Release Process

Performing a release requires push permissions to the repository.

- Ensure you are on the default branch and synced with origin.
- `yarn run release:version`
- Follow the lerna CLI instructions.
- Track the newly pushed commit with the message `chore(release): publish` in the build system for a successful completion (the `Release` GitHub action must be triggered!).
- Inspect the newly published artifacts on npmjs.com.
