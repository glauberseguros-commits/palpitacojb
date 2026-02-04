"use strict";

/**
 * ENV loader (.env.local) — sem dotenv
 */
const fs = require("fs");
const path = require("path");

function parseEnvValue(val) {
  let v = String(val ?? "").trim();

  // remove aspas se vier "3333" ou '3333'
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }

  // remove comentários inline: KEY=val # comment
  // (apenas se houver espaço antes do #)
  v = v.replace(/\s+#.*$/, "").trim();

  return v;
}

(function loadEnvLocal() {
  try {
    const envPath = path.join(__dirname, ".env.local");
    if (!fs.existsSync(envPath)) return;

    let raw = fs.readFileSync(envPath, "utf8");
    raw = raw.replace(/^\uFEFF/, "");

    raw.split(/\r?\n/).forEach((line) => {
      let s = String(line || "").trim();
      if (!s || s.startsWith("#")) return;

      if (/^export\s+/i.test(s)) {
        s = s.replace(/^export\s+/i, "").trim();
      }

      const i = s.indexOf("=");
      if (i <= 0) return;

      const key = s.slice(0, i).trim();
      const val = parseEnvValue(s.slice(i + 1));

      if (!process.env[key]) {
        process.env[key] = val;
      }
    });

    console.log("[ENV] .env.local carregado");
  } catch (e) {
    console.warn("[ENV] Falha ao carregar .env.local:", e.message);
  }
})();

const express = require("express");
const app = express();

/**
 * Config
 */
function parsePort(raw, fallback) {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;

  // aceita "3333" e 3333
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;

  // portas válidas 1..65535 (0 é "random port", não queremos aqui)
  if (n < 1 || n > 65535) return fallback;

  return n;
}

const PORT = parsePort(process.env.PORT, 3333);

// opcional: bind explícito (recomendado p/ evitar IPv6/localhost estranho)
const HOST = (process.env.HOST || "127.0.0.1").trim();

/**
 * JSON + URLENCODED
 */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

/**
 * CORS simples (sem libs)
 * - Ajuste ALLOWED_ORIGINS se quiser travar em produção
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Se quiser travar: defina ALLOWED_ORIGINS="http://localhost:3000,https://seu-dominio"
  const allowed = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Só setar Allow-Origin se houver origin (evita header inválido)
  if (origin) {
    if (!allowed.length) {
      // modo dev: libera origem que vier
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/**
 * Firebase Admin init (centralizado)
 * Usa service/firebaseAdmin.js (CommonJS) com ADC.
 */
const { initAdmin } = require("./service/firebaseAdmin");

(function bootAdmin() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
  if (!credPath) {
    console.warn(
      "[WARN] GOOGLE_APPLICATION_CREDENTIALS não definido. Admin SDK pode falhar."
    );
  } else {
    console.log("[INFO] GOOGLE_APPLICATION_CREDENTIALS:", credPath);
  }

  try {
    initAdmin();
    console.log("[OK] Firebase Admin inicializado (applicationDefault).");
  } catch (e) {
    console.error("[ERR] Falha ao inicializar Firebase Admin:", e);
  }
})();

/**
 * Utils
 */
function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || ""));
}

/**
 * Healthcheck
 */
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "palpitaco-backend",
    ts: new Date().toISOString(),
    host: HOST,
    port: PORT,
    pid: process.pid,
  });
});

/**
 * Routes existentes
 */
const pitacoResults = require("./routes/pitacoResults");
const kingDraws = require("./routes/kingDraws");
const receiveResults = require("./routes/receiveResults");

app.use("/api/pitaco", pitacoResults);
app.use("/api/king", kingDraws);
app.use("/api", receiveResults);

/**
 * IMPORT (Opção A)
 * - manual: importa uma data (e opcionalmente um close_hour)
 * - window: percorre horários e para quando capturar (gravou >= 1 draw)
 */
const { runImport } = require("./scripts/importKingApostas");

