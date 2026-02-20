"use strict";

/* =========================
   LOTTERY KEY NORMALIZATION
========================= */

function normalizeLotteryKey(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === "RJ") return "PT_RIO";
  if (s === "RIO") return "PT_RIO";
  if (s === "PT-RIO") return "PT_RIO";
  return s || "PT_RIO";
}

function getLotteryFromReq(req, fallback = "PT_RIO") {
  return normalizeLotteryKey(
    req?.query?.lotteryKey || req?.query?.lottery || req?.query?.uf || fallback
  );
}

/* =========================
   ENV loader (.env.local) — sem dotenv
========================= */

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

      if (!process.env[key]) process.env[key] = val;
    });

    console.log("[ENV] .env.local carregado");
  } catch (e) {
    console.warn("[ENV] Falha ao carregar .env.local:", e?.message || e);
  }
})();

/* =========================
   APP
========================= */

const express = require("express");
const app = express();

/* =========================
   CONFIG
========================= */

function parsePort(raw, fallback) {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;

  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;

  if (n < 1 || n > 65535) return fallback;
  return n;
}

const PORT = parsePort(process.env.PORT, 3333);

const HOST = (
  process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1")
).trim();

/* =========================
   BODY
========================= */

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

/* =========================
   CORS (DEV + PROD) — sem libs
========================= */

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Sem Origin: curl/postman/SSR. Não inventa credenciais.
  if (!origin) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return req.method === "OPTIONS" ? res.sendStatus(204) : next();
  }

  let ok = false;

  try {
    const u = new URL(origin);
    const h = String(u.hostname || "").toLowerCase();

    const isLocalhost = h === "localhost" || h === "127.0.0.1" || h === "::1";

    const isLan =
      /^(\d{1,3}\.){3}\d{1,3}$/.test(h) &&
      (h.startsWith("192.168.") ||
        h.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(h));

    const isProd = h === "palpitacojb.com.br" || h.endsWith(".palpitacojb.com.br");

    ok = isLocalhost || isLan || isProd;
  } catch {
    ok = false;
  }

  if (!ok) {
    return res.status(403).json({ ok: false, error: "cors_blocked", origin });
  }

  // ✅ ecoa origin (obrigatório com credentials)
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* =========================
   NO-CACHE
========================= */

