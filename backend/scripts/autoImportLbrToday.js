"use strict";

/*
 * LBR_DAILY_AUTO_IMPORT_V1
 *
 * Fontes:
 * - PlayBicho: identidade, slot operacional e P1-P7
 * - SpotBicho: confirmação independente por assinatura P1-P5
 *
 * Regras:
 * - horário SpotBicho NÃO define o slot;
 * - matching sempre por P1-P5;
 * - PlayBicho 13:00 -> slot canônico 13:40;
 * - P6 = soma matemática de P1-P5, 5 dígitos;
 * - P6 PlayBicho/Spot deve coincidir nos últimos 4 dígitos;
 * - P7 deve coincidir exatamente;
 * - documento completo não é regravado;
 * - NÃO chama runImport();
 * - NÃO chama TOP3.
 */

const https =
  require("https");

const {
  getDb,
} =
  require("../service/firebaseAdmin");

const {
  buildPayloadFromDraw,
} =
  require("./importExternalResults");

const {
  importFromPayload,
} =
  require("./importKingApostas");

const CONTRACT =
  "LBR_5X4_SOMA5_MULT3_V2";

function saoPauloDate() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
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
    )
      .formatToParts(
        new Date()
      );

  const map =
    Object.fromEntries(
      parts.map(
        p => [
          p.type,
          p.value,
        ]
      )
    );

  return (
    map.year +
    "-" +
    map.month +
    "-" +
    map.day
  );
}

function targetDate() {
  const override =
    String(
      process.env.DATE ||
      ""
    ).trim();

  return (
    /^\d{4}-\d{2}-\d{2}$/.test(
      override
    )
      ? override
      : saoPauloDate()
  );
}

function brDate(
  ymd
) {
  const [
    y,
    m,
    d,
  ] =
    ymd.split("-");

  return (
    d +
    "-" +
    m +
    "-" +
    y
  );
}

function canonicalSlot(
  slot
) {
  return (
    slot === "13:00"
      ? "13:40"
      : slot
  );
}

function normalizeTime(
  value
) {
  const match =
    String(
      value ||
      ""
    ).match(
      /\b([01]?\d|2[0-3]):([0-5]\d)\b/
    );

  if (!match) {
    return null;
  }

  return (
    String(
      Number(
        match[1]
      )
    ).padStart(
      2,
      "0"
    ) +
    ":" +
    match[2]
  );
}

function request(
  url,
  redirects = 0
) {
  return new Promise(
    (resolve, reject) => {

      if (
        redirects > 5
      ) {
        reject(
          new Error(
            "TOO_MANY_REDIRECTS=" +
            url
          )
        );

        return;
      }

      const req =
        https.get(
          url,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 PalpitacoJB-LBR-Auto/1.0",

              "Accept":
                "text/html,application/xhtml+xml",

              "Accept-Encoding":
                "identity",

              "Cache-Control":
                "no-cache",
            },

            timeout:
              20000,
          },

          res => {

            const status =
              Number(
                res.statusCode ||
                0
              );

            if (
              status >= 300 &&
              status < 400 &&
              res.headers.location
            ) {
              const next =
                new URL(
                  res.headers.location,
                  url
                ).toString();

              res.resume();

              resolve(
                request(
                  next,
                  redirects + 1
                )
              );

              return;
            }

            const chunks = [];

            res.on(
              "data",
              chunk =>
                chunks.push(
                  chunk
                )
            );

            res.on(
              "end",
              () => {
                resolve({
                  status,

                  body:
                    Buffer
                      .concat(
                        chunks
                      )
                      .toString(
                        "utf8"
                      ),
                });
              }
            );
          }
        );

      req.on(
        "timeout",
        () => {
          req.destroy(
            new Error(
              "TIMEOUT=" +
              url
            )
          );
        }
      );

      req.on(
        "error",
        reject
      );
    }
  );
}

function decode(
  value
) {
  return String(
    value ||
    ""
  )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ordm;/gi, "º")
    .replace(/&#186;/gi, "º")
    .replace(/&#xBA;/gi, "º")
    .replace(/&deg;/gi, "º")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&ccedil;/gi, "ç");
}

