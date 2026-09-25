"use strict";

/*
 * PALPITACO JB
 * External Four Auto Import V1
 *
 * Loterias:
 * - CAPITAL
 * - PT_PB
 * - AVAL_PE
 * - TRADICIONAL
 *
 * Fontes:
 * - CAPITAL      -> resultadosjbcerto.com.br
 * - PT_PB        -> playbicho.com
 * - AVAL_PE      -> jbresultado.com.br
 * - TRADICIONAL  -> playbicho.com
 *
 * Este script:
 * - NÃO chama runImport()
 * - NÃO dispara TOP3
 * - valida data
 * - valida horário
 * - exige exatamente P1..P5 de 4 dígitos
 * - bloqueia conflito com Firestore
 * - é idempotente
 */

const SUPPORTED =
  Object.freeze({
    CAPITAL: {
      lotteryName:
        "CAPITAL",
      lotteryId:
        "external_capital_verified",
      uf: null,
      source:
        "resultadosjbcerto",
      hours: Object.freeze([
        "00:40",
        "01:40",
        "02:40",
        "07:40",
        "08:40",
        "09:40",
        "10:40",
        "11:40",
        "12:40",
        "13:40",
        "14:40",
        "15:40",
        "16:40",
        "17:40",
        "18:40",
        "19:40",
        "20:40",
        "21:40",
        "22:40",
        "23:40",
      ]),
      url(date) {
        void date;

        return (
          "https://resultadosjbcerto.com.br/capital/"
        );
      },
    },

    PT_PB: {
      lotteryName:
        "PARATODOS PB",
      lotteryId:
        "external_pt_pb_verified",
      uf:
        "PB",
      source:
        "playbicho",
      hours: Object.freeze([
        "10:05",
        "20:40",
      ]),
      url(date) {
        return (
          "https://playbicho.com/" +
          "resultado-jogo-do-bicho/" +
          `PB-do-dia-${date}`
        );
      },
    },

    AVAL_PE: {
      lotteryName:
        "AVAL PE",
      lotteryId:
        "external_aval_pe_verified",
      uf:
        "PE",
      source:
        "jbresultado",
      hours: Object.freeze([
        "09:20",
        "11:00",
        "12:45",
        "14:00",
        "15:45",
        "17:00",
        "19:00",
      ]),
      url(date) {
        return (
          "https://jbresultado.com.br/" +
          "resultados-jogo-do-bicho-aval-pe/" +
          `do-dia/${date}/`
        );
      },
    },

    TRADICIONAL: {
      lotteryName:
        "TRADICIONAL",
      lotteryId:
        "external_tradicional_verified",
      uf: null,
      source:
        "playbicho",
      hours: Object.freeze([
        "09:40",
        "10:40",
        "11:40",
        "12:40",
        "13:40",
        "14:40",
        "18:40",
        "19:40",
        "20:40",
        "21:40",
        "22:40",
        "23:40",
      ]),
      url(date) {
        return (
          "https://playbicho.com/" +
          "resultado-jogo-do-bicho/" +
          `tradicional-do-dia-${date}`
        );
      },
    },
  });

function asText(value) {
  return String(
    value ?? ""
  ).trim();
}

function normalizeLotteryKey(
  value
) {
  return asText(value)
    .toUpperCase();
}

function isISODate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(
      asText(value)
    )
  );
}

function todaySaoPaulo() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "America/Sao_Paulo",
      year:
        "numeric",
      month:
        "2-digit",
      day:
        "2-digit",
    }
  ).format(
    new Date()
  );
}

function ymdToBR(ymd) {
  const match =
    asText(ymd).match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    return "";
  }

  return (
    `${match[3]}/${match[2]}/${match[1]}`
  );
}

function decodeEntities(value) {
  return String(value || "")
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&#(\d+);/g,
      (_, n) => {
        try {
          return String.fromCodePoint(
            Number(n)
          );
        }
        catch {
          return _;
        }
      }
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) => {
        try {
          return String.fromCodePoint(
            parseInt(
              n,
              16
            )
          );
        }
        catch {
          return _;
        }
      }
    );
}

