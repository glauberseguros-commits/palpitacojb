"use strict";

/*
 * PALPITACO JB
 * External Results Providers V1
 *
 * Escopo:
 * - POPULAR
 * - LBR
 *
 * IMPORTANTE:
 * - este módulo NÃO acessa Firestore;
 * - NÃO dispara TOP3;
 * - NÃO altera resultados existentes;
 * - preserva horários reais com minutos.
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/153.0.0.0 Safari/537.36";

function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || "").trim()
  );
}

function escapeRegex(value) {
  return String(value || "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function ymdParts(ymd) {
  const value =
    String(ymd || "").trim();

  if (!isISODate(value)) {
    throw new Error(
      `Data inválida: ${value}. Use YYYY-MM-DD.`
    );
  }

  const [
    year,
    month,
    day,
  ] =
    value.split("-");

  return {
    year,
    month,
    day,
  };
}

function ymdToBr(ymd) {
  const {
    year,
    month,
    day,
  } =
    ymdParts(ymd);

  return `${day}/${month}/${year}`;
}

function ymdToDashBr(ymd) {
  const {
    year,
    month,
    day,
  } =
    ymdParts(ymd);

  return `${day}-${month}-${year}`;
}

function ymdToShortDashBr(ymd) {
  const {
    year,
    month,
    day,
  } =
    ymdParts(ymd);

  return `${day}-${month}-${year.slice(-2)}`;
}

function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, hex) =>
        String.fromCodePoint(
          parseInt(hex, 16)
        )
    )
    .replace(
      /&#(\d+);/g,
      (_, dec) =>
        String.fromCodePoint(
          parseInt(dec, 10)
        )
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&ordm;/gi, "º")
    .replace(/&deg;/gi, "°")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&ccedil;/gi, "ç");
}

function htmlToText(html) {
  let text =
    String(html || "");

  text =
    text.replace(
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      " "
    );

  text =
    text.replace(
      /<style\b[^>]*>[\s\S]*?<\/style>/gi,
      " "
    );

  text =
    text.replace(
      /<(?:br|hr)\b[^>]*>/gi,
      " "
    );

  text =
    text.replace(
      /<\/(?:p|div|li|tr|h1|h2|h3|h4|section|article)>/gi,
      " "
    );

  text =
    text.replace(
      /<[^>]+>/g,
      " "
    );

  text =
    decodeHtmlEntities(text);

  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url) {
  if (typeof fetch !== "function") {
    throw new Error(
      "Node sem fetch global. É necessário Node 18+."
    );
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      30000
    );

  try {
    const response =
      await fetch(
        url,
        {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent": USER_AGENT,
            Accept:
              "text/html,application/xhtml+xml," +
              "application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
              "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          },
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP_${response.status} ${url}`
      );
    }

    return await response.text();
  }
  finally {
    clearTimeout(timer);
  }
}

function stripDateTokens(value) {
  return String(value || "")
    .replace(
      /\b\d{2}\/\d{2}\/\d{4}\b/g,
      " "
    )
    .replace(
      /\b\d{2}-\d{2}-\d{4}\b/g,
      " "
    )
    .replace(
      /\b\d{4}-\d{2}-\d{2}\b/g,
      " "
    );
}

function extractFirstFiveMilhares(segment) {
  const clean =
    stripDateTokens(segment);

  const matches =
    clean.match(/\b\d{4}\b/g) || [];

  return matches.slice(0, 5);
}

function containsOrderedSequence(
  text,
  values
) {
  const source =
    String(text || "");

  let cursor = 0;

  for (const value of values) {
    const index =
      source.indexOf(
        String(value),
        cursor
      );

    if (index < 0) {
      return false;
    }

    cursor =
      index +
      String(value).length;
  }

  return true;
}

/*
 * ============================================================
 * POPULAR
 * ============================================================
 *
 * Horários oficiais preservados:
 * 09:30
 * 11:00
 * 12:40
 * 14:00
 * 15:40
 * 17:00
 * 18:30
 */

