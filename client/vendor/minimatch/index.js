"use strict";

const modern = require("./dist/commonjs/index.js");
const callable = modern.minimatch;

for (const key of Object.keys(modern)) {
  callable[key] = modern[key];
}

callable.default = callable;

module.exports = callable;
