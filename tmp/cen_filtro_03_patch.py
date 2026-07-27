from pathlib import Path
import sys

target = Path("src/pages/Centenas/CentenasView.jsx")
text = target.read_text(encoding="utf-8")

original = text

anchor_bucket = '''function toHourBucketHH00(value) {
  const norm = normalizeHourLike(value);
  if (!norm) return "";
  const m = String(norm).match(/^(\\d{2})/);
  if (!m) return "";
  const hh = m[1];
  const n = Number(hh);
  if (!Number.isFinite(n) || n < 0 || n > 23) return "";
  return `${hh}:00`;
}
'''

replacement_bucket = '''function toHourBucketHH00(value) {
  const norm = normalizeHourLike(value);
  if (!norm) return "";
  const m = String(norm).match(/^(\\d{2})/);
  if (!m) return "";
  const hh = m[1];
  const n = Number(hh);
  if (!Number.isFinite(n) || n < 0 || n > 23) return "";
  return `${hh}:00`;
}

/*
 * LOOK e NACIONAL chegam da fonte com horários de fechamento
 * próximos do horário oficial exibido ao usuário.
 *
 * Exemplos:
 * - NACIONAL 01:49 -> 02:00
 * - NACIONAL 07:49 -> 08:00
 * - NACIONAL 22:49 -> 23:00
 *
 * A normalização precisa ocorrer antes do filtro da página.
 */
const OFFICIAL_HOURS_BY_LOTTERY = Object.freeze({
  LOOK: Object.freeze([
    "07:00",
    "09:00",
    "11:00",
    "14:00",
    "16:00",
    "18:00",
    "21:00",
    "23:00",
  ]),
  NACIONAL: Object.freeze([
    "02:00",
    "08:00",
    "10:00",
    "12:00",
    "15:00",
    "17:00",
    "21:00",
    "23:00",
  ]),
});

function hourToMinutes(value) {
  const norm = normalizeHourLike(value);
  const match = String(norm).match(/^(\\d{2}):(\\d{2})$/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

function normalizeOfficialHourForLottery(lotteryKey, value) {
  const rawBucket = toHourBucketHH00(value);
  const normalizedLotteryKey = String(lotteryKey || "")
    .trim()
    .toUpperCase();

  const officialHours =
    OFFICIAL_HOURS_BY_LOTTERY[normalizedLotteryKey];

  if (!Array.isArray(officialHours) || !officialHours.length) {
    return rawBucket;
  }

  const rawMinutes = hourToMinutes(value);

  if (!Number.isFinite(rawMinutes)) {
    return rawBucket;
  }

  let bestHour = "";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const officialHour of officialHours) {
    const officialMinutes = hourToMinutes(officialHour);

    if (!Number.isFinite(officialMinutes)) continue;

    const directDistance = Math.abs(
      rawMinutes - officialMinutes
    );

    const circularDistance = Math.min(
      directDistance,
      1440 - directDistance
    );

    if (circularDistance < bestDistance) {
      bestDistance = circularDistance;
      bestHour = officialHour;
    }
  }

  /*
   * Limite defensivo:
   * só converte horários que estejam no máximo 90 minutos
   * distantes de um horário oficial.
   */
  return bestHour && bestDistance <= 90
    ? bestHour
    : rawBucket;
}

function shouldFilterHourInsideService(lotteryKey) {
  const key = String(lotteryKey || "")
    .trim()
    .toUpperCase();

  return key !== LOTTERY_KEYS.LOOK &&
    key !== LOTTERY_KEYS.NACIONAL;
}
'''

if anchor_bucket not in text:
    sys.exit(
        "ERRO: âncora toHourBucketHH00 não encontrada. "
        "Nenhuma alteração foi realizada."
    )

text = text.replace(
    anchor_bucket,
    replacement_bucket,
    1,
)

anchor_draw_filter = '''      const ymd = entry?.ymd || "";
      const hr = entry?.hourBucket || entry?.hourNorm || "";
      if (!ymd) return false;
'''

replacement_draw_filter = '''      const ymd = entry?.ymd || "";
      const lotteryKey =
        entry?.lotteryKey ||
        entry?.__centenasLotteryKey ||
        "";

      const hrRaw =
        entry?.hourNorm ||
        entry?.hourBucket ||
        "";

      const hr =
        normalizeOfficialHourForLottery(
          lotteryKey,
          hrRaw
        );

      if (!ymd) return false;
'''

if anchor_draw_filter not in text:
    sys.exit(
        "ERRO: âncora do filtro draw-level não encontrada. "
        "Nenhuma alteração foi gravada."
    )

text = text.replace(
    anchor_draw_filter,
    replacement_draw_filter,
    1,
)

anchor_service_call = '''                      closeHour:
                        requestedCloseHour,
                      positions:
                        requestedPrizePositions,
'''

replacement_service_call = '''                      /*
                       * PT Rio e Federal podem ser filtradas
                       * diretamente no serviço.
                       *
                       * LOOK e NACIONAL precisam chegar completas,
                       * pois o horário bruto da fonte não é
                       * necessariamente igual ao horário oficial.
                       */
                      closeHour:
                        requestedCloseHour &&
                        shouldFilterHourInsideService(
                          lotteryKey
                        )
                          ? requestedCloseHour
                          : null,
                      positions:
                        requestedPrizePositions,
'''

if anchor_service_call not in text:
    sys.exit(
        "ERRO: âncora da chamada getKingResultsByRange "
        "não encontrada. Nenhuma alteração foi gravada."
    )

text = text.replace(
    anchor_service_call,
    replacement_service_call,
    1,
)

anchor_entry_draw = '''              entries.push({
                lotteryKey,
                ymd,
                hourNorm,
                hourBucket,
                prizes,
              });
'''

replacement_entry_draw = '''              entries.push({
                lotteryKey,
                ymd,
                hourNorm,
                hourBucket:
                  normalizeOfficialHourForLottery(
                    lotteryKey,
                    hourNorm || hourBucket
                  ),
                prizes,
              });
'''

if anchor_entry_draw not in text:
    sys.exit(
        "ERRO: âncora da entrada hidratada não encontrada. "
        "Nenhuma alteração foi gravada."
    )

text = text.replace(
    anchor_entry_draw,
    replacement_entry_draw,
    1,
)

anchor_flat_map = '''                map.set(key, {
                  lotteryKey,
                  ymd,
                  hourNorm,
                  hourBucket,
                  prizes: [],
                });
'''

replacement_flat_map = '''                map.set(key, {
                  lotteryKey,
                  ymd,
                  hourNorm,
                  hourBucket:
                    normalizeOfficialHourForLottery(
                      lotteryKey,
                      hourNorm || hourBucket
                    ),
                  prizes: [],
                });
'''

if anchor_flat_map not in text:
    sys.exit(
        "ERRO: âncora do agrupamento de prêmios não encontrada. "
        "Nenhuma alteração foi gravada."
    )

text = text.replace(
    anchor_flat_map,
    replacement_flat_map,
    1,
)

if text == original:
    sys.exit("ERRO: o conteúdo permaneceu inalterado.")

target.write_text(text, encoding="utf-8", newline="\n")

print("PATCH_OK")
print(f"Arquivo alterado: {target}")
print(
    "Correções: consulta LOOK/NACIONAL sem corte prematuro "
    "e normalização para horários oficiais."
)