const POPULAR_SLOT_DEFS = [
  {
    slot: "09:30",
    sourcePattern: "09:30",
  },
  {
    slot: "11:00",
    sourcePattern:
      "(?:11:00|11h(?:00)?)",
  },
  {
    slot: "12:40",
    sourcePattern: "12:40",
  },
  {
    slot: "14:00",
    sourcePattern:
      "(?:14:00|14h(?:00)?)",
  },
  {
    slot: "15:40",
    sourcePattern: "15:40",
  },
  {
    slot: "17:00",
    sourcePattern:
      "(?:17:00|17h(?:00)?)",
  },
  {
    slot: "18:30",
    sourcePattern: "18:30",
  },
];

function parsePopularHtml({
  html,
  date,
}) {
  const text =
    htmlToText(html);

  const upper =
    text.toUpperCase();

  const brDate =
    ymdToBr(date);

  const draws = [];

  for (
    const definition
    of POPULAR_SLOT_DEFS
  ) {
    const pattern =
      new RegExp(
        "RESULTADO\\s+DA\\s+POPULAR\\s+" +
          escapeRegex(brDate) +
          "\\s+" +
          definition.sourcePattern,
        "ig"
      );

    let match;
    let found = null;

    while (
      (match = pattern.exec(text))
    ) {
      const bodyStart =
        match.index +
        match[0].length;

      const nextHeading =
        upper.indexOf(
          "RESULTADO DA POPULAR",
          bodyStart
        );

      const segment =
        text.slice(
          bodyStart,
          nextHeading >= 0
            ? nextHeading
            : text.length
        );

      const prizes =
        extractFirstFiveMilhares(
          segment
        );

      if (prizes.length === 5) {
        found = {
          lotteryKey: "POPULAR",
          lotteryName:
            "LOTERIA POPULAR",
          date,
          closeHour:
            definition.slot,
          prizes,
        };

        break;
      }
    }

    if (found) {
      draws.push(found);
    }
  }

  return draws;
}

/*
 * ============================================================
 * EXTERNAL_EXACT_CONFIRMATION_V2
 * ============================================================
 *
 * Um draw externo somente é confirmado quando a segunda fonte
 * contém exatamente:
 *
 * - mesma data
 * - mesmo horário real
 * - mesmas 5 milhares, na mesma ordem
 *
 * Não existe alias de horário.
 * Não existe arredondamento.
 * Não existe confirmação global por sequência solta na página.
 */

function normalizeExternalPrize4(value) {
  const digits =
    String(value ?? "")
      .replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return digits
    .padStart(4, "0")
    .slice(-4);
}

function buildExactConfirmationKey(
  draw
) {
  const date =
    String(
      draw?.date || ""
    ).trim();

  const closeHour =
    String(
      draw?.closeHour || ""
    ).trim();

  const prizes =
    Array.isArray(
      draw?.prizes
    )
      ? draw.prizes
          .map(
            normalizeExternalPrize4
          )
      : [];

  if (
    !date ||
    !/^\d{2}:\d{2}$/.test(
      closeHour
    ) ||
    prizes.length !== 5 ||
    prizes.some(
      (value) =>
        !/^\d{4}$/.test(
          String(value || "")
        )
    )
  ) {
    return null;
  }

  return (
    date +
    "|" +
    closeHour +
    "|" +
    prizes.join(",")
  );
}

