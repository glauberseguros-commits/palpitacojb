/*
 * PALPITACO_RADAR_TOP1_TOP7_ENGINE_V1
 *
 * Motor exclusivo do Radar dos Bichos.
 *
 * Independencias obrigatorias:
 * - nao usa o motor TOP3;
 * - nao altera previsoes TOP3;
 * - nao acessa Firestore;
 * - nao busca resultados;
 * - nao conhece UI;
 * - nao depende de outro aplicativo.
 *
 * Entradas:
 *   D1, D2 e D3 = milhares historicas fornecidas
 *   pela camada de fonte do proprio Palpitaco.
 *
 * Saidas:
 *   TOP1 -> ranks 7, 6, 5 e 4
 *   TOP7 -> ranks 1 a 7
 *
 * Desempates sao deterministicos.
 * Math.random e proibido.
 */

export const RADAR_LEVELS =
  Object.freeze([
    92,
    85,
    80,
    75,
    70,
    65,
    60,
  ]);

export const RADAR_MODE_RANKS =
  Object.freeze({
    TOP1:
      Object.freeze([
        7,
        6,
        5,
        4,
      ]),

    TOP7:
      Object.freeze([
        1,
        2,
        3,
        4,
        5,
        6,
        7,
      ]),
  });

const RADAR_GROUPS =
  Object.freeze(
    Array.from(
      {
        length: 25,
      },
      (_, index) => ({
        id:
          index + 1,
      })
    )
  );

const RADAR_LINES =
  Object.freeze([
    Object.freeze([
      1,
      2,
      3,
      4,
      5,
    ]),

    Object.freeze([
      6,
      7,
      8,
      9,
      10,
    ]),

    Object.freeze([
      11,
      12,
      13,
      14,
      15,
    ]),

    Object.freeze([
      16,
      17,
      18,
      19,
      20,
    ]),

    Object.freeze([
      21,
      22,
      23,
      24,
      25,
    ]),
  ]);

function normalizeMode(
  value
) {
  const mode =
    String(
      value ||
      ''
    )
      .trim()
      .toUpperCase();

  if (
    mode !==
      'TOP1' &&
    mode !==
      'TOP7'
  ) {
    throw new Error(
      `RADAR_INVALID_MODE=${mode || 'EMPTY'}`
    );
  }

  return mode;
}

export function normalizeRadarMilhar(
  value
) {
  const text =
    String(
      value ??
      ''
    )
      .trim();

  if (
    !/^\d{1,4}$/.test(
      text
    )
  ) {
    throw new Error(
      `RADAR_INVALID_MILHAR=${text || 'EMPTY'}`
    );
  }

  return text.padStart(
    4,
    '0'
  );
}

function normalizeMilharList(
  value
) {
  const values =
    Array.isArray(
      value
    )
      ? value
      : [
          value,
        ];

  if (!values.length) {
    throw new Error(
      'RADAR_EMPTY_SOURCE'
    );
  }

  return values.map(
    normalizeRadarMilhar
  );
}

export function radarGroupFromMilhar(
  value
) {
  const milhar =
    normalizeRadarMilhar(
      value
    );

  const dezena =
    Number(
      milhar.slice(-2)
    );

  return dezena === 0
    ? 25
    : Math.ceil(
        dezena /
        4
      );
}

function buildStats(
  d1,
  d2,
  d3
) {
  const values = {
    d1:
      normalizeMilharList(
        d1
      ),

    d2:
      normalizeMilharList(
        d2
      ),

    d3:
      normalizeMilharList(
        d3
      ),
  };

  const counts =
    new Map(
      RADAR_GROUPS.map(
        (group) => [
          group.id,
          {
            d1: 0,
            d2: 0,
            d3: 0,
          },
        ]
      )
    );

  function apply(
    source,
    field
  ) {
    source.forEach(
      (milhar) => {
        const id =
          radarGroupFromMilhar(
            milhar
          );

        const current =
          counts.get(
            id
          );

        if (current) {
          current[field] +=
            1;
        }
      }
    );
  }

  apply(
    values.d1,
    'd1'
  );

  apply(
    values.d2,
    'd2'
  );

  apply(
    values.d3,
    'd3'
  );

  const groupStats =
    RADAR_GROUPS.map(
      (group) => {
        const current =
          counts.get(
            group.id
          );

        return {
          id:
            group.id,

          countD1:
            current.d1,

          countD2:
            current.d2,

          countD3:
            current.d3,

          total:
            current.d1 +
            current.d2 +
            current.d3,
        };
      }
    );

  const lineStats =
    RADAR_LINES.map(
      (
        groupIds,
        index
      ) => {
        const countD1 =
          groupIds.reduce(
            (
              total,
              id
            ) =>
              total +
              counts.get(id)
                .d1,
            0
          );

        const countD2 =
          groupIds.reduce(
            (
              total,
              id
            ) =>
              total +
              counts.get(id)
                .d2,
            0
          );

        const countD3 =
          groupIds.reduce(
            (
              total,
              id
            ) =>
              total +
              counts.get(id)
                .d3,
            0
          );

        return {
          number:
            index + 1,

          groupIds,

          countD1,
          countD2,
          countD3,

          total:
            countD1 +
            countD2 +
            countD3,
        };
      }
    );

  return {
    groupStats,
    lineStats,
  };
}