function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/td|\/th)>/gi,
        " "
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function normalizeHour(
  value
) {
  const text =
    asText(value);

  const match =
    text.match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (!match) {
    return "";
  }

  const hour =
    Number(
      match[1]
    );

  const minute =
    Number(
      match[2]
    );

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return (
    String(hour)
      .padStart(
        2,
        "0"
      ) +
    ":" +
    String(minute)
      .padStart(
        2,
        "0"
      )
  );
}

function extractFivePrizes(
  segment
) {
  const text =
    String(segment || "")
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  const prizes = [];

  for (
    let position = 1;
    position <= 5;
    position += 1
  ) {
    const regex =
      new RegExp(
        `(?:^|\\s)${position}º\\s+(\\d{4})(?=\\s|$)`,
        "i"
      );

    const match =
      text.match(
        regex
      );

    if (!match) {
      return [];
    }

    prizes.push(
      match[1]
    );
  }

  return prizes;
}

function markerSpec(
  lotteryKey
) {
  switch (
    lotteryKey
  ) {
    case "PT_PB":
      return {
        regex:
          /Resultado\s+PARATODOS\s*-\s*PB\s+(\d{1,2}:\d{2})\s*h\b/gi,

        hour(match) {
          return normalizeHour(
            match[1]
          );
        },
      };

    case "AVAL_PE":
      return {
        regex:
          /AVAL\s+PE\s*[–—-]\s*PE,\s*(\d{1,2}:\d{2})(?:,\s*1º\s*ao\s*(?:5º|10º))?/gi,

        hour(match) {
          return normalizeHour(
            match[1]
          );
        },
      };

    case "TRADICIONAL":
      return {
        regex:
          /Resultado\s+TRADICIONAL\s+(\d{1,2}:\d{2})\s*h\b/gi,

        hour(match) {
          return normalizeHour(
            match[1]
          );
        },
      };

    default:
      return null;
  }
}

function dedupeByHour(
  rows,
  lotteryKey,
  date
) {
  const byHour =
    new Map();

  for (
    const row
    of rows
  ) {
    const hour =
      normalizeHour(
        row?.closeHour
      );

    if (
      !hour ||
      !Array.isArray(
        row?.prizes
      ) ||
      row.prizes.length !== 5
    ) {
      continue;
    }

    const signature =
      row.prizes.join(
        ","
      );

    if (
      !byHour.has(
        hour
      )
    ) {
      byHour.set(
        hour,
        new Map()
      );
    }

    byHour
      .get(hour)
      .set(
        signature,
        {
          ...row,
          closeHour:
            hour,
        }
      );
  }

  const out = [];

  for (
    const [
      hour,
      variants,
    ]
    of byHour.entries()
  ) {
    if (
      variants.size > 1
    ) {
      throw new Error(
        [
          "SOURCE_CONFLICT",
          lotteryKey,
          date,
          hour,
          [...variants.keys()]
            .join(
              " || "
            ),
        ].join("=")
      );
    }

    out.push(
      [...variants.values()][0]
    );
  }

  out.sort(
    (a, b) =>
      a.closeHour.localeCompare(
        b.closeHour
      )
  );

  return out;
}