function parsePopularConfirmationHtml({
  html,
  date,
}) {
  const text =
    htmlToText(html);

  const targetDate =
    ymdToBr(date);

  const headingRegex =
    /LT\s+POPULAR\s*[–-]\s*(\d{1,2})h(\d{2})/gi;

  const headings =
    Array.from(
      text.matchAll(
        headingRegex
      )
    );

  const blocks = [];

  for (
    let index = 0;
    index < headings.length;
    index++
  ) {
    const heading =
      headings[index];

    const start =
      heading.index;

    const end =
      index + 1 <
      headings.length
        ? headings[index + 1].index
        : text.length;

    const segment =
      text.slice(
        start,
        end
      );

    const dateMatch =
      segment.match(
        /\b\d{2}\/\d{2}\/\d{4}\b/
      );

    if (
      !dateMatch ||
      dateMatch[0] !== targetDate
    ) {
      continue;
    }

    const hour =
      Number(
        heading[1]
      );

    const minute =
      Number(
        heading[2]
      );

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      continue;
    }

    const closeHour =
      `${pad2(hour)}:${pad2(minute)}`;

    const prizes =
      extractFirstFiveMilhares(
        segment
      );

    if (
      prizes.length !== 5
    ) {
      continue;
    }

    blocks.push({
      lotteryKey:
        "POPULAR",

      lotteryName:
        "LOTERIA POPULAR",

      date,

      closeHour,

      prizes,
    });
  }

  return blocks;
}

function canonicalLbrConfirmationHour(
  label
) {
  const value =
    String(
      label || ""
    ).trim();

  /*
   * Ex.:
   * 8 Horas (8h40min)
   * 10 Horas (10h30min)
   */
  let match =
    value.match(
      /\((\d{1,2})h(\d{2})min\)/i
    );

  if (match) {
    const hour =
      Number(
        match[1]
      );

    const minute =
      Number(
        match[2]
      );

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return (
        `${pad2(hour)}:${pad2(minute)}`
      );
    }

    return null;
  }

  /*
   * Ex.:
   * 00h40
   * 1h40
   * 16h40
   */
  match =
    value.match(
      /^(\d{1,2})h(\d{2})$/i
    );

  if (match) {
    const hour =
      Number(
        match[1]
      );

    const minute =
      Number(
        match[2]
      );

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return (
        `${pad2(hour)}:${pad2(minute)}`
      );
    }
  }

  /*
   * "15 Horas", "17 Horas" etc.
   *
   * Sem minuto explícito não há confirmação exata.
   */
  return null;
}

function parseLbrConfirmationHtml({
  html,
  date,
}) {
  const text =
    htmlToText(html);

  const targetDate =
    ymdToBr(date);

  const headingRegex =
    /LBR\s+Loterias\s+((?:\d{1,2})h\d{2}|(?:\d{1,2})\s+Horas(?:\s*\((?:\d{1,2})h\d{2}min\))?)/gi;

  const headings =
    Array.from(
      text.matchAll(
        headingRegex
      )
    );

  const blocks = [];

  for (
    let index = 0;
    index < headings.length;
    index++
  ) {
    const heading =
      headings[index];

    const start =
      heading.index;

    const end =
      index + 1 <
      headings.length
        ? headings[index + 1].index
        : text.length;

    const segment =
      text.slice(
        start,
        end
      );

    const dateMatch =
      segment.match(
        /\b\d{2}\/\d{2}\/\d{4}\b/
      );

    if (
      !dateMatch ||
      dateMatch[0] !== targetDate
    ) {
      continue;
    }

    const closeHour =
      canonicalLbrConfirmationHour(
        heading[1]
      );

    /*
     * Horário sem minuto explícito:
     * não entra no conjunto de confirmação.
     */
    if (!closeHour) {
      continue;
    }

    const prizes =
      extractFirstFiveMilhares(
        segment
      );

    if (
      prizes.length !== 5
    ) {
      continue;
    }

    blocks.push({
      lotteryKey:
        "LBR",

      lotteryName:
        "LBR LOTERIAS",

      date,

      closeHour,

      prizes,
    });
  }

  return blocks;
}

