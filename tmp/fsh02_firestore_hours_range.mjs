import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config({ path: ".env.local" });
dotenv.config();

const OUTPUT = "tmp/fsh02_firestore_hours_range.txt";

const DATE_FROM = "2026-06-01";
const DATE_TO = "2026-07-22";

const LOTTERIES = [
  "PT_RIO",
  "LOOK",
  "NACIONAL",
  "FEDERAL",
];

function normalizeHour(value) {
  const raw = String(value ?? "").trim();

  if (!raw) return "";

  const compact = raw.replace(/\s+/g, "");

  let m = compact.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);

  if (m) {
    return `${String(Number(m[1])).padStart(2, "0")}:00`;
  }

  m = compact.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);

  if (m) {
    return `${String(Number(m[1])).padStart(2, "0")}:${String(
      Number(m[2])
    ).padStart(2, "0")}`;
  }

  m = compact.match(/^(\d{1,2})$/);

  if (m) {
    return `${String(Number(m[1])).padStart(2, "0")}:00`;
  }

  m = compact.match(/^(\d{3,4})$/);

  if (m) {
    const digits = String(m[1]).padStart(4, "0");
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  return raw;
}

function bucketHour(value) {
  const normalized = normalizeHour(value);
  const m = normalized.match(/^(\d{2}):/);

  return m ? `${m[1]}:00` : "";
}

function weekdayFromYmd(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!m) return "";

  const names = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];

  return names[
    new Date(
      Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3])
      )
    ).getUTCDay()
  ];
}

function pickHour(data) {
  const candidates = [
    ["close_hour", data?.close_hour],
    ["closeHour", data?.closeHour],
    ["hour", data?.hour],
    ["hora", data?.hora],
    ["horario", data?.horario],
    ["drawHour", data?.drawHour],
    ["draw_hour", data?.draw_hour],
  ];

  for (const [field, value] of candidates) {
    const text = String(value ?? "").trim();

    if (text) {
      return {
        field,
        raw: text,
        normalized: normalizeHour(text),
        bucket: bucketHour(text),
      };
    }
  }

  return {
    field: "",
    raw: "",
    normalized: "",
    bucket: "",
  };
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function loadServiceAccount() {
  const credentialsPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve("_secrets/palpitaco/firebase-admin.json");

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Credencial Firebase não encontrada: ${credentialsPath}`
    );
  }

  return {
    credentialsPath,
    serviceAccount: JSON.parse(
      fs.readFileSync(credentialsPath, "utf8")
    ),
  };
}

async function initializeFirestore() {
  const { credentialsPath, serviceAccount } =
    loadServiceAccount();

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  return {
    db: getFirestore(),
    credentialsPath,
  };
}

async function queryLottery(db, lottery) {
  const snapshot = await db
    .collection("draws")
    .where("lottery_key", "==", lottery)
    .where("ymd", ">=", DATE_FROM)
    .where("ymd", "<=", DATE_TO)
    .get();

  return snapshot.docs;
}

async function main() {
  const { db, credentialsPath } =
    await initializeFirestore();

  const lines = [
    "=".repeat(100),
    "AUDITORIA CORRETA DE HORÁRIOS NO FIRESTORE",
    "=".repeat(100),
    `Credencial: ${credentialsPath}`,
    `Período: ${DATE_FROM} até ${DATE_TO}`,
  ];

  for (const lottery of LOTTERIES) {
    lines.push(
      "",
      "",
      "=".repeat(100),
      `LOTERIA: ${lottery}`,
      "=".repeat(100)
    );

    let docs;

    try {
      docs = await queryLottery(db, lottery);
    } catch (error) {
      lines.push(
        `ERRO NA CONSULTA: ${String(
          error?.message || error
        )}`
      );

      continue;
    }

    const rawCounts = new Map();
    const normalizedCounts = new Map();
    const bucketCounts = new Map();
    const weekdayBucketCounts = new Map();

    const samples11 = [];
    const samplesWithoutHour = [];

    let wednesdayTotal = 0;
    let wednesday11 = 0;

    for (const doc of docs) {
      const data = doc.data() || {};
      const ymd = String(data?.ymd || "").trim();
      const weekday = weekdayFromYmd(ymd);
      const hour = pickHour(data);

      increment(
        rawCounts,
        hour.raw
          ? `${hour.field}=${hour.raw}`
          : "[SEM HORÁRIO]"
      );

      increment(
        normalizedCounts,
        hour.normalized ||
          "[SEM HORÁRIO NORMALIZADO]"
      );

      increment(
        bucketCounts,
        hour.bucket || "[SEM BUCKET]"
      );

      increment(
        weekdayBucketCounts,
        `${weekday || "?"} | ${
          hour.bucket || "[SEM BUCKET]"
        }`
      );

      if (weekday === "Quarta") {
        wednesdayTotal += 1;

        if (hour.bucket === "11:00") {
          wednesday11 += 1;
        }
      }

      const sample = {
        id: doc.id,
        ymd,
        weekday,
        lottery_key:
          data?.lottery_key ?? "",
        uf: data?.uf ?? "",
        lottery_code:
          data?.lottery_code ??
          data?.lotteryCode ??
          "",
        rawField: hour.field,
        rawHour: hour.raw,
        normalized: hour.normalized,
        bucket: hour.bucket,
        prizesCount: Array.isArray(data?.prizes)
          ? data.prizes.length
          : data?.prizesCount ?? null,
      };

      if (
        hour.bucket === "11:00" &&
        samples11.length < 40
      ) {
        samples11.push(sample);
      }

      if (
        !hour.bucket &&
        samplesWithoutHour.length < 40
      ) {
        samplesWithoutHour.push(sample);
      }
    }

    lines.push(
      `Documentos no período: ${docs.length}`,
      `Documentos de quarta-feira: ${wednesdayTotal}`,
      `Documentos de quarta-feira no bucket 11:00: ${wednesday11}`
    );

    function writeMap(title, map) {
      lines.push("", title, "-".repeat(90));

      for (const [key, count] of [...map.entries()].sort(
        ([a], [b]) => String(a).localeCompare(String(b))
      )) {
        lines.push(
          `${String(count).padStart(6, " ")}  ${key}`
        );
      }
    }

    writeMap(
      "VALORES BRUTOS DE HORÁRIO",
      rawCounts
    );

    writeMap(
      "HORÁRIOS NORMALIZADOS",
      normalizedCounts
    );

    writeMap(
      "BUCKETS HH:00",
      bucketCounts
    );

    writeMap(
      "DIA DA SEMANA x BUCKET",
      weekdayBucketCounts
    );

    lines.push(
      "",
      "AMOSTRAS DO BUCKET 11:00",
      "-".repeat(90)
    );

    if (!samples11.length) {
      lines.push("[NENHUM REGISTRO]");
    } else {
      for (const sample of samples11) {
        lines.push(JSON.stringify(sample));
      }
    }

    lines.push(
      "",
      "DOCUMENTOS SEM HORÁRIO",
      "-".repeat(90)
    );

    if (!samplesWithoutHour.length) {
      lines.push("[NENHUM REGISTRO]");
    } else {
      for (const sample of samplesWithoutHour) {
        lines.push(JSON.stringify(sample));
      }
    }
  }

  fs.writeFileSync(
    OUTPUT,
    lines.join("\n"),
    "utf8"
  );

  console.log(`Relatório criado: ${OUTPUT}`);
}

main().catch((error) => {
  const message = String(
    error?.stack ||
    error?.message ||
    error
  );

  fs.writeFileSync(
    OUTPUT,
    message,
    "utf8"
  );

  console.error(message);
  process.exitCode = 1;
});
