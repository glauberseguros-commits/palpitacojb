"use strict";

const path = require("path");

const TOP3_ROOT = path.resolve(
  __dirname,
  "../../src/pages/Top3"
);

let publicApi = null;

/**
 * Carrega o núcleo ESM do TOP3 dentro do backend CommonJS.
 *
 * A transformação é limitada ao diretório do TOP3. Nenhum arquivo
 * de React, Firebase ou restante do frontend é processado.
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
      (filename) => {
        const absolute = path.resolve(filename);

        return (
          absolute === TOP3_ROOT ||
          absolute.startsWith(`${TOP3_ROOT}${path.sep}`)
        );
      },
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