function buildExactConfirmationSet(
  draws
) {
  const set =
    new Set();

  for (
    const draw
    of Array.isArray(draws)
      ? draws
      : []
  ) {
    const key =
      buildExactConfirmationKey(
        draw
      );

    if (key) {
      set.add(key);
    }
  }

  return set;
}
/*
 * ============================================================
 * POPULAR_EXACT_CONSENSUS_2_OF_3_V3
 * ============================================================
 *
 * Fontes:
 * 1. O Que Deu no Jogo do Bicho
 * 2. Resultados JB Certo
 * 3. PlayBicho
 *
 * Um resultado somente recebe confirmed=true quando pelo menos
 * duas fontes independentes produzem exatamente o mesmo:
 *
 * date + closeHour nominal + 5 milhares
 *
 * Nenhuma fonte individual é suficiente.
 */

function parsePopularOQueDeuHtml({
  html,
  date,
}) {
  const text =
    htmlToText(html);

  const targetDate =
    ymdToBr(date);

  /*
   * A URL é específica da data, mas ainda exigimos
   * que a própria página contenha a data solicitada.
   */
  if (
    !text.includes(
      targetDate
    )
  ) {
    return [];
  }

  const upper =
    text.toUpperCase();

  const draws = [];

  for (
    const definition
    of POPULAR_SLOT_DEFS
  ) {
    const pattern =
      new RegExp(
        "RESULTADO\\s+DA\\s+POPULAR\\s+" +
          definition.sourcePattern +
          "\\s*-\\s*LOTERIA\\s+POPULAR",
        "ig"
      );

    let match;
    let found = null;

    while (
      (match = pattern.exec(text))
    ) {
      const bodyStart =
        match.index +
        match[0].length;

      const nextHeading =
        upper.indexOf(
          "RESULTADO DA POPULAR",
          bodyStart
        );

      const segment =
        text.slice(
          bodyStart,
          nextHeading >= 0
            ? nextHeading
            : text.length
        );

      const prizes =
        extractFirstFiveMilhares(
          segment
        );

      if (
        prizes.length !== 5
      ) {
        continue;
      }

      found = {
        lotteryKey:
          "POPULAR",

        lotteryName:
          "LOTERIA POPULAR",

        date,

        closeHour:
          definition.slot,

        prizes,
      };

      break;
    }

    if (found) {
      draws.push(found);
    }
  }

  return draws;
}

function parsePopularPlayBichoHtml({
  html,
  date,
}) {
  const text =
    htmlToText(html);

  const targetDate =
    ymdToBr(date);

  const headingRegex =
    /Resultado\s+do\s+Jogo\s+do\s+Bicho\s+Loteria\s+POPULAR\s*-\s*Recife\s*-\s*PE,\s*(\d{1,2})(?::(\d{2})|h)\s*,\s*1º\s+ao\s+(?:5º|10º)/gi;

  const headings =
    Array.from(
      text.matchAll(
        headingRegex
      )
    );

  const byExactTuple =
    new Map();

  for (
    const heading
    of headings
  ) {
    const bodyStart =
      heading.index +
      heading[0].length;

    /*
     * Termina o bloco no início do próximo
     * resultado de qualquer banca.
     */
    const nextResult =
      text.indexOf(
        "Resultado do Jogo do Bicho",
        bodyStart
      );

    const segment =
      text.slice(
        bodyStart,
        nextResult >= 0
          ? nextResult
          : text.length
      );

    const dateMatch =
      segment.match(
        /\b\d{2}\/\d{2}\/\d{4}\b/
      );

    if (
      !dateMatch ||
      dateMatch[0] !== targetDate
    ) {
      continue;
    }

    const hour =
      Number(
        heading[1]
      );

    const minute =
      heading[2] === undefined
        ? 0
        : Number(
            heading[2]
          );

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      continue;
    }

    const closeHour =
      `${pad2(hour)}:${pad2(minute)}`;

    const prizes =
      extractFirstFiveMilhares(
        segment
      );

    if (
      prizes.length !== 5
    ) {
      continue;
    }

    const draw = {
      lotteryKey:
        "POPULAR",

      lotteryName:
        "LOTERIA POPULAR",

      date,

      closeHour,

      prizes,
    };

    const key =
      buildExactConfirmationKey(
        draw
      );

    if (
      key &&
      !byExactTuple.has(key)
    ) {
      byExactTuple.set(
        key,
        draw
      );
    }
  }

  return Array.from(
    byExactTuple.values()
  );
}

