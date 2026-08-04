/*
 * TOP3_V7_18_LAYERS_FOUNDATION_V1
 *
 * Registro das implementações das camadas.
 *
 * Nesta fundação, nenhuma camada está conectada.
 */

import {
  TOP3_V7_LAYER_CATALOG,
  isTop3V7LayerKey,
} from "./top3.v7.catalog.js";

const implementations = new Map();

export function registerTop3V7Layer(
  layerKey,
  implementation
) {
  if (!isTop3V7LayerKey(layerKey)) {
    throw new Error(
      `Registro recusado para camada inválida: ${String(layerKey || "—")}`
    );
  }

  if (typeof implementation !== "function") {
    throw new TypeError(
      `Implementação da camada ${layerKey} deve ser uma função.`
    );
  }

  if (implementations.has(layerKey)) {
    throw new Error(
      `Camada V7 já registrada: ${layerKey}`
    );
  }

  implementations.set(
    layerKey,
    implementation
  );

  return implementation;
}

export function getTop3V7LayerImplementation(
  layerKey
) {
  return implementations.get(layerKey) || null;
}

export function hasTop3V7LayerImplementation(
  layerKey
) {
  return implementations.has(layerKey);
}

export function listTop3V7LayerRegistry() {
  return TOP3_V7_LAYER_CATALOG.map(
    (layer) => ({
      ...layer,
      implemented:
        implementations.has(layer.key),
    })
  );
}

export function clearTop3V7LayerRegistryForTests() {
  implementations.clear();
}

