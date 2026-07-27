const admin = require("firebase-admin");

const PROJECT_ID = "palpitacojb-app";
const TARGET_YMD = "2026-07-25";
const TARGET_HOUR = "09:00";
const TOP3_ID = "PT_RIO__2026-07-25__0900";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeHour(value) {
  const text = normalizeText(value).toLowerCase();

  const match = text.match(/^(\d{1,2})(?::(\d{2}))?h?$/);
  if (!match) return "";

  const hh = String(Number(match[1])).padStart(2, "0");
  const mm = String(Number(match[2] || 0)).padStart(2, "0");

  return `${hh}:${mm}`;
}

function normalizeYmd(value) {
  const text = normalizeText(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  return "";
}

function extractHour(data) {
  const candidates = [
    data?.hour,
    data?.hora,
    data?.draw_hour,
    data?.drawHour,
    data?.close_hour,
    data?.closeHour,
    data?.slot,
    data?.targetHour,
  ];

  for (const value of candidates) {
    const normalized = normalizeHour(value);
    if (normalized) return normalized;
  }

  return "";
}

function extractYmd(data) {
  const candidates = [
    data?.ymd,
    data?.date,
    data?.data,
    data?.draw_date,
    data?.drawDate,
    data?.targetYmd,
  ];

  for (const value of candidates) {
    const normalized = normalizeYmd(value);
    if (normalized) return normalized;
  }

  return "";
}

function isPtRio(data) {
  const values = [
    data?.uf,
    data?.lottery_key,
    data?.lotteryKey,
    data?.lottery,
    data?.state,
  ]
    .map((value) => normalizeText(value).toUpperCase())
    .filter(Boolean);

  return values.some((value) =>
    ["PT_RIO", "RJ", "RIO", "RIO DE JANEIRO"].includes(value)
  );
}

function extractMilhar(prize) {
  const raw =
    prize?.milhar ??
    prize?.numero ??
    prize?.number ??
    prize?.valor ??
    "";

  const digits = String(raw).replace(/\D/g, "");

  return digits
    ? digits.slice(-4).padStart(4, "0")
    : "";
}

function summarizeDocument(path, data) {
  const prizes = Array.isArray(data?.prizes)
    ? data.prizes
    : [];

  const podium = [1, 2, 3].map((position) => {
    const prize =
      prizes.find(
        (item) => Number(item?.position) === position
      ) ||
      prizes[position - 1] ||
      null;

    return {
      position,
      grupo:
        prize?.grupo ??
        prize?.group ??
        prize?.animal_grupo ??
        prize?.grupo2 ??
        null,
      milhar: extractMilhar(prize),
      raw: prize,
    };
  });

  return {
    path,
    ymd: extractYmd(data),
    hour: extractHour(data),
    uf:
      data?.uf ??
      data?.lottery_key ??
      data?.lotteryKey ??
      data?.lottery ??
      "",
    resultGrupo: data?.resultGrupo ?? null,
    resultMilhar: data?.resultMilhar ?? "",
    resultTop3Groups: data?.resultTop3Groups ?? [],
    resultTop3Milhares: data?.resultTop3Milhares ?? [],
    matchedGrupo: data?.matchedGrupo ?? null,
    matchedMilhar: data?.matchedMilhar ?? "",
    hitType: data?.hitType ?? "",
    hitScore: data?.hitScore ?? 0,
    hitPosition: data?.hitPosition ?? -1,
    predictionPosition:
      data?.predictionPosition ?? -1,
    resultPosition: data?.resultPosition ?? -1,
    prizesCount: prizes.length,
    podium,
    raw: data,
  };
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: PROJECT_ID,
    });
  }

  const db = admin.firestore();

  console.log(
    "===================================================================================================="
  );
  console.log(
    "TOP3-HIT-02 — AUDITORIA DO DADO REAL 25/07/2026 09H"
  );
  console.log(
    "===================================================================================================="
  );
  console.log(`Projeto: ${PROJECT_ID}`);
  console.log(`Data: ${TARGET_YMD}`);
  console.log(`Horário: ${TARGET_HOUR}`);
  console.log("");

  console.log(
    "===================================================================================================="
  );
  console.log("1. DOCUMENTO PERSISTIDO DO TOP3");
  console.log(
    "===================================================================================================="
  );

  const top3Ref = db
    .collection("top3_predictions")
    .doc(TOP3_ID);

  const top3Snap = await top3Ref.get();

  if (!top3Snap.exists) {
    console.log(
      `NÃO ENCONTRADO: top3_predictions/${TOP3_ID}`
    );
  } else {
    console.log(
      JSON.stringify(
        summarizeDocument(
          top3Snap.ref.path,
          top3Snap.data()
        ),
        null,
        2
      )
    );
  }

  console.log("");
  console.log(
    "===================================================================================================="
  );
  console.log("2. COLEÇÕES EXISTENTES NO FIRESTORE");
  console.log(
    "===================================================================================================="
  );

  const collections = await db.listCollections();

  for (const collection of collections) {
    console.log(`- ${collection.id}`);
  }

  console.log("");
  console.log(
    "===================================================================================================="
  );
  console.log("3. BUSCA DO RESULTADO OFICIAL DA DATA");
  console.log(
    "===================================================================================================="
  );

  const dateFields = [
    "ymd",
    "date",
    "data",
    "draw_date",
    "drawDate",
    "targetYmd",
  ];

  const matches = new Map();

  for (const collection of collections) {
    if (collection.id === "top3_predictions") {
      continue;
    }

    for (const field of dateFields) {
      try {
        const snapshot = await collection
          .where(field, "==", TARGET_YMD)
          .limit(100)
          .get();

        for (const doc of snapshot.docs) {
          const data = doc.data() || {};
          const hour = extractHour(data);

          if (
            hour !== TARGET_HOUR ||
            !isPtRio(data)
          ) {
            continue;
          }

          matches.set(
            doc.ref.path,
            summarizeDocument(
              doc.ref.path,
              data
            )
          );
        }
      } catch (error) {
        // Algumas coleções não possuem o campo pesquisado.
      }
    }
  }

  if (!matches.size) {
    console.log(
      "Nenhum documento foi encontrado automaticamente com data 2026-07-25, horário 09:00 e loteria PT_RIO/RJ."
    );
  } else {
    for (const result of matches.values()) {
      console.log(
        JSON.stringify(result, null, 2)
      );
    }
  }

  console.log("");
  console.log(
    "===================================================================================================="
  );
  console.log("4. CONCLUSÃO AUTOMÁTICA");
  console.log(
    "===================================================================================================="
  );

  const top3Data = top3Snap.exists
    ? top3Snap.data()
    : null;

  if (!top3Data) {
    console.log(
      "STATUS: DOCUMENTO TOP3 NÃO ENCONTRADO."
    );
  } else {
    const top3Milhares = Array.isArray(
      top3Data?.resultTop3Milhares
    )
      ? top3Data.resultTop3Milhares
      : [];

    const hasTop3Milhar = top3Milhares.some(
      (value) =>
        /^\d{4}$/.test(
          String(value || "").replace(/\D/g, "")
        )
    );

    console.log(
      `TOP3 resultMilhar: ${
        top3Data?.resultMilhar || "VAZIO"
      }`
    );

    console.log(
      `TOP3 resultTop3Milhares: ${JSON.stringify(
        top3Milhares
      )}`
    );

    console.log(
      `TOP3 matchedMilhar: ${
        top3Data?.matchedMilhar || "VAZIO"
      }`
    );

    console.log(
      `TOP3 contém milhares oficiais válidas: ${
        hasTop3Milhar ? "SIM" : "NÃO"
      }`
    );
  }
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error("");
    console.error("ERRO NA AUDITORIA:");
    console.error(
      error?.stack || error?.message || error
    );
    process.exitCode = 1;
  });
