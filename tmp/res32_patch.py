from pathlib import Path
import sys

results_path = Path("src/pages/Results/Results.jsx")
service_path = Path("src/services/kingResultsService.js")

results = results_path.read_text(encoding="utf-8")
service = service_path.read_text(encoding="utf-8")

# ============================================================
# 1. RESULTS.JSX — IMPORTAR CALENDÁRIO CENTRAL
# ============================================================

old_import = '''import {
  getKingBoundsByUf,
  getKingResultsByDate,
  getKingResultsByRange,
} from "../../services/kingResultsService";'''

new_import = '''import {
  getExpectedDrawHoursForScope,
  getKingBoundsByUf,
  getKingResultsByDate,
  getKingResultsByRange,
} from "../../services/kingResultsService";'''

if old_import not in results:
    raise RuntimeError(
        "RES-32: bloco de importação do kingResultsService não encontrado."
    )

results = results.replace(old_import, new_import, 1)

# ============================================================
# 2. RESULTS.JSX — PRESERVAR MINUTOS, INCLUSIVE 19:20
# ============================================================

old_normalize = '''  const mISO = s.match(/^(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}))?$/);
  if (mISO) {
    return `${pad2(mISO[1])}:00`;
  }'''

new_normalize = '''  const mISO = s.match(/^(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}))?$/);
  if (mISO) {
    return `${pad2(mISO[1])}:${pad2(mISO[2])}`;
  }'''

if old_normalize not in results:
    raise RuntimeError(
        "RES-32: normalização de horário do Results.jsx não encontrada."
    )

results = results.replace(old_normalize, new_normalize, 1)

# ============================================================
# 3. RESULTS.JSX — REMOVER CALENDÁRIOS LOCAIS DUPLICADOS
# ============================================================

old_schedule_constants = '''const LOOK_EXPECTED_HOURS_DESC = [
  "23:00",
  "21:00",
  "18:00",
  "16:00",
  "14:00",
  "11:00",
  "09:00",
  "07:00",
];

const NACIONAL_EXPECTED_HOURS_DESC = [
  "23:00",
  "21:00",
  "17:00",
  "15:00",
  "12:00",
  "10:00",
  "08:00",
  "02:00",
];

'''

if old_schedule_constants not in results:
    raise RuntimeError(
        "RES-32: constantes locais de LOOK/NACIONAL não encontradas."
    )

results = results.replace(old_schedule_constants, "", 1)

old_rj_constants = '''const RJ_09H_START_YMD = "2024-01-05";
const RJ_EXPECTED_HOURS_BASE_DESC = ["21:00", "18:00", "16:00", "14:00", "11:00"];

'''

if old_rj_constants not in results:
    raise RuntimeError(
        "RES-32: constantes locais do calendário RJ não encontradas."
    )

results = results.replace(old_rj_constants, "", 1)

old_rj_function = '''function getExpectedRjHoursDesc(ymd) {
  const d = ymdToDateLocal(ymd);
  const dow = d instanceof Date && !Number.isNaN(d.getTime()) ? d.getDay() : -1;

  const out =
    dow === 0
      ? ["16:00", "14:00", "11:00"]
      : [...RJ_EXPECTED_HOURS_BASE_DESC];

  if (isYMD(ymd) && ymd >= RJ_09H_START_YMD) {
    out.push("09:00");
  }

  return out;
}

'''

if old_rj_function not in results:
    raise RuntimeError(
        "RES-32: função local getExpectedRjHoursDesc não encontrada."
    )

results = results.replace(old_rj_function, "", 1)

# ============================================================
# 4. RESULTS.JSX — SUBSTITUIR MONTAGEM DOS CARDS
#
# Datas históricas:
#   somente resultados reais.
#
# Data atual:
#   resultados reais + placeholders de horários válidos que
#   já chegaram, conforme calendário central.
# ============================================================

start_marker = "function buildExpectedDrawsForScope(scopeKey, orderedDraws, ymd) {"
end_marker = "\nfunction monthDaysWithDraws(draws) {"

start = results.find(start_marker)
end = results.find(end_marker, start)

