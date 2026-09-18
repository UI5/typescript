# Contribution Guide

This is the common top-level contribution guide for the [UI5/typescript](https://github.com/UI5/typescript) monorepo. A sub-package **may** have an additional CONTRIBUTING.md file if needed.

Thanks for your interest in contributing! All forms of contribution are welcome — bug reports, fixes, documentation, new features, and reviewing other contributors' PRs.

## Legal

All contributors must sign the DCO

- https://cla-assistant.io/SAP-samples/ecmascript-monorepo-template

This is managed automatically via https://cla-assistant.io/ pull request voter.

### Contributing with AI-generated code

As artificial intelligence evolves, AI-generated code is becoming valuable for many software projects, including open-source initiatives. While we recognize the potential benefits of incorporating AI-generated content into our open-source projects there are certain requirements that need to be reflected and adhered to when making contributions.

Please see our [guideline for AI-generated code contributions to SAP Open Source Software Projects](https://github.com/UI5/.github/blob/main/CONTRIBUTING_USING_GENAI.md) for these requirements.

## Reporting Issues

Open a [GitHub issue](https://github.com/UI5/typescript/issues) on the topic that fits your case best:

- For `@ui5/dts-generator` — issues with the **generation logic** itself. Issues in the generated UI5 type definitions usually originate from JSDoc comments in [OpenUI5](https://github.com/UI5/openui5/issues) / SAPUI5 — please open the ticket there in that case.
- For `@ui5/ts-interface-generator` — anything related to control-interface generation for TypeScript controls.

A reproducible example (a minimal repo or a [TypeScript Hello World](https://github.com/SAP-samples/ui5-typescript-helloworld) fork) is the single biggest thing that helps get an issue triaged quickly.

## Development Environment

### Pre-requisites

- A current [Long-Term Support version](https://nodejs.org/en/about/releases/) of Node.js (>= 22; CI tests on 22.x and 24.x). npm ships with Node.js — no separate package-manager install is required.
- (optional) [commitizen](https://github.com/commitizen/cz-cli#installing-the-command-line-tool) for managing commit messages.

### Initial Setup

The initial setup is trivial:

- clone this repo
- `npm install`

The repo's `.npmrc` enforces exact-version saves (`save-exact=true`), a pinned registry, blocked git dependencies (`allow-git=none`), and a 7-day minimum release age — that's intentional supply-chain hardening, please don't loosen it without discussion.

### Repository Layout

```text
packages/                      # public, published to npm
  dts-generator/               # @ui5/dts-generator
  ts-interface-generator/      # @ui5/ts-interface-generator
test-packages/                 # private, never published
  openui5-snapshot-test/
  typed-json-model/
demos/                         # private, never published
```

Only the two `packages/*` are released to npm. Everything under `test-packages/*` and `demos/*` is `"private": true` and is automatically ignored by Changesets.

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

Use the package directory name as the **scope** when the change is package-specific:

```text
feat(dts-generator): support union types in api.json
fix(ts-interface-generator): handle aggregations with cardinality 0..1
chore: bump root devDependencies
```

The scope is also what `npm run changeset:auto` uses to figure out which packages to bump (see [Releases](#release-process) below). Breaking changes are signalled with a `!` after the type/scope **or** a `BREAKING CHANGE:` footer in the body — either flips the bump to `major`.

### Formatting

[Prettier](https://prettier.io/) is used to ensure consistent code formatting in this repository.
This is normally transparent as it automatically activated in a pre-commit hook using [lint-staged](https://github.com/okonet/lint-staged).
However, this does mean that dev flows that do not use a full dev env (e.g editing directly on github) may result in voter failures due to formatting errors.

To run it manually:

```sh
npm run format:fix          # rewrite files
npm run format:validate     # check, no rewrite (this is what CI runs)
```

### Compiling

See the respective sub-packages for instructions (if needed at all).

To build both publishable packages from the root:

```sh
npm run build
```

Per-package work uses npm's workspace shorthand:

```sh
npm run -w @ui5/dts-generator build
npm run -w @ui5/ts-interface-generator test
```

### Testing

[Mocha][mocha] and [Chai][chai] are used for unit-testing.

[mocha]: https://mochajs.org/
[chai]: https://www.chaijs.com

- To run the tests, execute `npm test` in a specific sub-package.
  - Note that not all sub-packages contain tests.

When adding a feature or fixing a bug, **please add or extend a test**. PRs without tests will get a friendly nudge.

### Full Build

To run the full **C**ontinuous **I**ntegration build run `npm run ci` in either the top-level package or a specific subpackage.

## Pull Requests

1. Fork the repo (or branch from `main` if you have write access).
2. Create a topic branch with a descriptive name (`feat/union-types`, `fix/aggregation-cardinality`).
3. Make your change, with tests, in commits that each follow the conventional-commits format.
4. Add a changeset (see [Release Process](#release-process) below) — required for any change that should produce a new release.
5. Push and open a PR against `main`.
6. The CI workflows ([`Continuous Integration`](.github/workflows/ci.yml), [`Lint Commit Messages`](.github/workflows/commitlint.yml), [`CodeQL`](.github/workflows/codeql-analysis.yml)) must all pass.

Reviews aim for two pairs of eyes on substantive changes; small fixes and chore commits may be merged with a single approval.

## Release Life-Cycle

This monorepo uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing. Each public package under `packages/*` keeps its own version (independent versioning) and its own `CHANGELOG.md`. Private packages under `test-packages/*` and `demos/*` are never released.

## Release Process

The release flow is fully automated through [GitHub Actions](.github/workflows/release.yml) — there's no local `lerna`, and no contributor needs npm-publish or push-to-`main` rights.

### For contributors — adding a changeset

When your PR changes one or more public packages, add a changeset alongside your code change. Pick whichever of the three commands fits best:

| Command                   | When to use                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run changeset:auto`  | **Recommended for most PRs.** Walks the conventional-commit history on your branch and writes one `.changeset/auto-<sha>.md` per qualifying commit (packages from the commit `scope`, bump from the `type`, summary from the `subject`). Idempotent — safe to re-run. Already-covered commits are skipped, so any hand-written changeset always wins. |
| `npm run changeset`       | Interactive — pick packages, bump type, and write a summary by hand. Use when the auto-derived bump or summary is wrong (e.g. a `chore:` commit that secretly contains a `feat:`). The next `:auto` run will then skip the commit because it's covered.                                                                                               |
| `npm run changeset:empty` | Docs- or tooling-only PRs that touch no public package. Writes an empty `.changeset/*.md` so the "no changeset detected" hint goes away without producing any CHANGELOG entry.                                                                                                                                                                        |

Whichever you pick, **commit the resulting `.changeset/*.md` file alongside your code change**.

How `npm run changeset:auto` chooses the bump:

| Conventional-commit `type` (or marker)                     | Bump    |
| ---------------------------------------------------------- | ------- |
| `feat:`                                                    | `minor` |
| `fix:`, `perf:`, `refactor:`, `chore:`, `build:`, `style:` | `patch` |
| `docs(<scope>):` (only when scoped to a package)           | `patch` |
| `<type>!:` or a `BREAKING CHANGE:` footer                  | `major` |
| `ci:`, anything scoped `release`                           | skipped |

Commits whose only file changes are under `packages/<pkg>/test/` are also skipped — test-only changes don't ship in the published tarball.

If a change does not warrant a release at all (CI tweaks, internal tooling, etc.) run `npm run changeset:empty` and commit the generated file — it satisfies the required changeset check without producing any package release.

### For maintainers — cutting a release

The release itself happens entirely on GitHub. You don't need npm credentials or a clean local checkout.

1. When a PR with at least one changeset is merged into `main`, the [`Release`](.github/workflows/release.yml) workflow opens (or updates) a single **`Version Packages`** PR. That PR aggregates every pending changeset, bumps the affected `package.json` versions, regenerates each package's `CHANGELOG.md`, and refreshes `package-lock.json`.
2. Review and merge that **`Version Packages`** PR when you're ready to cut a release.
3. Merging it triggers the same workflow again, this time on the `publish` path: `changeset publish` runs, the new versions go to npm (with [npm provenance](https://docs.npmjs.com/generating-provenance-statements)), and matching git tags are pushed.
4. Spot-check the newly published artifacts on [npmjs.com](https://www.npmjs.com/package/@ui5/dts-generator).

You can also trigger the workflow manually via **Actions → Release → Run workflow** — useful if a previous run failed mid-publish. Re-running publishes whatever versions are currently on `main` that haven't been released yet (`changeset publish` is idempotent — it skips versions already on the registry).

#### npm authentication

The workflow prefers npm OIDC trusted publishing (no token required). If OIDC isn't configured for a package, it falls back to `secrets.NPM_BOOTSTRAP_TOKEN`. The "Detect token usage" step in the workflow prints which path is active.

#### Pre-releases / snapshots

Not currently configured. If we need them, [`changeset pre enter <tag>`](https://github.com/changesets/changesets/blob/main/docs/prereleases.md) is the standard mechanism — open an issue first to discuss the tag scheme.

## Upgrading the version of the dependencies

To upgrade the version of the dependencies, [`npm-check-updates`](https://github.com/raineorshine/npm-check-updates) is wired up at the root:

```sh
npm run ncu          # list outdated packages across the workspace
npm run ncu-u        # apply the bumps to every package.json
npm install          # refresh package-lock.json
npm run ci           # sanity-check before opening the PR
```

## Where to ask questions

- For UI5 + TypeScript usage questions, the [ui5.github.io/typescript](https://ui5.github.io/typescript) docs are the best starting point.
- For sample applications, see the [TypeScript Hello World app](https://github.com/SAP-samples/ui5-typescript-helloworld) and the [TypeScript branch of the UI5 CAP Event App](https://github.com/SAP-samples/ui5-cap-event-app/tree/typescript).
- For tooling-specific bugs, please open an [issue](https://github.com/UI5/typescript/issues).
