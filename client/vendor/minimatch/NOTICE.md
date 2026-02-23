This directory vendors compatibility code for the npm package `minimatch`.

Contents:
- `dist/commonjs/*`: copied from `minimatch@10.2.2`.
- `node_modules/brace-expansion/*` and `node_modules/balanced-match/*`: vendored runtime deps used by the copied build.
- `index.js`: OpenCom compatibility export so legacy CommonJS callers can invoke `require('minimatch')` as a function.

Licenses:
- minimatch: BlueOak-1.0.0
- brace-expansion: MIT
- balanced-match: MIT