function parseMarkerPage({
  lotteryKey,
  date,
  text,
}) {
  const spec =
    markerSpec(
      lotteryKey
    );

  if (!spec) {
    throw new Error(
      `MARKER_SPEC_NOT_FOUND=${lotteryKey}`
    );
  }

  const expectedBr =
    ymdToBR(
      date
    );

  if (
    !String(text).includes(
      date
    ) &&
    !String(text).includes(
      expectedBr
    )
  ) {
    throw new Error(
      `SOURCE_DATE_MISMATCH=${lotteryKey} ${date}`
    );
  }

  const regex =
    new RegExp(
      spec.regex.source,
      spec.regex.flags
    );

  const markers = [];

  let match;

  while (
    (
      match =
        regex.exec(
          String(text || "")
        )
    ) !== null
  ) {
    markers.push({
      index:
        match.index,

      raw:
        match[0],

      closeHour:
        spec.hour(
          match
        ),
    });

    if (
      match[0].length === 0
    ) {
      regex.lastIndex += 1;
    }
  }

  const rows = [];

  for (
    let index = 0;
    index < markers.length;
    index += 1
  ) {
    const marker =
      markers[index];

    const nextIndex =
      index + 1 < markers.length
        ? markers[
            index + 1
          ].index
        : Math.min(
            String(text).length,
            marker.index + 6000
          );

    const segment =
      String(text).slice(
        marker.index,
        nextIndex
      );

    const prizes =
      extractFivePrizes(
        segment
      );

    if (
      prizes.length !== 5
    ) {
      continue;
    }

    rows.push({
      date,
      closeHour:
        marker.closeHour,
      prizes,
    });
  }

  return dedupeByHour(
    rows,
    lotteryKey,
    date
  );
}

function decodeHref(
  value
) {
  return decodeEntities(
    value
  );
}

function extractCapitalShareTexts(
  html
) {
  const out = [];

  const regex =
    /href=["']([^"']*api\.whatsapp\.com\/send\?text=[^"']+)["']/gi;

  let match;

  while (
    (
      match =
        regex.exec(
          String(html || "")
        )
    ) !== null
  ) {
    const href =
      decodeHref(
        match[1]
      );

    try {
      const url =
        new URL(
          href
        );

      const text =
        url.searchParams.get(
          "text"
        );

      if (text) {
        out.push(
          text
        );
      }
    }
    catch {
      // href inválido: ignora.
    }
  }

  return out;
}

function parseCapitalShareText(
  text
) {
  const normalized =
    String(text || "")
      .replace(
        /\r/g,
        ""
      )
      .trim();

  if (
    !/LT\s+CAPITAL/i.test(
      normalized
    )
  ) {
    return null;
  }

  /*
   * A página inclui eventualmente
   * "Federal 20 horas" no mesmo bloco.
   * Não pertence ao calendário CAPITAL.
   */
  if (
    /Federal\s+20\s+horas/i.test(
      normalized
    )
  ) {
    return null;
  }

  const hourMatch =
    normalized.match(
      /LT\s+CAPITAL\s*[–—-]\s*(\d{1,2})h(\d{2})/i
    );

  const dateMatch =
    normalized.match(
      /\b(\d{2})\/(\d{2})\/(\d{4})\b/
    );

  if (
    !hourMatch ||
    !dateMatch
  ) {
    return null;
  }

  const closeHour =
    normalizeHour(
      `${hourMatch[1]}:${hourMatch[2]}`
    );

  const date =
    (
      `${dateMatch[3]}-` +
      `${dateMatch[2]}-` +
      `${dateMatch[1]}`
    );

  const prizes = [];

  for (
    let position = 1;
    position <= 5;
    position += 1
  ) {
    const regex =
      new RegExp(
        `${position}º\\s+(\\d{4})\\b`,
        "i"
      );

    const match =
      normalized.match(
        regex
      );

    if (!match) {
      return null;
    }

    prizes.push(
      match[1]
    );
  }

  return {
    date,
    closeHour,
    prizes,
  };
}

function parseCapitalPage({
  html,
  date,
}) {
  const rows =
    extractCapitalShareTexts(
      html
    )
      .map(
        parseCapitalShareText
      )
      .filter(
        Boolean
      )
      .filter(
        row =>
          row.date ===
          date
      );

  return dedupeByHour(
    rows,
    "CAPITAL",
    date
  );
}

function parseExternalSource({
  lotteryKey,
  date,
  html,
}) {
  if (
    lotteryKey ===
    "CAPITAL"
  ) {
    return parseCapitalPage({
      html,
      date,
    });
  }

  return parseMarkerPage({
    lotteryKey,
    date,
    text:
      htmlToText(
        html
      ),
  });
}

