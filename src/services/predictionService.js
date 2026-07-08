import api from "./api";

/**
 * Executa uma previsão utilizando o Score Engine do backend.
 */
export async function runPrediction(payload = {}) {

  const { data } = await api.post(
    "/predictions/run",
    payload
  );

  return data;
}