function textOnly(
  html
) {
  return decode(
    String(
      html ||
      ""
    )
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
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

function prepareJson(
  html
) {
  return decode(
    String(
      html ||
      ""
    )
  ).replace(
    /\\"/g,
    '"'
  );
}

function balancedObject(
  source,
  start
) {
  if (
    source[start] !==
    "{"
  ) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (
    let i = start;
    i < source.length;
    i++
  ) {
    const ch =
      source[i];

    if (inString) {

      if (escaped) {
        escaped = false;
        continue;
      }

      if (
        ch === "\\"
      ) {
        escaped = true;
        continue;
      }

      if (
        ch === '"'
      ) {
        inString = false;
      }

      continue;
    }

    if (
      ch === '"'
    ) {
      inString = true;
      continue;
    }

    if (
      ch === "{"
    ) {
      depth++;
    }
    else if (
      ch === "}"
    ) {
      depth--;

      if (
        depth === 0
      ) {
        return source.slice(
          start,
          i + 1
        );
      }
    }
  }

  return null;
}

function signature(
  values
) {
  return values
    .slice(
      0,
      5
    )
    .map(
      value =>
        String(
          value
        ).padStart(
          4,
          "0"
        )
    )
    .join("|");
}

function parsePlayBicho(
  html,
  date
) {
  const source =
    prepareJson(
      html
    );

  const regex =
    new RegExp(
      '\\{\\s*"id"\\s*:\\s*\\d+' +
      '\\s*,\\s*"raffleId"\\s*:\\s*\\d+' +
      '\\s*,\\s*"drawDate"\\s*:\\s*"' +
      date +
      '"',
      "g"
    );

  const rows = [];

  let match;

  while (
    (
      match =
        regex.exec(
          source
        )
    ) !== null
  ) {
    const raw =
      balancedObject(
        source,
        match.index
      );

    if (!raw) {
      throw new Error(
        "PB_OBJECT_ERROR=" +
        date
      );
    }

    const record =
      JSON.parse(
        raw
      );

    regex.lastIndex =
      match.index +
      raw.length;

    const raffle =
      record?.raffle ||
      {};

    if (
      record?.drawDate !==
        date ||
      record?.status !==
        "success" ||
      raffle?.stateCode !==
        "DF" ||
      raffle?.lottery !==
        "LBR"
    ) {
      continue;
    }

    const prizes =
      new Map();

    for (
      const draw of
      Array.isArray(
        record?.draws
      )
        ? record.draws
        : []
    ) {
      const positionMatch =
        String(
          draw?.position ||
          ""
        ).match(
          /^\s*([1-7])\s*º/
        );

      if (!positionMatch) {
        continue;
      }

      const position =
        Number(
          positionMatch[1]
        );

      let value =
        String(
          draw?.number ??
          ""
        ).replace(
          /\D+/g,
          ""
        );

      if (
        position >= 1 &&
        position <= 5
      ) {
        value =
          value.padStart(
            4,
            "0"
          );
      }
      else if (
        position === 6
      ) {
        value =
          value.padStart(
            4,
            "0"
          );
      }
      else if (
        position === 7
      ) {
        value =
          value.padStart(
            3,
            "0"
          );
      }

      prizes.set(
        position,
        value
      );
    }

    if (
      ![1,2,3,4,5]
        .every(
          pos =>
            /^\d{4}$/.test(
              prizes.get(pos) ||
              ""
            )
        )
    ) {
      continue;
    }

    const rawSlot =
      normalizeTime(
        raffle?.time
      );

    if (!rawSlot) {
      continue;
    }

    const p1to5 =
      [1,2,3,4,5]
        .map(
          pos =>
            prizes.get(pos)
        );

    const sum =
      p1to5
        .map(Number)
        .reduce(
          (a, b) =>
            a + b,
          0
        );

    rows.push({
      rawSlot,

      slot:
        canonicalSlot(
          rawSlot
        ),

      p1to5,

      signature:
        signature(
          p1to5
        ),

      p6:
        String(
          sum
        ).padStart(
          5,
          "0"
        ),

      p6Last4:
        String(
          prizes.get(6) ||
          ""
        ).padStart(
          4,
          "0"
        ),

      p7:
        String(
          prizes.get(7) ||
          ""
        ).padStart(
          3,
          "0"
        ),
    });
  }

  return rows;
}

function parseSpotBicho(
  html
) {
  const text =
    textOnly(
      html
    );

  const upper =
    text.toUpperCase();

  const needle =
    "RESULTADO LBR (";

  const rows = [];

  let cursor = 0;

  while (true) {
    const start =
      upper.indexOf(
        needle,
        cursor
      );

    if (
      start < 0
    ) {
      break;
    }

    const next =
      upper.indexOf(
        "RESULTADO ",
        start +
        needle.length
      );

    const segment =
      text.slice(
        start,
        next >= 0
          ? next
          : Math.min(
              text.length,
              start + 2500
            )
      );

    cursor =
      start +
      needle.length;

    const heading =
      segment.match(
        /RESULTADO\s+LBR\s*\(\s*([0-2]?\d:[0-5]\d)\s*\)/i
      );

    if (!heading) {
      continue;
    }

    const p1to5 = [];

    for (
      let position = 1;
      position <= 5;
      position++
    ) {
      const result =
        segment.match(
          new RegExp(
            position +
            "º\\s*Pr[eê]mio\\s+(\\d{4})",
            "i"
          )
        );

      if (!result) {
        p1to5.length = 0;
        break;
      }

      p1to5.push(
        result[1]
      );
    }

    if (
      p1to5.length !==
      5
    ) {
      continue;
    }

    const p6 =
      segment.match(
        /6º\s*Pr[eê]mio(?:\s*\(\s*Soma\s*\))?\s+(\d{4,5})/i
      );

    const p7 =
      segment.match(
        /7º\s*Pr[eê]mio\s+(\d{3,4})/i
      );

    if (
      !p6 ||
      !p7
    ) {
      continue;
    }

    rows.push({
      sourceSlot:
        normalizeTime(
          heading[1]
        ),

      signature:
        signature(
          p1to5
        ),

      p1to5,

      p6Raw:
        String(
          p6[1]
        ),

      p7:
        String(
          p7[1]
        )
          .slice(-3)
          .padStart(
            3,
            "0"
          ),
    });
  }

  return rows;
}

function lotteryKeyOf(
  data
) {
  return String(
    data?.lottery_key ??
    data?.lotteryKey ??
    ""
  )
    .trim()
    .toUpperCase();
}

function slotOf(
  data
) {
  return String(
    data?.close_hour ??
    data?.closeHour ??
    data?.close ??
    ""
  ).trim();
}

function prizeValue(
  prize
) {
  return String(
    prize?.displayValue ??
    prize?.raw ??
    prize?.milhar ??
    ""
  );
}

function prizeMap(
  data
) {
  const map =
    new Map();

  for (
    const prize of
    Array.isArray(
      data?.prizes
    )
      ? data.prizes
      : []
  ) {
    const position =
      Number(
        prize?.position
      );

    if (
      Number.isInteger(
        position
      )
    ) {
      map.set(
        position,
        prize
      );
    }
  }

  return map;
}

function expectedValues(
  row
) {
  return [
    ...row.p1to5,
    row.p6,
    row.p7,
  ];
}

function completeMatch(
  data,
  expected
) {
  const map =
    prizeMap(
      data
    );

  for (
    let position = 1;
    position <= 7;
    position++
  ) {
    if (
      prizeValue(
        map.get(
          position
        )
      ) !==
      expected[
        position - 1
      ]
    ) {
      return false;
    }
  }

  return (
    Number(
      data?.prizesCount
    ) === 7 &&
    data?.prize_contract ===
      CONTRACT
  );
}

function firstFiveMatch(
  data,
  row
) {
  const map =
    prizeMap(
      data
    );

  for (
    let position = 1;
    position <= 5;
    position++
  ) {
    if (
      prizeValue(
        map.get(
          position
        )
      ) !==
      row.p1to5[
        position - 1
      ]
    ) {
      return false;
    }
  }

  return true;
}

async function getLbrDocs(
  db,
  date
) {
  const snapshot =
    await db
      .collection(
        "draws"
      )
      .where(
        "date",
        "==",
        date
      )
      .get();

  return snapshot.docs
    .filter(
      doc =>
        lotteryKeyOf(
          doc.data() ||
          {}
        ) ===
        "LBR"
    );
}

async function main() {
  const date =
    targetDate();

  const playBichoUrl =
    "https://playbicho.com/resultado-jogo-do-bicho/DF-do-dia-" +
    date;

  const spotBichoUrl =
    "https://blog.spotbicho.net/resultado/distrito-federal/" +
    brDate(
      date
    );

  console.log(
    `[LBR_AUTO] DATE=${date}`
  );

  const [
    pbResponse,
    spotResponse,
  ] =
    await Promise.all([
      request(
        playBichoUrl
      ).catch(
        () => ({
          status: 0,
          body: "",
        })
      ),

      request(
        spotBichoUrl
      ).catch(
        () => ({
          status: 0,
          body: "",
        })
      ),
    ]);

  console.log(
    `[LBR_AUTO] PLAYBICHO_HTTP=${pbResponse.status}`
  );

  console.log(
    `[LBR_AUTO] SPOTBICHO_HTTP=${spotResponse.status}`
  );

  /*
   * Fonte ainda não publicada:
   * não é erro operacional.
   * O scheduler tentará novamente.
   */
  if (
    pbResponse.status !== 200 ||
    spotResponse.status !== 200
  ) {
    console.log(
      "[LBR_AUTO] SOURCE_NOT_READY=YES"
    );

    return {
      ok: true,
      sourceReady: false,
      date,
    };
  }

  const pbRows =
    parsePlayBicho(
      pbResponse.body,
      date
    );

  const spotRows =
    parseSpotBicho(
      spotResponse.body
    );

  console.log(
    `[LBR_AUTO] PB_DRAWS=${pbRows.length}`
  );

  console.log(
    `[LBR_AUTO] SPOT_BLOCKS=${spotRows.length}`
  );

  const confirmed = [];
  const sourceHeld = [];

  const canonicalSeen =
    new Set();

  for (
    const row of
    pbRows
  ) {
    if (
      canonicalSeen.has(
        row.slot
      )
    ) {
      throw new Error(
        "LBR_CANONICAL_COLLISION=" +
        row.slot
      );
    }

    canonicalSeen.add(
      row.slot
    );

    const matches =
      spotRows.filter(
        spot =>
          spot.signature ===
          row.signature
      );

    if (
      matches.length !== 1
    ) {
      sourceHeld.push({
        slot:
          row.slot,

        reason:
          "SPOT_MATCHES_" +
          matches.length,
      });

      continue;
    }

    const spot =
      matches[0];

    const p6Last4 =
      row.p6.slice(
        -4
      );

    const pbP6Ok =
      row.p6Last4 ===
      p6Last4;

    const spotP6Ok =
      String(
        spot.p6Raw
      ).slice(
        -4
      ) ===
      p6Last4;

    const p7Ok =
      spot.p7 ===
      row.p7;

    if (
      !pbP6Ok ||
      !spotP6Ok ||
      !p7Ok
    ) {
      sourceHeld.push({
        slot:
          row.slot,

        reason:
          "P6_P7_MISMATCH",
      });

      continue;
    }

    confirmed.push({
      ...row,

      spotSlot:
        spot.sourceSlot,
    });
  }

  console.log(
    `[LBR_AUTO] SOURCE_CONFIRMED=${confirmed.length}`
  );

  console.log(
    `[LBR_AUTO] SOURCE_HELD=${sourceHeld.length}`
  );

  for (
    const held of
    sourceHeld
  ) {
    console.log(
      `[LBR_AUTO] HOLD slot=${held.slot} reason=${held.reason}`
    );
  }

  const db =
    getDb();

  const before =
    await getLbrDocs(
      db,
      date
    );

  const bySlot =
    new Map();

  for (
    const doc of
    before
  ) {
    const slot =
      slotOf(
        doc.data() ||
        {}
      );

    if (
      !bySlot.has(
        slot
      )
    ) {
      bySlot.set(
        slot,
        []
      );
    }

    bySlot
      .get(
        slot
      )
      .push(
        doc
      );
  }

  const payloadData = [];
  const writeTargets = [];

  let alreadyComplete = 0;

  for (
    const row of
    confirmed
  ) {
    const docs =
      bySlot.get(
        row.slot
      ) ||
      [];

    const expected =
      expectedValues(
        row
      );

    if (
      docs.length > 1
    ) {
      throw new Error(
        "LBR_DB_DUPLICATE=" +
        date +
        " " +
        row.slot
      );
    }

    if (
      docs.length === 1
    ) {
      const data =
        docs[0].data() ||
        {};

      if (
        completeMatch(
          data,
          expected
        )
      ) {
        alreadyComplete++;

        continue;
      }

      if (
        !firstFiveMatch(
          data,
          row
        )
      ) {
        throw new Error(
          "LBR_DB_P1P5_CONFLICT=" +
          date +
          " " +
          row.slot
        );
      }
    }

    const built =
      buildPayloadFromDraw({
        lotteryKey:
          "LBR",

        lotteryName:
          "LBR LOTERIAS",

        date,

        closeHour:
          row.slot,

        confirmed:
          true,

        sourcePrimary:
          "spotbicho",

        sourcePrimaryUrl:
          spotBichoUrl,

        sourceConfirmation:
          "playbicho",

        sourceConfirmationUrl:
          playBichoUrl,

        prizes:
          expected,
      });

    if (
      !Array.isArray(
        built?.data
      ) ||
      built.data.length !== 1
    ) {
      throw new Error(
        "LBR_PAYLOAD_FAILED=" +
        row.slot
      );
    }

    if (
      built.data[0]
        .prize_contract !==
      CONTRACT
    ) {
      throw new Error(
        "LBR_CONTRACT_FAILED=" +
        row.slot
      );
    }

    payloadData.push(
      built.data[0]
    );

    writeTargets.push({
      row,
      expected,
    });
  }

  console.log(
    `[LBR_AUTO] ALREADY_COMPLETE=${alreadyComplete}`
  );

  console.log(
    `[LBR_AUTO] WRITE_DRAWS=${payloadData.length}`
  );

  if (
    payloadData.length
  ) {
    const result =
      await importFromPayload({
        payload: {
          success:
            true,

          data:
            payloadData,
        },

        lotteryKey:
          "LBR",

        closeHour:
          null,

        skipIfAlreadyComplete:
          false,

        source:
          "external_consensus",

        ufOverride:
          "DF",
      });

    console.log(
      "[LBR_AUTO] IMPORT_RESULT=" +
      JSON.stringify(
        result
      )
    );
  }

  /*
   * Pós-write somente do que esta execução tentou gravar.
   */
  let postWritePass = 0;

  if (
    writeTargets.length
  ) {
    const after =
      await getLbrDocs(
        db,
        date
      );

    const afterBySlot =
      new Map();

    for (
      const doc of
      after
    ) {
      const slot =
        slotOf(
          doc.data() ||
          {}
        );

      if (
        !afterBySlot.has(
          slot
        )
      ) {
        afterBySlot.set(
          slot,
          []
        );
      }

      afterBySlot
        .get(
          slot
        )
        .push(
          doc
        );
    }

    for (
      const target of
      writeTargets
    ) {
      const docs =
        afterBySlot.get(
          target.row.slot
        ) ||
        [];

      if (
        docs.length !== 1
      ) {
        throw new Error(
          "LBR_POSTWRITE_COUNT=" +
          target.row.slot +
          ":" +
          docs.length
        );
      }

      if (
        !completeMatch(
          docs[0].data() ||
          {},
          target.expected
        )
      ) {
        throw new Error(
          "LBR_POSTWRITE_VALUE=" +
          target.row.slot
        );
      }

      postWritePass++;
    }
  }

  console.log(
    `[LBR_AUTO] POSTWRITE_PASS=${postWritePass}`
  );

  console.log(
    `[LBR_AUTO] COMPLETE_SOURCE_NOW=${alreadyComplete + postWritePass}/${confirmed.length}`
  );

  console.log(
    "[LBR_AUTO] RUNIMPORT_CALLED=0"
  );

  console.log(
    "[LBR_AUTO] TOP3_TRIGGER=0"
  );

  console.log(
    "[LBR_AUTO] DONE=YES"
  );

  return {
    ok:
      true,

    date,

    playBichoDraws:
      pbRows.length,

    spotBlocks:
      spotRows.length,

    confirmed:
      confirmed.length,

    held:
      sourceHeld.length,

    alreadyComplete,

    written:
      postWritePass,
  };
}

if (
  require.main ===
  module
) {
  main()
    .catch(
      error => {
        console.error(
          "[LBR_AUTO] ERROR=" +
          (
            error?.stack ||
            error?.message ||
            error
          )
        );

        process.exit(
          1
        );
      }
    );
}

module.exports = {
  main,
};