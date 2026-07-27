"use strict";

/**
 * Modelo central do Score Engine.
 * Ainda não calcula nada. Só padroniza o formato das previsões.
 */

function normalizeLotteryKey(value) {
  const s = String(value || "").trim().toUpperCase();
  if (s === "RJ" || s === "RIO" || s === "PT-RIO" || s === "PT_RIO") return "PT_RIO";
  if (s === "FED" || s === "FEDERAL") return "FEDERAL";
  return s || "PT_RIO";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function makePredictionRunId({ lotteryKey, date, closeHour, source = "manual" }) {
  const lk = normalizeLotteryKey(lotteryKey);
  const d = String(date || "").trim();
  const h = String(closeHour || "").trim().replace(":", "");
  const src = String(source || "manual").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");

  return `${lk}__${d}__${h || "NA"}__${src}`;
}

function buildPredictionRun({
  lotteryKey,
  date,
  closeHour,
  source = "manual",
  algorithm = "score_engine_v1",
  status = "generated",
  metadata = {},
} = {}) {
  const lk = normalizeLotteryKey(lotteryKey);

  return {
    id: makePredictionRunId({ lotteryKey: lk, date, closeHour, source }),
    lottery_key: lk,
    date: String(date || "").trim(),
    ymd: String(date || "").trim(),
    close_hour: String(closeHour || "").trim() || null,
    source,
    algorithm,
    status,
    metadata,
    createdAt: null,
    updatedAt: null,
  };
}

function buildPrediction({
  runId,
  type = "grupo",
  grupo,
  animal,
  dezena = null,
  centena = null,
  milhar = null,
  score = 0,
  confidence = 0,
  reasons = [],
  signals = {},
} = {}) {
  const g = Number(grupo);
  const grupo2 = Number.isFinite(g) ? pad2(g) : null;

  return {
    runId,
    type,
    grupo: grupo2,
    animal: animal || null,
    dezena,
    centena,
    milhar,
    score: Number(score) || 0,
    confidence: Number(confidence) || 0,
    reasons: Array.isArray(reasons) ? reasons : [],
    signals: signals && typeof signals === "object" ? signals : {},
    status: "pending",
    result: null,
    createdAt: null,
    updatedAt: null,
  };
}

module.exports = {
  normalizeLotteryKey,
  makePredictionRunId,
  buildPredictionRun,
  buildPrediction,
};
