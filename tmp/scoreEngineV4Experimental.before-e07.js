"use strict";

const {
  computeStatisticalTop3V3,
} = require("./scoreEngineUnified");

function collectExperimentalEvidence(drawsRange = []) {

  const groupFrequency = {};

  for (const draw of drawsRange) {

    if (!Array.isArray(draw?.prizes)) {
      continue;
    }

    const firstPrize =
      draw.prizes.find(
        (p) => Number(p.position) === 1
      );

    if (!firstPrize) {
      continue;
    }

    const group =
      String(firstPrize.grupo).padStart(2, "0");

    groupFrequency[group] =
      (groupFrequency[group] || 0) + 1;
  }

  return {
    enabled: true,
    version: 2,
    totalDraws: drawsRange.length,
    firstPrizeGroupFrequency: groupFrequency,
    notes: [
      "Experimental only",
      "No influence on ranking"
    ]
  };
}

function computeStatisticalTop3V4Experimental(input = {}) {

  const result =
    computeStatisticalTop3V3(input);

  result.experimental =
    collectExperimentalEvidence(
      input.drawsRange || []
    );

  return result;
}

module.exports = {
  computeStatisticalTop3V4Experimental,
};