/*
 * Desempate deterministico derivado
 * exclusivamente de D1/D2/D3.
 */
function buildTieSeed(
  d1,
  d2,
  d3
) {
  const source =
    [
      normalizeMilharList(
        d1
      ),

      normalizeMilharList(
        d2
      ),

      normalizeMilharList(
        d3
      ),
    ]
      .flat()
      .join('|');

  let hash =
    2166136261;

  for (
    let index = 0;
    index <
    source.length;
    index += 1
  ) {
    hash ^=
      source.charCodeAt(
        index
      );

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return (
    hash >>>
    0
  );
}

function buildTieKey(
  seed,
  value,
  salt = 0
) {
  let mixed =
    (
      seed ^
      Math.imul(
        (
          Number(value) +
          Number(salt) *
          257
        ),
        0x9e3779b1
      )
    ) >>>
    0;

  mixed ^=
    mixed >>>
    16;

  mixed =
    Math.imul(
      mixed,
      0x85ebca6b
    ) >>>
    0;

  mixed ^=
    mixed >>>
    13;

  mixed =
    Math.imul(
      mixed,
      0xc2b2ae35
    ) >>>
    0;

  mixed ^=
    mixed >>>
    16;

  return (
    mixed >>>
    0
  );
}

function buildExactRanking(
  groupStats,
  lineStats,
  tieSeed
) {
  const selected = [];

  /*
   * Primeiro criterio:
   * retorno presente em D3,
   * mas ausente em D1.
   */
  const returnD3 =
    groupStats
      .filter(
        (group) =>
          group.countD3 >
            0 &&
          group.countD1 ===
            0
      )
      .sort(
        (
          a,
          b
        ) =>
          b.countD3 -
            a.countD3 ||
          b.total -
            a.total ||
          buildTieKey(
            tieSeed,
            a.id,
            11
          ) -
            buildTieKey(
              tieSeed,
              b.id,
              11
            )
      );

  for (
    const group
    of returnD3
  ) {
    if (
      selected.length >=
      4
    ) {
      break;
    }

    selected.push(
      group.id
    );
  }

  /*
   * Depois usa linhas ausentes em D1,
   * priorizando menor ocorrencia total.
   */
  const missingLines =
    lineStats
      .filter(
        (line) =>
          line.countD1 ===
          0
      )
      .sort(
        (
          a,
          b
        ) =>
          a.total -
            b.total ||
          buildTieKey(
            tieSeed,
            a.number,
            23
          ) -
            buildTieKey(
              tieSeed,
              b.number,
              23
            )
      );

  function fillLine(
    line
  ) {
    const candidates =
      groupStats
        .filter(
          (group) =>
            line.groupIds.includes(
              group.id
            ) &&
            !selected.includes(
              group.id
            )
        )
        .sort(
          (
            a,
            b
          ) =>
            b.total -
              a.total ||
            buildTieKey(
              tieSeed,
              a.id,
              line.number +
                41
            ) -
              buildTieKey(
                tieSeed,
                b.id,
                line.number +
                  41
              )
        );

    for (
      const group
      of candidates
    ) {
      if (
        selected.length >=
        7
      ) {
        break;
      }

      selected.push(
        group.id
      );
    }
  }

  if (
    missingLines[0]
  ) {
    fillLine(
      missingLines[0]
    );
  }

  if (
    selected.length <
    7
  ) {
    for (
      const line
      of missingLines.slice(
        1
      )
    ) {
      if (
        selected.length >=
        7
      ) {
        break;
      }

      fillLine(
        line
      );
    }
  }

  return groupStats
    .map(
      (group) => {
        const selectedIndex =
          selected.indexOf(
            group.id
          );

        return {
          ...group,

          score:
            selectedIndex >=
            0
              ? 1000 -
                selectedIndex
              : 0.01,
        };
      }
    )
    .sort(
      (
        a,
        b
      ) =>
        b.score -
          a.score ||
        a.id -
          b.id
    )
    .map(
      (
        group,
        index
      ) => ({
        ...group,

        rank:
          index + 1,

        probability:
          RADAR_LEVELS[
            index
          ] ??
          null,
      })
    );
}

export function buildRadarRanking({
  d1,
  d2,
  d3,
} = {}) {
  const tieSeed =
    buildTieSeed(
      d1,
      d2,
      d3
    );

  const {
    groupStats,
    lineStats,
  } =
    buildStats(
      d1,
      d2,
      d3
    );

  return buildExactRanking(
    groupStats,
    lineStats,
    tieSeed
  );
}

export function buildRadarSelection({
  mode = 'TOP1',
  d1,
  d2,
  d3,
} = {}) {
  const normalizedMode =
    normalizeMode(
      mode
    );

  const ranking =
    buildRadarRanking({
      d1,
      d2,
      d3,
    });

  return RADAR_MODE_RANKS[
    normalizedMode
  ]
    .map(
      (rank) =>
        ranking.find(
          (item) =>
            item.rank ===
            rank
        )
    )
    .filter(Boolean)
    .map(
      (item) => ({
        ...item,
        mode:
          normalizedMode,
        group:
          item.id,
      })
    );
}

export function radarOfficialDezenas(
  groupValue
) {
  const group =
    Number(
      groupValue
    );

  if (
    !Number.isInteger(
      group
    ) ||
    group <
      1 ||
    group >
      25
  ) {
    return [];
  }

  if (
    group ===
    25
  ) {
    return [
      '97',
      '98',
      '99',
      '00',
    ];
  }

  const first =
    (
      group -
      1
    ) *
      4 +
    1;

  return [
    first,
    first + 1,
    first + 2,
    first + 3,
  ].map(
    (value) =>
      String(
        value
      )
        .padStart(
          2,
          '0'
        )
  );
}

function sourceThousands({
  d1,
  d2,
  d3,
} = {}) {
  return [
    normalizeRadarMilhar(
      Array.isArray(
        d1
      )
        ? d1[0]
        : d1
    ),

    normalizeRadarMilhar(
      Array.isArray(
        d2
      )
        ? d2[0]
        : d2
    ),

    normalizeRadarMilhar(
      Array.isArray(
        d3
      )
        ? d3[0]
        : d3
    ),
  ];
}

function buildPrefixCandidates(
  source
) {
  const values =
    sourceThousands(
      source
    );

  const candidates = [];

  const add =
    (
      prefix,
      sourceIndex,
      tier,
      method
    ) => {
      if (
        !/^\d{2}$/.test(
          prefix
        )
      ) {
        return;
      }

      candidates.push({
        prefix,
        sourceIndex,
        tier,
        method,
      });
    };

  /*
   * TIER 1:
   * dois ultimos digitos.
   * D1 > D2 > D3.
   */
  values.forEach(
    (
      value,
      index
    ) => {
      add(
        value.slice(
          2,
          4
        ),
        index,
        1,
        'final'
      );
    }
  );

  /*
   * TIER 2:
   * par central.
   */
  values.forEach(
    (
      value,
      index
    ) => {
      add(
        value.slice(
          1,
          3
        ),
        index,
        2,
        'central'
      );
    }
  );

  /*
   * TIER 3:
   * par inicial.
   */
  values.forEach(
    (
      value,
      index
    ) => {
      add(
        value.slice(
          0,
          2
        ),
        index,
        3,
        'initial'
      );
    }
  );

  /*
   * TIER 4:
   * combinacoes internas de reserva.
   */
  const pairIndexes = [
    [
      0,
      2,
    ],
    [
      0,
      3,
    ],
    [
      1,
      3,
    ],
    [
      1,
      0,
    ],
    [
      2,
      0,
    ],
    [
      3,
      0,
    ],
    [
      2,
      1,
    ],
    [
      3,
      1,
    ],
    [
      3,
      2,
    ],
  ];

  pairIndexes.forEach(
    (
      [
        a,
        b,
      ]
    ) => {
      values.forEach(
        (
          value,
          index
        ) => {
          add(
            value[a] +
              value[b],
            index,
            4,
            `cross-${a}-${b}`
          );
        }
      );
    }
  );

  const seen =
    new Set();

  return candidates.filter(
    (candidate) => {
      if (
        seen.has(
          candidate.prefix
        )
      ) {
        return false;
      }

      seen.add(
        candidate.prefix
      );

      return true;
    }
  );
}

function fallbackPrefixCandidates(
  source,
  existing
) {
  const values =
    sourceThousands(
      source
    );

  const allDigits =
    values
      .join('')
      .split('')
      .filter(
        (digit) =>
          /^\d$/.test(
            digit
          )
      );

  const seed =
    allDigits.reduce(
      (
        total,
        digit
      ) =>
        total +
        Number(
          digit
        ),
      0
    ) %
    10;

  const firstDigit =
    values[0]?.[0] ||
    '0';

  const seen =
    new Set(
      existing.map(
        (candidate) =>
          candidate.prefix
      )
    );

  const output = [];

  /*
   * Fallback deterministico.
   * Nenhuma escolha aleatoria.
   */
  for (
    let step = 0;
    step <
    10;
    step += 1
  ) {
    const secondDigit =
      String(
        (
          seed +
          step
        ) %
        10
      );

    const prefix =
      firstDigit +
      secondDigit;

    if (
      seen.has(
        prefix
      )
    ) {
      continue;
    }

    seen.add(
      prefix
    );

    output.push({
      prefix,
      sourceIndex: 0,
      tier: 5,
      method:
        'deterministic-fallback',
    });
  }

  return output;
}

export function buildRadarNumberRows({
  group,
  d1,
  d2,
  d3,
} = {}) {
  const dezenas =
    radarOfficialDezenas(
      group
    );

  if (
    dezenas.length !==
    4
  ) {
    throw new Error(
      `RADAR_INVALID_GROUP=${group}`
    );
  }

  const source = {
    d1,
    d2,
    d3,
  };

  let candidates =
    buildPrefixCandidates(
      source
    );

  candidates = [
    ...candidates,
    ...fallbackPrefixCandidates(
      source,
      candidates
    ),
  ];

  return dezenas.map(
    (dezena) => {
      const numbers = [];

      const usedCentenas =
        new Set();

      const usedMilhares =
        new Set();

      for (
        const candidate
        of candidates
      ) {
        const milhar =
          `${candidate.prefix}${dezena}`;

        const centena =
          milhar.slice(
            -3
          );

        if (
          usedCentenas.has(
            centena
          ) ||
          usedMilhares.has(
            milhar
          )
        ) {
          continue;
        }

        usedCentenas.add(
          centena
        );

        usedMilhares.add(
          milhar
        );

        numbers.push({
          centena,
          milhar,
          tier:
            candidate.tier,
          method:
            candidate.method,
        });

        if (
          numbers.length ===
          3
        ) {
          break;
        }
      }

      return {
        dezena,
        numbers,
      };
    }
  );
}

export function radarMilharesFromRows(
  rows
) {
  return (
    Array.isArray(
      rows
    )
      ? rows
      : []
  ).flatMap(
    (row) =>
      (
        Array.isArray(
          row?.numbers
        )
          ? row.numbers
          : []
      ).map(
        (number) =>
          number.milhar
      )
  );
}

export function buildRadarCards({
  mode = 'TOP1',
  d1,
  d2,
  d3,
} = {}) {
  return buildRadarSelection({
    mode,
    d1,
    d2,
    d3,
  }).map(
    (item) => {
      const rows =
        buildRadarNumberRows({
          group:
            item.group,
          d1,
          d2,
          d3,
        });

      return {
        ...item,
        rows,
        milhares:
          radarMilharesFromRows(
            rows
          ),
      };
    }
  );
}

const radarTop1Top7Engine = {
  RADAR_LEVELS,
  RADAR_MODE_RANKS,
  normalizeRadarMilhar,
  radarGroupFromMilhar,
  buildRadarRanking,
  buildRadarSelection,
  radarOfficialDezenas,
  buildRadarNumberRows,
  radarMilharesFromRows,
  buildRadarCards,
};

export default radarTop1Top7Engine;