app.use("/api", (req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

app.use("/health", (req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

/* =========================
   Firebase Admin init
========================= */

const { initAdmin } = require("./service/firebaseAdmin");

(function bootAdmin() {
  try {
    const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (json && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const tmp = path.join(__dirname, ".gcp_sa.json");
      fs.writeFileSync(tmp, json, "utf8");
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmp;
      console.log("[INFO] Service Account JSON gravado em:", tmp);
    }
  } catch (e) {
    console.warn("[WARN] Falha ao preparar cred JSON:", e?.message || e);
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
  if (!credPath) {
    console.warn("[WARN] GOOGLE_APPLICATION_CREDENTIALS não definido. Admin SDK pode falhar.");
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

/* =========================
   UTILS (datas/horas)
========================= */

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || ""));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function brTodayYmd() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value || "1970";
    const m = parts.find((p) => p.type === "month")?.value || "01";
    const d = parts.find((p) => p.type === "day")?.value || "01";
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function normalizeHourLike(value) {
  const s0 = String(value ?? "").trim();
  if (!s0) return "";

  const s = s0.replace(/\s+/g, "");

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) return `${pad2(mhx[1])}:00`;

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) return `${pad2(mISO[1])}:${pad2(mISO[2])}`;

  const mHm = s.match(/^(\d{3,4})$/);
  if (mHm) {
    const hh = String(mHm[1]).slice(0, -2);
    const mm = String(mHm[1]).slice(-2);
    if (/^\d{1,2}$/.test(hh) && /^\d{2}$/.test(mm)) {
      return `${pad2(hh)}:${mm}`;
    }
  }

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  return s0.trim();
}

function toHourBucket(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;

  const mh = s.match(/^(\d{1,2})h$/i);
  if (mh) return `${pad2(mh[1])}h`;

  const m1 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m1) return `${pad2(m1[1])}h`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}h`;

  const m3 = s.match(/^(\d{3,4})$/);
  if (m3) return `${pad2(String(m3[1]).slice(0, -2))}h`;

  return null;
}

function hourToNumSafe(hhmm) {
  const s = normalizeHourLike(hhmm);
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return Number.POSITIVE_INFINITY;
  return Number(m[1]) * 100 + Number(m[2]);
}

function ymdToUTCDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function addDaysUTC(ymd, days) {
  const dt = ymdToUTCDate(ymd);
  if (!dt) return ymd;
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function daysDiffUTC(fromYmd, toYmd) {
  const da = ymdToUTCDate(fromYmd);
  const db = ymdToUTCDate(toYmd);
  if (!da || !db) return NaN;
  const ms = db.getTime() - da.getTime();
  return Math.floor(ms / 86400000);
}

function isValidGrupo(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1 && v <= 25;
}

function pickPrizeGrupoFromAny(prizeLike) {
  const p = prizeLike || {};
  const raw =
    p.grupo ??
    p.group ??
    p.grupo2 ??
    p.group2 ??
    p.animal_grupo ??
    p.g ??
    p.grupo_animal ??
    p.grupoAnimal ??
    null;

  const s = safeStr(raw);
  if (!s) return null;
  const m = s.match(/(\d{1,2})/);
  const g = m ? Number(m[1]) : Number(s);
  return isValidGrupo(g) ? g : null;
}

function pickPrizePositionFromAny(prizeLike) {
  const p = prizeLike || {};
  const raw =
    p.position ??
    p.posicao ??
    p.pos ??
    p.colocacao ??
    p.place ??
    p.premio ??
    p.prize ??
    p.p ??
    null;

  const s = safeStr(raw);
  if (!s) return null;
  const m = s.match(/(\d{1,2})/);
  const pos = m ? Number(m[1]) : Number(s);
  return Number.isFinite(pos) ? pos : null;
}

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  const lk = getLotteryFromReq(req);
  res.json({
    ok: true,
    service: "palpitaco-backend",
    version: "PATCH_CLOSEHOUR_V1",
    ts: new Date().toISOString(),
    host: HOST,
    port: PORT,
    pid: process.pid,
    lotteryKey: lk,
  });
});

/* =========================
   ROUTES
========================= */

const pitacoResults = require("./routes/pitacoResults");
const kingDraws = require("./routes/kingDraws");
const receiveResults = require("./routes/receiveResults");
const bounds = require("./routes/bounds");

app.use("/api/pitaco", pitacoResults);
app.use("/api/king", kingDraws);
app.use("/api", receiveResults);
app.use("/api", bounds);
// ✅ alias compat: alguns pontos chamam /api/king/bounds (mantém /api/bounds intacto)
app.use("/api/king", bounds);

/* =========================================================
   ✅ /api/lates — ATRASADOS (server-side, Admin SDK)
========================================================= */

app.get("/api/lates", async (req, res) => {
  try {
    const admin = require("firebase-admin");
    const db = admin.firestore();

    const lottery = getLotteryFromReq(req);

    // regra RJ/PT_RIO (lock)
    const RJ_LOCK_LOTTERY_KEY = "PT_RIO";
    const RJ_LOCK_UF = "RJ";
    const targetLotteryKey = lottery === "RJ" ? RJ_LOCK_LOTTERY_KEY : lottery;

    const modality = safeStr(req.query.modality || "PT").toUpperCase();
    const prizeRaw = safeStr(req.query.prize || "1");
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const pageSize = Math.max(
      1,
      Math.min(100, Number(req.query.pageSize || 25) || 25)
    );

    const closeHour = safeStr(req.query.closeHour || "");
    const closeHourBucket = safeStr(req.query.closeHourBucket || req.query.hour || "");
    const hourBucket = toHourBucket(closeHourBucket || closeHour);

    const baseDateParam = safeStr(req.query.baseDate || req.query.date || "");
    const baseYmd = isISODate(baseDateParam) ? baseDateParam : "";

    const PROBE_LOOKBACK_DAYS = 60;
    const baseDateSource = baseYmd ? "param" : "brToday";
    const baseDateYmd = baseYmd || brTodayYmd();

    // positions
    let positions = [];
    if (prizeRaw === "1-5") positions = [1, 2, 3, 4, 5];
    else {
      const p = Number(prizeRaw);
      if (!Number.isFinite(p) || p < 1 || p > 10) {
        return res
          .status(400)
          .json({ ok: false, error: "prize inválido (use 1..5 ou 1-5)" });
      }
      positions = [p];
    }

    async function fetchDayDraws(dayYmd) {
      const snap = await db.collection("draws").where("ymd", "==", dayYmd).get();

      const draws = [];
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const ymd = safeStr(d.ymd || "");
        const close_hour = normalizeHourLike(
          d.close_hour ?? d.closeHour ?? d.hour ?? d.hora ?? ""
        );
        const uf = safeStr(d.uf || "").toUpperCase();
        const lottery_key = safeStr(
          d.lottery_key ?? d.lotteryKey ?? d.lottery ?? ""
        ).toUpperCase();
        const lottery_code = safeStr(
          d.lottery_code ??
            d.lotteryCode ??
            d.lot_code ??
            d.lotCode ??
            d.lot ??
            d.code ??
            ""
        ).toUpperCase();

        if (targetLotteryKey === RJ_LOCK_LOTTERY_KEY) {
          if (lottery_key && lottery_key !== RJ_LOCK_LOTTERY_KEY) return;
          if (uf && uf !== RJ_LOCK_UF) return;
        } else {
          if (lottery_key && lottery_key !== targetLotteryKey) return;
        }

        if (hourBucket) {
          if (toHourBucket(close_hour) !== hourBucket) return;
        }

        draws.push({
          id: doc.id,
          ymd,
          close_hour,
          uf,
          lottery_key,
          lottery_code: lottery_code || null,
          embeddedPrizes: Array.isArray(d.prizes) ? d.prizes : null,
        });
      });

      draws.sort((a, b) => hourToNumSafe(b.close_hour) - hourToNumSafe(a.close_hour));
      return draws;
    }

    async function findGrupoForDrawPosition(drawId, embeddedPrizes, posWanted) {
      if (Array.isArray(embeddedPrizes) && embeddedPrizes.length) {
        for (const p of embeddedPrizes) {
          const pos = pickPrizePositionFromAny(p);
          if (Number(pos) !== Number(posWanted)) continue;
          const g = pickPrizeGrupoFromAny(p);
          if (isValidGrupo(g)) return g;
        }
      }

      const snap = await db
        .collection("draws")
        .doc(String(drawId))
        .collection("prizes")
        .where("position", "==", Number(posWanted))
        .limit(5)
        .get();

      let bestG = null;
      snap.forEach((doc) => {
        if (bestG) return;
        const p = doc.data() || {};
        const g = pickPrizeGrupoFromAny(p);
        if (isValidGrupo(g)) bestG = g;
      });

      return bestG;
    }

    async function probeRecentMaxYmd(lookbackDays = 60) {
      const base = brTodayYmd();
      const n = Math.max(3, Math.min(180, Number(lookbackDays) || 60));

      for (let i = 0; i <= n; i += 1) {
        const day = addDaysUTC(base, -i);
        const draws = await fetchDayDraws(day);
        if (draws && draws.length) return day;
      }
      return "";
    }

    const scanStartYmd = baseYmd || (await probeRecentMaxYmd(PROBE_LOOKBACK_DAYS));

    if (!baseDateYmd) {
      return res.json({
        ok: true,
        lottery: lottery,
        modality,
        prize: prizeRaw,
        baseDate: "",
        hourBucket: hourBucket || null,
        page,
        pageSize,
        total: 25,
        rows: Array.from({ length: 25 }, (_, i) => ({
          pos: i + 1,
          grupo: i + 1,
          lastYmd: null,
          lastCloseHour: null,
          daysLate: null,
          lastDrawId: null,
          lastLottery: null,
        })),
        note: "Sem draws recentes no lookback. Informe baseDate=YYYY-MM-DD para forçar.",
      });
    }

    const lastSeen = new Map(); // grupo -> { ymd, closeHour, drawId, lottery_code }
    const MAX_LOOKBACK_DAYS = 370;
    let cursor = scanStartYmd;

    for (let iter = 0; iter < MAX_LOOKBACK_DAYS && lastSeen.size < 25; iter += 1) {
      const dayDraws = await fetchDayDraws(cursor);

      for (const d of dayDraws) {
        for (const posWanted of positions) {
          if (lastSeen.size >= 25) break;

          const g = await findGrupoForDrawPosition(d.id, d.embeddedPrizes, posWanted);
          if (!isValidGrupo(g)) continue;
          if (lastSeen.has(g)) continue;

          lastSeen.set(g, {
            ymd: cursor,
            closeHour: d.close_hour || "",
            drawId: d.id,
            lottery_code: d.lottery_code || null,
          });

          if (lastSeen.size >= 25) break;
        }
        if (lastSeen.size >= 25) break;
      }

      cursor = addDaysUTC(cursor, -1);
    }

    const rowsAll = [];
    for (let g = 1; g <= 25; g += 1) {
      const seen = lastSeen.get(g) || null;
      const lastYmd = seen?.ymd || null;
      const lastCloseHour = seen?.closeHour ? normalizeHourLike(seen.closeHour) : null;
      const diff = lastYmd ? daysDiffUTC(lastYmd, baseDateYmd) : NaN;
      const daysLate = lastYmd && Number.isFinite(diff) ? Math.max(0, diff) : null;

      rowsAll.push({
        pos: 0,
        grupo: g,
        lastYmd,
        lastCloseHour,
        daysLate,
        lastDrawId: seen?.drawId || null,
        lastLottery: seen?.lottery_code || null,
      });
    }

    const sorted = [...rowsAll].sort((a, b) => {
      const aa = Number.isFinite(Number(a?.daysLate)) ? Number(a.daysLate) : -1;
      const bb = Number.isFinite(Number(b?.daysLate)) ? Number(b.daysLate) : -1;
      if (bb !== aa) return bb - aa;

      const ha = hourToNumSafe(a?.lastCloseHour);
      const hb = hourToNumSafe(b?.lastCloseHour);
      if (ha !== hb) return ha - hb;

      return Number(a?.grupo || 0) - Number(b?.grupo || 0);
    });

    const ranked = sorted.map((r, idx) => ({ ...r, pos: idx + 1 }));

    const total = ranked.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paged = ranked.slice(start, end);

    return res.json({
      ok: true,
      lottery: targetLotteryKey,
      modality,
      prize: prizeRaw,
      baseDate: baseDateYmd,
      hourBucket: hourBucket || null,
      page,
      pageSize,
      total,
      rows: paged,
      baseDateSource,
      scanStartYmd,
      probeLookbackDays: PROBE_LOOKBACK_DAYS,
      meta: {
        foundGroups: lastSeen.size,
        maxLookbackDays: MAX_LOOKBACK_DAYS,
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: String(e?.message || e || "erro"),
    });
  }
});

/* =========================
   IMPORT
========================= */

const { runImport } = require("./scripts/importKingApostas");

app.get("/api/import/manual", async (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    const lk = getLotteryFromReq(req);

    // aceita: closeHour, close, hour
    const closeHourRaw =
      req.query.closeHour ??
      req.query.close ??
      req.query.hour ??
      null;

    const closeHour = closeHourRaw ? String(closeHourRaw).trim() : null;

    if (!isISODate(date)) {
      return res.status(400).json({ ok: false, error: "date inválido (use YYYY-MM-DD)" });
    }
    if (closeHour && !isHHMM(closeHour)) {
      return res.status(400).json({ ok: false, error: "close inválido (use HH:MM)" });
    }

    const result = await runImport({
      date,
      lotteryKey: lk,
      closeHour: closeHour || null,
    });

    return res.json({
      ok: true,
      mode: "manual",
      lotteryKey: lk,
      date,
      closeHour,
      ...result,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "erro" });
  }
});

app.get("/api/import/window", async (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    const lk = getLotteryFromReq(req);

    if (!isISODate(date)) {
      return res.status(400).json({ ok: false, error: "date inválido (use YYYY-MM-DD)" });
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
      const r = await runImport({ date, lotteryKey: lk, closeHour: h });

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
      lotteryKey: lk,
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

/* =========================
   404 + ERROR
========================= */

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found", path: req.path });
});

app.use((err, req, res, next) => {
  console.error("[ERR] Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    ok: false,
    error: "internal_error",
    message: err?.message || "erro",
  });
});

/* =========================
   PROCESS SAFETY NETS
========================= */

process.on("unhandledRejection", (reason) => {
  console.error("[ERR] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[ERR] uncaughtException:", err);
});

/* =========================
   START
========================= */

const server = app.listen(PORT, HOST);

server.on("listening", () => {
  const addr = server.address();
  console.log("[START] palpitaco-backend listening:", addr);
  console.log(`[START] health: http://${HOST}:${PORT}/health`);
});

if (typeof server.ref === "function") {
  server.ref();
}

server.on("error", (e) => {
  console.error("[ERR] server error:", e);
});

server.on("close", () => {
  console.warn("[WARN] server close fired");
});

process.on("beforeExit", (code) => {
  console.warn("[WARN] beforeExit code=", code);
});
process.on("exit", (code) => {
  console.warn("[WARN] exit code=", code);
});



