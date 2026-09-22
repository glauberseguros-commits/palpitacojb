/*
 * PALPITACO_GLOBAL_LOTTERY_CATALOG_V1
 *
 * Fonte global de identidade das loterias.
 *
 * IMPORTANTE:
 * - presença no catálogo NÃO significa motor TOP3 disponível;
 * - presença no catálogo NÃO inventa fonte de resultados;
 * - horários continuam pertencendo a schedule.js;
 * - provedores continuam independentes.
 */

export const LOTTERY_CATALOG_GLOBAL = Object.freeze([
  { key: "FEDERAL", label: "Federal", slug: "federal" },
  { key: "MALUCA_FEDERAL", label: "Maluca Federal", slug: "maluca-federal" },
  { key: "PT_RIO", label: "Rio de Janeiro", slug: "rj" },
  { key: "MALUQUINHA_RIO", label: "Maluquinha Rio", slug: "maluquinha-rio" },
  { key: "NACIONAL", label: "Nacional", slug: "nacional" },
  { key: "LOOK", label: "LOOK", slug: "look" },
  { key: "BOA_SORTE", label: "Boa Sorte", slug: "boa-sorte" },
  { key: "LOTEP", label: "LOTEP", slug: "lotep" },
  { key: "LOTECE", label: "LOTECE", slug: "lotece" },
  { key: "POPULAR", label: "Popular", slug: "popular" },
  { key: "BAHIA", label: "Bahia", slug: "bahia" },
  { key: "BA_MALUCA", label: "BA Maluca", slug: "ba-maluca" },
  { key: "PT_SP", label: "São Paulo", slug: "sp" },
  { key: "MINAS", label: "Minas", slug: "minas" },
  { key: "SORTE", label: "Sorte", slug: "sorte" },
  { key: "LBR", label: "LBR", slug: "lbr" },
  { key: "CAPITAL", label: "Capital", slug: "capital" },
  { key: "PT_PB", label: "Paratodos PB", slug: "pt-pb" },
  { key: "AVAL_PE", label: "Aval PE", slug: "aval-pe" },
  { key: "TRADICIONAL", label: "Tradicional", slug: "tradicional" },
]);

export const LOTTERY_CATALOG_DISPLAY_GLOBAL =
  Object.freeze(
    [...LOTTERY_CATALOG_GLOBAL].sort((a, b) =>
      a.label.localeCompare(
        b.label,
        "pt-BR",
        { sensitivity: "base" }
      )
    )
  );

export const LOTTERY_OPTIONS_GLOBAL =
  Object.freeze(
    LOTTERY_CATALOG_DISPLAY_GLOBAL.map(
      (item) =>
        Object.freeze({
          value: item.key,
          label: item.label,
        })
    )
  );

export const LOTTERY_KEYS_GLOBAL =
  Object.freeze(
    LOTTERY_CATALOG_GLOBAL.map(
      (item) => item.key
    )
  );

const LOTTERY_KEY_SET =
  new Set(
    LOTTERY_KEYS_GLOBAL
  );

const LOTTERY_ALIAS_MAP =
  Object.freeze({
    RJ: "PT_RIO",
    RIO: "PT_RIO",
    "PT-RIO": "PT_RIO",
    "PT RIO": "PT_RIO",

    SP: "PT_SP",
    "PT-SP": "PT_SP",
    "PT SP": "PT_SP",

    FED: "FEDERAL",
    BR: "FEDERAL",
    BRASIL: "FEDERAL",

    GO: "LOOK",

    LT_NACIONAL: "NACIONAL",
    "LT-NACIONAL": "NACIONAL",

    PARATODOS_PB: "PT_PB",
    "PARATODOS PB": "PT_PB",
    "PARA TODOS PB": "PT_PB",

    "AVAL-PE": "AVAL_PE",
    "AVAL PE": "AVAL_PE",
  });

export function normalizeLotteryKeyGlobal(
  value
) {
  const raw =
    String(value || "")
      .trim()
      .toUpperCase();

  if (!raw) {
    return "";
  }

  const alias =
    LOTTERY_ALIAS_MAP[raw];

  if (alias) {
    return alias;
  }

  if (
    LOTTERY_KEY_SET.has(raw)
  ) {
    return raw;
  }

  return "";
}

export function getLotteryGlobal(
  value
) {
  const key =
    normalizeLotteryKeyGlobal(
      value
    );

  if (!key) {
    return null;
  }

  return (
    LOTTERY_CATALOG_GLOBAL.find(
      (item) =>
        item.key === key
    ) || null
  );
}

export function getLotteryLabelGlobal(
  value
) {
  return (
    getLotteryGlobal(value)?.label ||
    String(value || "")
  );
}

export function getLotterySlugGlobal(
  value
) {
  return (
    getLotteryGlobal(value)?.slug ||
    ""
  );
}

export function getLotteryKeyBySlugGlobal(
  slug
) {
  const normalized =
    String(slug || "")
      .trim()
      .toLowerCase();

  return (
    LOTTERY_CATALOG_GLOBAL.find(
      (item) =>
        item.slug === normalized
    )?.key || ""
  );
}