function buildPopularConsensusResults({
  date,
  sourceResults,
}) {
  const sourcePriority = [
    "oquedeunojogodobicho",
    "resultadosjbcerto",
    "playbicho",
  ];

  const bySlot =
    new Map();

  for (
    const source
    of sourceResults
  ) {
    for (
      const draw
      of Array.isArray(
        source.draws
      )
        ? source.draws
        : []
    ) {
      const exactKey =
        buildExactConfirmationKey(
          draw
        );

      if (!exactKey) {
        continue;
      }

      const slot =
        draw.closeHour;

      if (
        !bySlot.has(slot)
      ) {
        bySlot.set(
          slot,
          new Map()
        );
      }

      const byTuple =
        bySlot.get(
          slot
        );

      const prizeKey =
        draw.prizes
          .map(
            normalizeExternalPrize4
          )
          .join(",");

      if (
        !byTuple.has(
          prizeKey
        )
      ) {
        byTuple.set(
          prizeKey,
          {
            draw: {
              ...draw,
            },

            sources:
              new Map(),
          }
        );
      }

      byTuple
        .get(prizeKey)
        .sources
        .set(
          source.name,
          {
            name:
              source.name,

            url:
              source.url,
          }
        );
    }
  }

  const output = [];

  for (
    const [
      closeHour,
      groupsMap,
    ]
    of bySlot.entries()
  ) {
    const groups =
      Array.from(
        groupsMap.values()
      );

    groups.sort(
      (a, b) =>
        b.sources.size -
        a.sources.size
    );

    const quorum =
      groups.filter(
        (group) =>
          group.sources.size >= 2
      );

    /*
     * Apenas um tuple pode possuir quorum.
     * Caso contrário tratamos o slot como conflito.
     */
    const chosen =
      quorum.length === 1
        ? quorum[0]
        : groups[0];

    if (!chosen) {
      continue;
    }

    const orderedSources =
      sourcePriority
        .filter(
          (name) =>
            chosen.sources.has(
              name
            )
        )
        .map(
          (name) =>
            chosen.sources.get(
              name
            )
        );

    const primary =
      orderedSources[0] ||
      null;

    const confirmation =
      orderedSources[1] ||
      null;

    output.push({
      ...chosen.draw,

      date,

      closeHour,

      source:
        "external_consensus",

      sourcePrimary:
        primary?.name ||
        null,

      sourcePrimaryUrl:
        primary?.url ||
        null,

      sourceConfirmation:
        confirmation?.name ||
        null,

      sourceConfirmationUrl:
        confirmation?.url ||
        null,

      consensusCount:
        chosen.sources.size,

      consensusSources:
        orderedSources.map(
          (item) =>
            item.name
        ),

      confirmed:
        quorum.length === 1,
    });
  }

  return output.sort(
    (a, b) =>
      a.closeHour.localeCompare(
        b.closeHour
      )
  );
}
async function fetchPopularResults(
  date
) {
  ymdParts(date);

  const oQueDeuUrl =
    "https://oquedeunojogodobicho.com.br/" +
    "resultado-da-popular/" +
    ymdToDashBr(date) +
    "/";

  const jbCertoUrl =
    "https://resultadosjbcerto.com.br/popular/";

  const playBichoUrl =
    "https://playbicho.com/resultado-jogo-do-bicho/PE";

  const sourceDefinitions = [
    {
      name:
        "oquedeunojogodobicho",

      url:
        oQueDeuUrl,

      parser:
        parsePopularOQueDeuHtml,
    },

    {
      name:
        "resultadosjbcerto",

      url:
        jbCertoUrl,

      parser:
        parsePopularConfirmationHtml,
    },

    {
      name:
        "playbicho",

      url:
        playBichoUrl,

      parser:
        parsePopularPlayBichoHtml,
    },
  ];

  /*
   * Uma fonte fora do ar não derruba automaticamente
   * a POPULAR. Precisamos de pelo menos duas fontes
   * concordantes, não obrigatoriamente das três.
   */
  const sourceResults =
    await Promise.all(
      sourceDefinitions.map(
        async (source) => {
          try {
            const html =
              await fetchHtml(
                source.url
              );

            const draws =
              source.parser({
                html,
                date,
              });

            return {
              name:
                source.name,

              url:
                source.url,

              ok:
                true,

              draws,
            };
          }
          catch (error) {
            return {
              name:
                source.name,

              url:
                source.url,

              ok:
                false,

              error:
                error?.message ||
                String(error),

              draws: [],
            };
          }
        }
      )
    );

  const availableSources =
    sourceResults.filter(
      (source) =>
        source.ok
    );

  if (
    availableSources.length < 2
  ) {
    throw new Error(
      "POPULAR_CONSENSUS_SOURCES_AVAILABLE=" +
        availableSources.length
    );
  }

  const draws =
    buildPopularConsensusResults({
      date,
      sourceResults,
    });

  return {
    lotteryKey:
      "POPULAR",

    date,

    /*
     * Mantidos por compatibilidade com chamadas
     * anteriores.
     */
    primaryUrl:
      oQueDeuUrl,

    confirmationUrl:
      jbCertoUrl,

    playBichoUrl,

    consensusRequired:
      2,

    sources:
      sourceResults.map(
        (source) => ({
          name:
            source.name,

          url:
            source.url,

          ok:
            source.ok,

          draws:
            source.draws.length,

          error:
            source.error ||
            null,
        })
      ),

    draws,
  };
}
/*
 * ============================================================
 * LBR
 * ============================================================
 *
 * Não existe arredondamento de minuto.
 *
 * Exemplo:
 * 00h40 -> 00:40
 * 14h40 -> 14:40
 */