/**
 * GET /api/import/manual?date=YYYY-MM-DD&lottery=PT_RIO&close=HH:MM
 * - close é opcional
 */
app.get("/api/import/manual", async (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    const lotteryKey = String(req.query.lottery || "PT_RIO").trim();
    const closeHour = req.query.close ? String(req.query.close).trim() : null;

    if (!isISODate(date)) {
      return res
        .status(400)
        .json({ ok: false, error: "date inválido (use YYYY-MM-DD)" });
    }
    if (closeHour && !isHHMM(closeHour)) {
      return res
        .status(400)
        .json({ ok: false, error: "close inválido (use HH:MM)" });
    }

    const result = await runImport({
      date,
      lotteryKey,
      closeHour: closeHour || null,
    });

    return res.json({ ok: true, mode: "manual", ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "erro" });
  }
});

/**
 * GET /api/import/window?date=YYYY-MM-DD&lottery=PT_RIO&hours=09:09,11:09,14:09,16:09&stop=1
 */
app.get("/api/import/window", async (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    const lotteryKey = String(req.query.lottery || "PT_RIO").trim();

    if (!isISODate(date)) {
      return res
        .status(400)
        .json({ ok: false, error: "date inválido (use YYYY-MM-DD)" });
    }

    const stop = String(req.query.stop ?? "1").trim() !== "0";

    const hoursCsv = String(req.query.hours || "").trim();
    const defaultHours = ["09:09", "11:09", "14:09", "16:09", "18:09", "21:09"];

    const hours = (hoursCsv ? hoursCsv.split(",") : defaultHours)
      .map((s) => String(s || "").trim())
      .filter(Boolean);

    for (const h of hours) {
      if (!isHHMM(h)) {
        return res
          .status(400)
          .json({ ok: false, error: `hours inválido: ${h} (use HH:MM)` });
      }
    }

    const startedAt = Date.now();
    const results = [];
    let capturedAt = null;

    for (const h of hours) {
      const r = await runImport({ date, lotteryKey, closeHour: h });

      results.push({
        hour: h,
        captured: !!r.captured,
        totalDrawsSaved: r.totalDrawsSaved,
        totalPrizesSaved: r.totalPrizesSaved,
        skippedEmpty: r.skippedEmpty,
        skippedInvalid: r.skippedInvalid,
        skippedCloseHour: r.skippedCloseHour,
        tookMs: r.tookMs,
      });

      if (r.captured && !capturedAt) {
        capturedAt = h;
        if (stop) break;
      }
    }

    const tookMs = Date.now() - startedAt;

    return res.json({
      ok: true,
      mode: "window",
      lotteryKey,
      date,
      stopOnCapture: stop,
      hours,
      capturedAt,
      tookMs,
      results,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "erro" });
  }
});

/**
 * 404
 */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found", path: req.path });
});

/**
 * Error handler (último middleware)
 */
app.use((err, req, res, next) => {
  console.error("[ERR] Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    ok: false,
    error: "internal_error",
    message: err?.message || "erro",
  });
});

/**
 * Process-level safety nets
 */
process.on("unhandledRejection", (reason) => {
  console.error("[ERR] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[ERR] uncaughtException:", err);
});

/**
 * Start (robusto)
 */
const server = app.listen(PORT, HOST);

server.on("listening", () => {
  const addr = server.address();
  console.log("[START] palpitaco-backend listening:", addr);
  console.log(`[START] health: http://${HOST}:${PORT}/health`);
});

// se algum módulo fizer unref() no server, isso força manter o loop vivo
if (typeof server.ref === "function") {
  server.ref();
}

server.on("error", (e) => {
  console.error("[ERR] server error:", e);
});

server.on("close", () => {
  console.warn("[WARN] server close fired");
});

// opcional: loga se algo está encerrando o processo
process.on("beforeExit", (code) => {
  console.warn("[WARN] beforeExit code=", code);
});
process.on("exit", (code) => {
  console.warn("[WARN] exit code=", code);
});