if start == -1 or end == -1:
    raise RuntimeError(
        "RES-32: função buildExpectedDrawsForScope não localizada por inteiro."
    )

new_build_function = '''function buildExpectedDrawsForScope(scopeKey, orderedDraws, ymd) {
  const list = Array.isArray(orderedDraws) ? orderedDraws : [];
  const byHour = new Map();

  function getDisplayHour(draw) {
    return scopeKey === SCOPE_NACIONAL
      ? normalizeNacionalDisplayHour(draw)
      : normalizeHourLike(
          draw?.close_hour ||
            draw?.closeHour ||
            draw?.hour ||
            draw?.hora ||
            ""
        );
  }

  function sortByDisplayHourDesc(items) {
    return [...items].sort((a, b) => {
      const ha = hourToNum(
        a?.__slotHour || getDisplayHour(a)
      );
      const hb = hourToNum(
        b?.__slotHour || getDisplayHour(b)
      );
      return hb - ha;
    });
  }

  for (const d of list) {
    const h = getDisplayHour(d);
    if (!h) continue;
    if (!byHour.has(h)) byHour.set(h, d);
  }

  /*
   * Datas históricas nunca recebem cards artificiais.
   * A sequência exibida passa a ser exatamente a sequência
   * dos sorteios existentes no banco para aquele dia.
   *
   * Isso elimina, por exemplo, o card vazio de 18h em
   * 22/07/2026 e produz naturalmente a sequência 16h → 21h.
   */
  if (safeStr(ymd) !== todayYMDLocal()) {
    return sortByDisplayHourDesc(list);
  }

  /*
   * Federal continua exibindo somente os sorteios efetivamente
   * existentes, pois não possui uma grade diária contínua.
   */
  if (scopeKey === SCOPE_FEDERAL) {
    return sortByDisplayHourDesc(list);
  }

  const expectedHours = getExpectedDrawHoursForScope({
    uf: scopeKey,
    date: ymd,
  });

  const visibleExpectedHours = expectedHours.filter((hour) =>
    shouldShowExpectedHour(ymd, hour)
  );

  const result = visibleExpectedHours.map((hour) => {
    const found = byHour.get(hour);
    if (found) return found;

    return {
      __placeholder: true,
      __slotHour: hour,
      __placeholderKind: "compact",
      drawId: `placeholder_${scopeKey}_${ymd}_${hour}`,
      id: `placeholder_${scopeKey}_${ymd}_${hour}`,
      close_hour: hour,
      closeHour: hour,
      prizes: [],
    };
  });

  /*
   * Preserva resultados reais cujo horário não esteja na grade
   * esperada, evitando ocultar importações ou exceções legítimas.
   */
  const extraActual = list.filter((d) => {
    const h = getDisplayHour(d);
    return h && !visibleExpectedHours.includes(h);
  });

  return sortByDisplayHourDesc([...result, ...extraActual]);
}
'''

results = results[:start] + new_build_function + results[end:]

# ============================================================
# 5. SERVICE — CRIAR FONTE CENTRAL DE HORÁRIOS
# ============================================================

service_anchor = '''export const FEDERAL_DRAW_DOW = ["WEDNESDAY", "SATURDAY"]; // referência (UI)



function applyBoundsFloor'''