/*
 * LBR_SPECIAL_PRIZE_CONTRACT_V3
 *
 * Estrutura própria da LBR:
 *
 * 1º ao 5º -> 4 dígitos
 * 6º       -> Soma de 5 dígitos
 * 7º       -> Multiplicação de 3 dígitos
 *
 * P6 e P7 NÃO são milhares convencionais.
 */
function extractLbrSevenPrizes(
  segment
) {
  const text =
    String(
      segment || ""
    )
      .replace(
        /\u00a0/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      );

  const definitions = [
    /\b1(?:º|°|o)?\s+(\d{4})\b/i,
    /\b2(?:º|°|o)?\s+(\d{4})\b/i,
    /\b3(?:º|°|o)?\s+(\d{4})\b/i,
    /\b4(?:º|°|o)?\s+(\d{4})\b/i,
    /\b5(?:º|°|o)?\s+(\d{4})\b/i,
    /\b6(?:º|°|o)?\s+(\d{5})\s+Soma\b/i,
    /\b7(?:º|°|o)?\s+(\d{3})\s+Multiplica(?:ção|cao)\b/i,
  ];

  const prizes = [];

  for (
    const pattern
    of definitions
  ) {
    const match =
      text.match(
        pattern
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
function parseLbrHtml({
  html,
  date,
}) {
  const text =
    htmlToText(html);

  const headingRegex =
    /Sorteio\s+(\d{1,2})h(\d{2})/gi;

  const matches =
    Array.from(
      text.matchAll(
        headingRegex
      )
    );

  const targetDate =
    ymdToBr(date);

  const bySlot =
    new Map();

  for (
    let index = 0;
    index < matches.length;
    index++
  ) {
    const match =
      matches[index];

    const start =
      match.index;

    const end =
      index + 1 < matches.length
        ? matches[index + 1].index
        : text.length;

    const segment =
      text.slice(
        start,
        end
      );

    const segmentDate =
      segment.match(
        /\b\d{2}\/\d{2}\/\d{4}\b/
      );

    if (
      !segmentDate ||
      segmentDate[0] !== targetDate
    ) {
      continue;
    }

    const hour =
      Number(match[1]);

    const minute =
      Number(match[2]);

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      continue;
    }

    const closeHour =
      `${pad2(hour)}:${pad2(minute)}`;

    const prizes =
      extractLbrSevenPrizes(
        segment
      );

    if (
      prizes.length !== 7
    ) {
      continue;
    }

    if (
      !bySlot.has(closeHour)
    ) {
      bySlot.set(
        closeHour,
        {
          lotteryKey: "LBR",
          lotteryName:
            "LBR LOTERIAS",
          date,
          closeHour,
          prizes,
        }
      );
    }
  }

  return Array.from(
    bySlot.values()
  ).sort(
    (a, b) =>
      a.closeHour.localeCompare(
        b.closeHour
      )
  );
}

async function fetchLbrResults(
  date
) {
  ymdParts(date);

  const primaryUrl =
    "https://deunopostecarioca.com.br/brasilia";

  const confirmationUrl =
    "https://bicholoterias.com.br/" +
    "resultado-lbr-loterias/" +
    ymdToShortDashBr(date) +
    "/";

  const [
    primaryHtml,
    confirmationHtml,
  ] =
    await Promise.all([
      fetchHtml(primaryUrl),
      fetchHtml(confirmationUrl),
    ]);

  const draws =
    parseLbrHtml({
      html: primaryHtml,
      date,
    });

  const confirmationDraws =
    parseLbrConfirmationHtml({
      html:
        confirmationHtml,

      date,
    });

  const confirmationSet =
    buildExactConfirmationSet(
      confirmationDraws
    );

  const normalized =
    draws.map((draw) => {
      const exactKey =
        buildExactConfirmationKey({
          ...draw,

          prizes:
            Array.isArray(
              draw?.prizes
            )
              ? draw.prizes.slice(
                  0,
                  5
                )
              : [],
        });

      return {
        ...draw,

        source:
          "external_consensus",

        sourcePrimary:
          "deunopostecarioca",

        sourcePrimaryUrl:
          primaryUrl,

        sourceConfirmation:
          "bicholoterias",

        sourceConfirmationUrl:
          confirmationUrl,

        confirmed:
          Boolean(
            exactKey &&
            confirmationSet.has(
              exactKey
            )
          ),
      };
    });
  return {
    lotteryKey: "LBR",
    date,
    primaryUrl,
    confirmationUrl,
    draws: normalized,
  };
}

async function fetchExternalResults({
  lotteryKey,
  date,
}) {
  const key =
    String(
      lotteryKey || ""
    )
      .trim()
      .toUpperCase();

  if (key === "POPULAR") {
    return fetchPopularResults(
      date
    );
  }

  if (key === "LBR") {
    return fetchLbrResults(
      date
    );
  }

  throw new Error(
    `Provider externo inexistente: ${key}`
  );
}

module.exports = {
  POPULAR_SLOT_DEFS,

  htmlToText,

  parsePopularHtml,
  parseLbrHtml,

  parsePopularConfirmationHtml,
  parseLbrConfirmationHtml,
  buildExactConfirmationKey,

  parsePopularOQueDeuHtml,
  parsePopularPlayBichoHtml,
  buildPopularConsensusResults,

  fetchPopularResults,
  fetchLbrResults,
  fetchExternalResults,
};