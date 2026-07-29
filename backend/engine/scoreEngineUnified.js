"use strict";

const path = require("path");

const TRANSPILE_ROOTS = [
  path.resolve(
    __dirname,
    "../../src/pages/Top3"
  ),

  path.resolve(
    __dirname,
    "../../src/shared/predictiveMilharEngine"
  ),

  path.resolve(
    __dirname,
    "../../src/pages/Centenas/modules"
  ),
];

let publicApi = null;

function isInsideTranspileRoots(filename) {
  const absolute = path.resolve(filename);

  return TRANSPILE_ROOTS.some(
    (root) =>
      absolute === root ||
      absolute.startsWith(`${root}${path.sep}`)
  );
}

/**
 * Carrega o núcleo ESM do TOP3 dentro do backend CommonJS.
 *
 * A transformação é limitada aos módulos efetivamente utilizados
 * pela cadeia pública do TOP3:
 *
 * - src/pages/Top3;
 * - src/shared/predictiveMilharEngine;
 * - src/pages/Centenas/modules.
 *
 * Nenhum componente React, Firebase ou restante do frontend
 * é processado por este carregador.
 */
function loadTop3PublicApi() {
  if (publicApi) {
    return publicApi;
  }

  require("@babel/register")({
    babelrc: false,
    configFile: false,
    cache: true,
    extensions: [".js"],
    only: [
      isInsideTranspileRoots,
    ],
    plugins: [
      require.resolve(
        "@babel/plugin-transform-modules-commonjs"
      ),
    ],
  });

  publicApi = require(
    "../../src/pages/Top3/top3.public-api.js"
  );

  return publicApi;
}

function assertFunction(api, name) {
  if (!api || typeof api[name] !== "function") {
    throw new Error(
      `Função pública TOP3 indisponível: ${name}`
    );
  }

  return api[name];
}

function getTop3Capabilities() {
  const api = loadTop3PublicApi();

  return Object.keys(api)
    .filter((name) => typeof api[name] === "function")
    .sort();
}

function computeConditionalNextTop3(input = {}) {
  const api = loadTop3PublicApi();

  return assertFunction(
    api,
    "computeConditionalNextTop3"
  )(input);
}

function computeConditionalNextTop3V2(input = {}) {
  const api = loadTop3PublicApi();

  return assertFunction(
    api,
    "computeConditionalNextTop3V2"
  )(input);
}

function computeStatisticalTop3V3(input = {}) {
  const api = loadTop3PublicApi();

  return assertFunction(
    api,
    "computeStatisticalTop3V3"
  )(input);
}

module.exports = {
  loadTop3PublicApi,
  getTop3Capabilities,
  computeConditionalNextTop3,
  computeConditionalNextTop3V2,
  computeStatisticalTop3V3,
};