service_replacement = '''export const FEDERAL_DRAW_DOW = ["WEDNESDAY", "SATURDAY"]; // referência (UI)

/*
 * Calendário central utilizado pela interface de resultados.
 *
 * A lista é mantida em ordem decrescente porque essa é a ordem
 * visual da página Results.
 */
const RJ_09H_START_YMD = "2024-01-05";
const RJ_SATURDAY_19H20_START_YMD = "2026-07-18";
const RJ_WEDNESDAY_WITHOUT_18H_START_YMD = "2026-07-22";

const LOOK_EXPECTED_HOURS_DESC = [
  "23:00",
  "21:00",
  "18:00",
  "16:00",
  "14:00",
  "11:00",
  "09:00",
  "07:00",
];

const NACIONAL_EXPECTED_HOURS_DESC = [
  "23:00",
  "21:00",
  "17:00",
  "15:00",
  "12:00",
  "10:00",
  "08:00",
  "02:00",
];

function dayOfWeekFromYmd(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);

  if (!m) return -1;

  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    12,
    0,
    0
  );

  return Number.isNaN(d.getTime()) ? -1 : d.getDay();
}

/**
 * Retorna os horários esperados para a loteria e a data.
 *
 * Regras RJ atualmente confirmadas:
 * - domingo: 11h, 14h e 16h;
 * - sábado, desde 18/07/2026: 19h20 substitui 18h;
 * - quarta-feira, desde 22/07/2026: não existe sorteio de 18h;
 * - 09h existe desde 05/01/2024.
 *
 * Datas históricas são renderizadas pela página somente com
 * resultados reais. Esta função é usada para a grade do dia atual.
 */
export function getExpectedDrawHoursForScope({ uf, date }) {
  const scopeKey = canonicalScopeKey(uf);
  const ymd = normalizeToYMD(date);

  if (!ymd) return [];

  if (scopeKey === FEDERAL_SCOPE_CODE) {
    return [];
  }

  if (scopeKey === "LOOK") {
    return [...LOOK_EXPECTED_HOURS_DESC];
  }

  if (scopeKey === "NACIONAL") {
    return [...NACIONAL_EXPECTED_HOURS_DESC];
  }

  if (scopeKey !== RJ_LOTTERY_KEY) {
    return [];
  }

  const dow = dayOfWeekFromYmd(ymd);

  let hours;

  if (dow === 0) {
    hours = ["16:00", "14:00", "11:00"];
  } else if (dow === 6 && ymd >= RJ_SATURDAY_19H20_START_YMD) {
    hours = ["21:00", "19:20", "16:00", "14:00", "11:00"];
  } else {
    hours = ["21:00", "18:00", "16:00", "14:00", "11:00"];
  }

  if (
    dow === 3 &&
    ymd >= RJ_WEDNESDAY_WITHOUT_18H_START_YMD
  ) {
    hours = hours.filter((hour) => hour !== "18:00");
  }

  if (ymd >= RJ_09H_START_YMD) {
    hours.push("09:00");
  }

  return Array.from(new Set(hours));
}


function applyBoundsFloor'''

if service_anchor not in service:
    raise RuntimeError(
        "RES-32: ponto de inserção do calendário no service não encontrado."
    )

service = service.replace(service_anchor, service_replacement, 1)

# ============================================================
# 6. VALIDAÇÕES ESTÁTICAS
# ============================================================

required_results = [
    "getExpectedDrawHoursForScope",
    "safeStr(ymd) !== todayYMDLocal()",
    "placeholder_${scopeKey}_${ymd}_${hour}",
    "return `${pad2(mISO[1])}:${pad2(mISO[2])}`;",
]

for marker in required_results:
    if marker not in results:
        raise RuntimeError(
            f"RES-32: marcador obrigatório ausente em Results.jsx: {marker}"
        )

for forbidden in [
    "const LOOK_EXPECTED_HOURS_DESC",
    "const NACIONAL_EXPECTED_HOURS_DESC",
    "function getExpectedRjHoursDesc",
]:
    if forbidden in results:
        raise RuntimeError(
            f"RES-32: regra duplicada permaneceu no Results.jsx: {forbidden}"
        )

required_service = [
    "export function getExpectedDrawHoursForScope",
    'RJ_SATURDAY_19H20_START_YMD = "2026-07-18"',
    'RJ_WEDNESDAY_WITHOUT_18H_START_YMD = "2026-07-22"',
    'hours = ["21:00", "19:20", "16:00", "14:00", "11:00"]',
    'hours = hours.filter((hour) => hour !== "18:00")',
]

for marker in required_service:
    if marker not in service:
        raise RuntimeError(
            f"RES-32: marcador obrigatório ausente no service: {marker}"
        )

results_path.write_text(results, encoding="utf-8")
service_path.write_text(service, encoding="utf-8")

print("RES-32: arquivos alterados e validações estáticas concluídas.")