function validateSourceRows({
  lotteryKey,
  date,
  rows,
}) {
  const config =
    SUPPORTED[
      lotteryKey
    ];

  if (!config) {
    throw new Error(
      `LOTTERY_NOT_SUPPORTED=${lotteryKey}`
    );
  }

  const allowed =
    new Set(
      config.hours
    );

  const seen =
    new Set();

  for (
    const row
    of rows
  ) {
    if (
      row.date !==
      date
    ) {
      throw new Error(
        `ROW_DATE_INVALID=${lotteryKey} ${row.date}`
      );
    }

    if (
      !allowed.has(
        row.closeHour
      )
    ) {
      throw new Error(
        `ROW_HOUR_OUTSIDE_SCHEDULE=${lotteryKey} ${row.closeHour}`
      );
    }

    if (
      seen.has(
        row.closeHour
      )
    ) {
      throw new Error(
        `ROW_DUPLICATE_HOUR=${lotteryKey} ${row.closeHour}`
      );
    }

    seen.add(
      row.closeHour
    );

    if (
      !Array.isArray(
        row.prizes
      ) ||
      row.prizes.length !== 5
    ) {
      throw new Error(
        `ROW_PRIZE_COUNT_INVALID=${lotteryKey} ${row.closeHour}`
      );
    }

    for (
      const prize
      of row.prizes
    ) {
      if (
        !/^\d{4}$/.test(
          String(prize)
        )
      ) {
        throw new Error(
          `ROW_PRIZE_INVALID=${lotteryKey} ${row.closeHour} ${prize}`
        );
      }
    }
  }

  return rows;
}

async function fetchHtml(
  url
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      25000
    );

  try {
    const response =
      await fetch(
        url,
        {
          redirect:
            "follow",

          signal:
            controller.signal,

          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
              "AppleWebKit/537.36 Chrome/153 Safari/537.36",

            "accept":
              "text/html,application/xhtml+xml,*/*;q=0.8",

            "accept-language":
              "pt-BR,pt;q=0.9,en;q=0.8",
          },
        }
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `SOURCE_HTTP_${response.status}=${url}`
      );
    }

    return await response.text();
  }
  finally {
    clearTimeout(
      timeout
    );
  }
}

function lotteryKeyOf(
  data
) {
  return normalizeLotteryKey(
    data?.lottery_key ??
    data?.lotteryKey ??
    data?.lottery ??
    ""
  );
}

function closeHourOf(
  data
) {
  return normalizeHour(
    data?.close_hour ??
    data?.closeHour ??
    data?.hour ??
    ""
  );
}

function prizeValue(
  prize
) {
  return asText(
    prize?.displayValue ??
    prize?.raw ??
    prize?.numero ??
    prize?.milhar ??
    prize?.value ??
    ""
  );
}

function prizesOf(
  data
) {
  if (
    Array.isArray(
      data?.prizes
    )
  ) {
    const normalized =
      data.prizes
        .map(
          (
            prize,
            index
          ) => ({
            position:
              Number(
                prize?.position ??
                index + 1
              ),

            value:
              prizeValue(
                prize
              ),
          })
        )
        .filter(
          item =>
            item.position >= 1 &&
            item.position <= 5
        )
        .sort(
          (a, b) =>
            a.position -
            b.position
        );

    if (
      normalized.length >= 5
    ) {
      return normalized
        .slice(
          0,
          5
        )
        .map(
          item =>
            item.value
        );
    }
  }

  const direct = [];

  for (
    let position = 1;
    position <= 5;
    position += 1
  ) {
    const value =
      asText(
        data?.[
          `prize_${position}`
        ]
      );

    if (!value) {
      return [];
    }

    direct.push(
      value
    );
  }

  return direct;
}

function samePrizes(
  a,
  b
) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === 5 &&
    b.length === 5 &&
    a.every(
      (
        value,
        index
      ) =>
        String(value) ===
        String(
          b[index]
        )
    )
  );
}

async function loadDay(
  db,
  date
) {
  return await db
    .collection(
      "draws"
    )
    .where(
      "date",
      "==",
      date
    )
    .get();
}

