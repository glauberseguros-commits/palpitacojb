"use strict";

const fs = require("fs");

const {
  computeStatisticalTop3V4Experimental,
} = require("../backend/engine/scoreEngineV4Experimental");

const input = {};

let result;

try {
  result = computeStatisticalTop3V4Experimental(input);
} catch (err) {
  result = {
    error: err.message,
    stack: err.stack,
  };
}

const report = {
  inputKeys: Object.keys(input),
  resultKeys: result && typeof result === "object"
    ? Object.keys(result)
    : [],
  experimental: result?.experimental ?? null,
};

fs.writeFileSync(
  "tmp/v4_input_audit.txt",
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log(JSON.stringify(report, null, 2));
