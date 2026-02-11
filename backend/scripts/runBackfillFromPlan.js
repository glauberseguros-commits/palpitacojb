"use strict";

const fs = require("fs");
const path = require("path");

// Reaproveita o MESMO import usado pelo autoImportToday
const { runImport } = require("./importKingApostas");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseArg(name) {
  const prefix = `--${name}=`;
  const a = process.argv.find((x) => String(x).startsWith(prefix));
  if (!a) return null;
  return String(a).slice(prefix.length);
}

function ts() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function isISODate(ymd) {
  return /^\d{4}-\d{2}-\d{2}$/.test(safeStr(ymd));
}

/**
 * baseMins="0,9" -> [0,9]
 */
function parseBaseMins(raw, fallback = [9]) {
  const s = String(raw || "").trim();
  if (!s) return fallback;
  const arr = s
    .split(",")
    .map((x) => Number(String(x || "").trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 59);
  return arr.length ? Array.from(new Set(arr)) : fallback;
}

/**
 * Normaliza hour vindo do plan:
 * aceita "09", "9", "09:00", 9, etc -> "HH"
 */
function normalizeHH(raw) {
  const s = safeStr(raw);
  if (!s) return null;
  const m = s.match(/(\d{1,2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
  return pad2(hh);
}

/**
 * Gera candidatos de close_hour:
 * - para cada baseMin (ex.: 0 e 9)
 * - aplica deltas de 0..tol (ex.: tol=2 => 0, +1, +2, -1, -2)
 * - mantém ordem: baseMin0 (0,+1,+2,-1,-2), depois baseMin9 (9,+1,+2,-1,-2)
 */
function closeCandidates(hh, baseMins = [9], tolMin = 2) {
  const h = Number(hh);
  const tol = Math.max(0, Number(tolMin) || 0);
  const deltas = [0];
  for (let i = 1; i <= tol; i++) deltas.push(+i);
  for (let i = 1; i <= tol; i++) deltas.push(-i);

  const out = [];
  for (const bm of baseMins) {
    const base = Number(bm);
    for (const d of deltas) {
      const mm = base + d;
      if (mm < 0 || mm > 59) continue;
      out.push(`${pad2(h)}:${pad2(mm)}`);
    }
  }
  return Array.from(new Set(out));
}

function envInt(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : def;
}

/**
 * Timeout por tentativa do runImport (evita travar num dia)
 * ENV: IMPORT_ATTEMPT_TIMEOUT_MS (default 60000)
 */
async function runImportWithTimeout(args) {
  const timeoutMs = envInt("IMPORT_ATTEMPT_TIMEOUT_MS", 60_000);
  return await Promise.race([
    runImport(args),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`runImport timeout após ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

function toAbsPlanPath(planPathArg) {
  const p = String(planPathArg || "").trim();
  if (!p) return "";
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

async function main() {
  const planPathArg = process.argv[2];
  if (!planPathArg) {
    throw new Error(
      "Uso: node backend/scripts/runBackfillFromPlan.js <backfillPlan.json> [--limitDays=5] [--baseMins=9] [--tolMin=2]"
    );
  }

  const limitDays = Math.max(1, Number(parseArg("limitDays") || 5));
  const baseMins = parseBaseMins(parseArg("baseMins"), [9]);
  const tolMin = Math.max(0, Number(parseArg("tolMin") || 2));

  const planPath = toAbsPlanPath(planPathArg);
  if (!fs.existsSync(planPath)) throw new Error(`Arquivo não encontrado: ${planPath}`);

  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const lottery = String(plan?.lottery || "PT_RIO").trim().toUpperCase();

  // ✅ Fonte preferencial: plan.backfillDays (já vem pronto do planBackfillFromAudit.js)
  const planBackfillDays = Array.isArray(plan?.backfillDays) ? plan.backfillDays : [];

  let backfillDays = planBackfillDays
    .map((d) => {
      const ymd = safeStr(d?.ymd);
      const missingHoursRaw = Array.isArray(d?.missingHours) ? d.missingHours : [];
      const missingHours = Array.from(
        new Set(
          missingHoursRaw
            .map((x) => normalizeHH(x))
            .filter((x) => typeof x === "string" && /^\d{2}$/.test(x))
        )
      ).sort();
      return { ymd, missingHours };
    })
    .filter((x) => isISODate(x.ymd) && x.missingHours.length);

  // ✅ Fallback compat: plan.rows com shouldBackfill + missingHard
  if (!backfillDays.length) {
    const rows = Array.isArray(plan?.rows) ? plan.rows : [];
    backfillDays = rows
      .filter((r) => r && r.shouldBackfill)
      .map((r) => {
        const ymd = safeStr(r.ymd);
        const missingHoursRaw = Array.isArray(r.missingHard) ? r.missingHard : [];
        const missingHours = Array.from(
          new Set(
            missingHoursRaw
              .map((x) => normalizeHH(x))
              .filter((x) => typeof x === "string" && /^\d{2}$/.test(x))
          )
        ).sort();
        return { ymd, missingHours };
      })
      .filter((x) => isISODate(x.ymd) && x.missingHours.length);
  }

  if (!backfillDays.length) {
    console.log("[BACKFILL] Nenhum dia para backfill.");
    return;
  }

  const runId = ts();
  const LOG_DIR = path.join(process.cwd(), "logs");
  ensureDir(LOG_DIR);

  const outFile = path.join(LOG_DIR, `backfillRun-${lottery}-${runId}.json`);
  const picked = backfillDays.slice(0, limitDays);

  console.log("==================================");
  console.log(`[BACKFILL] lottery=${lottery}`);
  console.log(`[BACKFILL] plan=${planPath}`);
  console.log(
    `[BACKFILL] days in plan=${backfillDays.length} | running now=${picked.length} (limitDays=${limitDays})`
  );
  console.log(`[BACKFILL] baseMins=${baseMins.join(",")} tolMin=${tolMin}`);
  console.log(`[BACKFILL] attemptTimeoutMs=${envInt("IMPORT_ATTEMPT_TIMEOUT_MS", 60_000)}`);
  console.log(`[BACKFILL] output=${outFile}`);
  console.log("==================================");

  const results = [];

  for (const day of picked) {
    const ymd = safeStr(day?.ymd);
    const missingHours = Array.isArray(day?.missingHours) ? day.missingHours : [];

    const dayRes = {
      ymd,
      missingHours,
      attempted: [],
      summary: {
        capturedSlots: 0,
        alreadyHadSlots: 0,
        notFoundSlots: 0,
        apiNoSlot: 0,
        apiSlotEmpty: 0,
        errors: 0,
      },
    };

    console.log(`\n[DAY] ${ymd} missing=${missingHours.join(",") || "—"}`);

    for (const hh of missingHours) {
      const hour = normalizeHH(hh);
      if (!hour) continue;

      const candidates = closeCandidates(hour, baseMins, tolMin);

      const slotRes = {
        hour,
        candidates,
        ok: false,
        doneReason: "",
        last: null,
        tries: [],
        api: { matchedCloseAny: 0, validAny: null, fromApiAny: null },
      };

      console.log(`  [SLOT] hour=${hour} candidates=${candidates.join(",")}`);

      let slotDone = false;

      // flags para decidir API_NO_SLOT corretamente
      let anyMatchedClose = false; // algum candidate teve matchedClose>0?
      let sawSlotEmpty = false; // vimos slot existir porém vazio?
      let slotEmptyEvidence = null;

      for (let idx = 0; idx < candidates.length; idx++) {
        const closeHour = candidates[idx];
        let r = null;

        try {
          r = await runImportWithTimeout({ date: ymd, lotteryKey: lottery, closeHour });
        } catch (e) {
          const msg = e?.message || String(e);
          slotRes.tries.push({ closeHour, ok: false, error: msg });
          slotRes.last = { closeHour, ok: false, error: msg };
          dayRes.summary.errors += 1;
          console.log(`    - close=${closeHour} ERROR: ${msg}`);
          continue;
        }

        const savedCount = Number.isFinite(Number(r?.savedCount)) ? Number(r.savedCount) : 0;
        const writeCount = Number.isFinite(Number(r?.writeCount)) ? Number(r.writeCount) : 0;

        const captured = Boolean(r?.captured);
        const alreadyCompleteAny = Boolean(r?.alreadyCompleteAny);
        const apiHasPrizes = r?.apiHasPrizes ?? null;

        const matchedClose = Number.isFinite(Number(r?.totalDrawsMatchedClose))
          ? Number(r.totalDrawsMatchedClose)
          : null;

        const valid = Number.isFinite(Number(r?.totalDrawsValid)) ? Number(r.totalDrawsValid) : null;
        const fromApi = Number.isFinite(Number(r?.totalDrawsFromApi)) ? Number(r.totalDrawsFromApi) : null;

        const blocked = Boolean(r?.blocked);
        const blockedReason = String(r?.blockedReason || "").trim();

        // ✅ Se a fonte disse "não existe sorteio nesse slot", não é furo.
        // Para backfill, isso deve encerrar o slot como API_NO_SLOT imediatamente.
        if (blocked && (blockedReason === "no_draw_for_slot" || blockedReason === "no_draw_for_slot_calendar")) {
          slotRes.tries.push({
            closeHour,
            ok: true,
            blocked,
            blockedReason,
            captured: false,
            alreadyCompleteAny: false,
            savedCount,
            writeCount,
            apiHasPrizes,
            totalDrawsFromApi: fromApi,
            totalDrawsMatchedClose: matchedClose,
            totalDrawsValid: valid,
            targetDrawIds: r?.targetDrawIds ?? null,
            tookMs: r?.tookMs ?? null,
          });

          slotRes.last = slotRes.tries[slotRes.tries.length - 1];

          slotRes.ok = false;
          slotRes.doneReason = "API_NO_SLOT";
          dayRes.summary.apiNoSlot += 1;

          console.log(
            "    [NO_DRAW] close=" +
              closeHour +
              " API_NO_SLOT (blockedReason=no_draw_for_slot|no_draw_for_slot_calendar)"
          );

          slotDone = true;
          break;
        }

        if (matchedClose != null && matchedClose > 0) anyMatchedClose = true;

        // “Any” summary info (melhor que só primeira leitura)
        if (matchedClose != null)
          slotRes.api.matchedCloseAny = Math.max(slotRes.api.matchedCloseAny, matchedClose);
        if (slotRes.api.validAny == null && valid != null) slotRes.api.validAny = valid;
        if (slotRes.api.fromApiAny == null && fromApi != null) slotRes.api.fromApiAny = fromApi;

        slotRes.tries.push({
          closeHour,
          ok: true,
          captured,
          alreadyCompleteAny,
          savedCount,
          writeCount,
          apiHasPrizes,
          totalDrawsFromApi: fromApi,
          totalDrawsMatchedClose: matchedClose,
          totalDrawsValid: valid,
          targetDrawIds: r?.targetDrawIds ?? null,
          tookMs: r?.tookMs ?? null,
        });

        slotRes.last = slotRes.tries[slotRes.tries.length - 1];

        // ✅ Critério “feito”
        const doneNow = captured && (savedCount > 0 || alreadyCompleteAny);
        if (doneNow) {
          slotRes.ok = true;
          slotRes.doneReason = alreadyCompleteAny ? "FS_ALREADY_HAS" : "CAPTURED";
          slotDone = true;

          if (alreadyCompleteAny) dayRes.summary.alreadyHadSlots += 1;
          else dayRes.summary.capturedSlots += 1;

          console.log(
            `    ✓ close=${closeHour} DONE (${slotRes.doneReason}) saved=${savedCount} writes=${writeCount}`
          );
          break;
        }

        // ✅ Slot existe, mas veio “vazio”: pode parar cedo
        // (apenas quando temos evidência de slot existir: matchedClose > 0)
        if (
          matchedClose != null &&
          matchedClose > 0 &&
          (valid === 0 || valid === null) &&
          apiHasPrizes === false
        ) {
          sawSlotEmpty = true;
          slotEmptyEvidence = {
            closeHour,
            matchedClose,
            valid,
            apiHasPrizes,
          };

          console.log(
            `    ⚠ close=${closeHour} SLOT_EMPTY (matchedClose=${matchedClose}; valid=0; sem prizes)`
          );
          break;
        }

        // Se não capturou, segue nos candidatos.
        console.log(
          `    - close=${closeHour} NO (captured=${captured} saved=${savedCount} alreadyAny=${alreadyCompleteAny} apiHasPrizes=${apiHasPrizes} matchedClose=${matchedClose})`
        );
      }

      // Decisão final do slot (corrigida)
      if (!slotDone) {
        if (sawSlotEmpty) {
          slotRes.ok = false;
          slotRes.doneReason = "API_SLOT_EMPTY";
          dayRes.summary.apiSlotEmpty += 1;
          slotDone = true;
          slotRes.last = slotRes.last || slotEmptyEvidence;
          console.log(`    ✗ hour=${hour} API_SLOT_EMPTY`);
        } else if (!anyMatchedClose) {
          // ✅ só agora faz sentido afirmar “API não tem slot”
          slotRes.ok = false;
          slotRes.doneReason = "API_NO_SLOT";
          dayRes.summary.apiNoSlot += 1;
          slotDone = true;
          console.log(`    ✗ hour=${hour} API_NO_SLOT (nenhum candidate bateu matchedClose>0)`);
        } else {
          slotRes.ok = false;
          slotRes.doneReason = "NOT_FOUND";
          dayRes.summary.notFoundSlots += 1;
          console.log(`    ✗ hour=${hour} NOT_FOUND (slot existe, mas não capturou)`);
        }
      }

      dayRes.attempted.push(slotRes);
    }

    results.push(dayRes);
  }

  const report = {
    lottery,
    planPath,
    runId,
    generatedAt: new Date().toISOString(),
    limitDays,
    baseMins,
    tolMin,
    ranDays: picked.map((x) => x.ymd),
    totals: {
      daysProcessed: results.length,
      capturedSlots: results.reduce((a, r) => a + (r.summary.capturedSlots || 0), 0),
      alreadyHadSlots: results.reduce((a, r) => a + (r.summary.alreadyHadSlots || 0), 0),
      notFoundSlots: results.reduce((a, r) => a + (r.summary.notFoundSlots || 0), 0),
      apiNoSlot: results.reduce((a, r) => a + (r.summary.apiNoSlot || 0), 0),
      apiSlotEmpty: results.reduce((a, r) => a + (r.summary.apiSlotEmpty || 0), 0),
      errors: results.reduce((a, r) => a + (r.summary.errors || 0), 0),
    },
    results,
  };

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log("\n==================================");
  console.log("[BACKFILL] FINAL");
  console.log(report.totals);
  console.log("[BACKFILL] saved:", outFile);
  console.log("==================================");
}

main().catch((e) => {
  console.error("ERRO:", e?.stack || e?.message || e);
  process.exit(1);
});