function rowsForLottery(
  snapshot,
  lotteryKey
) {
  return snapshot.docs
    .map(
      doc => ({
        id:
          doc.id,

        data:
          doc.data() ||
          {},
      })
    )
    .filter(
      row =>
        lotteryKeyOf(
          row.data
        ) ===
        lotteryKey
    );
}

function buildPayloadRow({
  config,
  row,
  sourceUrl,
}) {
  return {
    date:
      row.date,

    close_hour:
      row.closeHour,

    lottery_name:
      config.lotteryName,

    lottery_id:
      config.lotteryId,

    source_primary:
      config.source,

    source_primary_url:
      sourceUrl,

    external_confirmed:
      true,

    prize_1:
      row.prizes[0],

    prize_2:
      row.prizes[1],

    prize_3:
      row.prizes[2],

    prize_4:
      row.prizes[3],

    prize_5:
      row.prizes[4],
  };
}

async function main() {
  const lotteryKey =
    normalizeLotteryKey(
      process.env.LOTTERY
    );

  const config =
    SUPPORTED[
      lotteryKey
    ];

  if (!config) {
    throw new Error(
      `LOTTERY_NOT_SUPPORTED=${lotteryKey}`
    );
  }

  const date =
    asText(
      process.env.DATE
    ) ||
    todaySaoPaulo();

  if (
    !isISODate(
      date
    )
  ) {
    throw new Error(
      `DATE_INVALID=${date}`
    );
  }

  const dryRun =
    String(
      process.env.DRY_RUN ||
      process.env.EXTERNAL_FOUR_DRY_RUN ||
      ""
    ).trim() ===
    "1";

  const sourceUrl =
    config.url(
      date
    );

  console.log("");
  console.log(
    "============================================================"
  );
  console.log(
    " EXTERNAL FOUR AUTO IMPORT"
  );
  console.log(
    ` LOTTERY=${lotteryKey}`
  );
  console.log(
    ` DATE=${date}`
  );
  console.log(
    ` MODE=${dryRun ? "DRY_RUN" : "WRITE"}`
  );
  console.log(
    "============================================================"
  );

  const html =
    await fetchHtml(
      sourceUrl
    );

  const rows =
    validateSourceRows({
      lotteryKey,
      date,
      rows:
        parseExternalSource({
          lotteryKey,
          date,
          html,
        }),
    });

  console.log(
    `[EXT4_AUTO] SOURCE_DRAWS=${rows.length}`
  );

  console.log(
    `[EXT4_AUTO] SOURCE_HOURS=${rows.map(row => row.closeHour).join(",") || "NONE"}`
  );

  for (
    const row
    of rows
  ) {
    console.log(
      [
        "[EXT4_AUTO] SOURCE",
        row.closeHour,
        ...row.prizes,
      ].join(
        " | "
      )
    );
  }

  /*
   * Antes do primeiro sorteio do dia,
   * zero cards publicados é estado normal.
   */
  if (
    rows.length === 0
  ) {
    console.log(
      "[EXT4_AUTO] NOTHING_PUBLISHED_YET=YES"
    );
    console.log(
      "[EXT4_AUTO] RUNIMPORT_CALLED=0"
    );
    console.log(
      "[EXT4_AUTO] TOP3_TRIGGER=0"
    );
    console.log(
      "[EXT4_AUTO] DONE=YES"
    );

    return {
      ok: true,
      rows: 0,
      writes: 0,
    };
  }

  if (
    dryRun
  ) {
    console.log(
      "[EXT4_AUTO] DRY_RUN=PASS"
    );
    console.log(
      "[EXT4_AUTO] FIRESTORE_WRITE=0"
    );
    console.log(
      "[EXT4_AUTO] RUNIMPORT_CALLED=0"
    );
    console.log(
      "[EXT4_AUTO] TOP3_TRIGGER=0"
    );
    console.log(
      "[EXT4_AUTO] DONE=YES"
    );

    return {
      ok: true,
      dryRun: true,
      rows:
        rows.length,
      writes: 0,
    };
  }

  /*
   * Firestore e importador só são carregados
   * depois que o modo DRY_RUN terminou.
   */
  const {
    getDb,
  } =
    require(
      "../service/firebaseAdmin"
    );

  const {
    importFromPayload,
  } =
    require(
      "./importKingApostas"
    );

  const db =
    getDb();

  const before =
    await loadDay(
      db,
      date
    );

  const existing =
    rowsForLottery(
      before,
      lotteryKey
    );

  const toWrite = [];
  let alreadyComplete = 0;

  for (
    const row
    of rows
  ) {
    const atHour =
      existing.filter(
        item =>
          closeHourOf(
            item.data
          ) ===
          row.closeHour
      );

    const complete =
      atHour
        .map(
          item => ({
            ...item,
            prizes:
              prizesOf(
                item.data
              ),
          })
        )
        .filter(
          item =>
            item.prizes.length === 5
        );

    const same =
      complete.find(
        item =>
          samePrizes(
            item.prizes,
            row.prizes
          )
      );

    if (same) {
      alreadyComplete += 1;
      continue;
    }

    if (
      complete.length > 0
    ) {
      throw new Error(
        [
          "EXTERNAL_FOUR_DB_CONFLICT",
          lotteryKey,
          date,
          row.closeHour,
          "SOURCE=" +
            row.prizes.join(","),
          "DB=" +
            complete
              .map(
                item =>
                  item.prizes.join(",")
              )
              .join(" || "),
        ].join(
          " | "
        )
      );
    }

    toWrite.push(
      row
    );
  }

  console.log(
    `[EXT4_AUTO] ALREADY_COMPLETE=${alreadyComplete}`
  );

  console.log(
    `[EXT4_AUTO] WRITE_DRAWS=${toWrite.length}`
  );

  for (
    const row
    of toWrite
  ) {
    const payload = {
      data: [
        buildPayloadRow({
          config,
          row,
          sourceUrl,
        }),
      ],
    };

    await importFromPayload({
      payload,

      lotteryKey,

      closeHour:
        null,

      skipIfAlreadyComplete:
        false,

      source:
        "external_verified",

      ufOverride:
        config.uf,
    });
  }

  const after =
    await loadDay(
      db,
      date
    );

  const persisted =
    rowsForLottery(
      after,
      lotteryKey
    );

  let postwritePass = 0;

  for (
    const row
    of rows
  ) {
    const matching =
      persisted.some(
        item =>
          closeHourOf(
            item.data
          ) ===
            row.closeHour &&
          samePrizes(
            prizesOf(
              item.data
            ),
            row.prizes
          )
      );

    if (!matching) {
      throw new Error(
        `EXTERNAL_FOUR_POSTWRITE_FAILED=${lotteryKey} ${date} ${row.closeHour}`
      );
    }

    postwritePass += 1;
  }

  console.log(
    `[EXT4_AUTO] POSTWRITE_PASS=${postwritePass}/${rows.length}`
  );

  console.log(
    `[EXT4_AUTO] COMPLETE_SOURCE_NOW=${postwritePass}/${rows.length}`
  );

  console.log(
    "[EXT4_AUTO] RUNIMPORT_CALLED=0"
  );

  console.log(
    "[EXT4_AUTO] TOP3_TRIGGER=0"
  );

  console.log(
    "[EXT4_AUTO] DONE=YES"
  );

  return {
    ok: true,
    date,
    lotteryKey,
    sourceRows:
      rows.length,
    alreadyComplete,
    writes:
      toWrite.length,
    postwritePass,
  };
}

if (
  require.main ===
  module
) {
  main().catch(
    error => {
      console.error(
        "[EXT4_AUTO] FAILED",
        error?.stack ||
        error?.message ||
        String(error)
      );

      process.exitCode = 1;
    }
  );
}

module.exports = {
  SUPPORTED,
  normalizeHour,
  extractFivePrizes,
  parseMarkerPage,
  parseCapitalShareText,
  parseCapitalPage,
  parseExternalSource,
  validateSourceRows,
  dedupeByHour,
  main,
};