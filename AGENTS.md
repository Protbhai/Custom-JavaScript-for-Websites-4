# Agent guidelines for Custom-JavaScript-for-Websites-4

This repository contains a Chrome extension written in JavaScript/TypeScript.

## Required checks
- **Lint:** `yarn lint`
- **Build:** `yarn build`
- **Test:** `yarn test`

Run these in the repository root and ensure they pass before committing.

## Development notes
- The project follows the [Standard](https://standardjs.com/) style. Use Prettier and `yarn lint --fix` to format code.
- Build output is in the `build` directory. Load the extension from this folder when testing in Chrome.
- Integration tests live under `integration_test/` and can be run with `cd integration_test && yarn install && yarn test`, but the main test script (`yarn test`) already triggers them.

