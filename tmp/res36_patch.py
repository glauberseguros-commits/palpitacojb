from pathlib import Path
import sys

target = Path("src/services/kingResultsService.js")
text = target.read_text(encoding="utf-8")

old = r'''async function fetchDrawDocsPreferUf({
  uf,
  extraWheres = [],
  extraOrderBy = null,
  extraLimit = null,
  policy = DEFAULT_READ_POLICY,
}) {
  const ufTrim = String(extractUfParam(uf) || "").trim();
  const ufUp = ufTrim.toUpperCase();

  if (isFederalInput(ufUp)) {
    for (const lk of FEDERAL_LOTTERY_KEYS) {
      const { snap, error } = await queryDrawsByField({
        fieldName: "lottery_key",
        uf: lk,
        extraWheres,
        extraOrderBy,
        extraLimit,
        policy,
      });

      if (error) return { docs: [], usedField: "lottery_key", error };
      if (snap?.docs?.length) {
        return { docs: snap.docs, usedField: "lottery_key", error: null };
      }
    }

    return { docs: [], usedField: "lottery_key", error: null };
  }

  {
    const { snap, error } = await queryDrawsByField({
      fieldName: "uf",
      uf: ufUp,
      extraWheres,
      extraOrderBy,
      extraLimit,
      policy,
    });

    if (!error && snap?.docs?.length) {
      return { docs: snap.docs, usedField: "uf", error: null };
    }
    if (error) return { docs: [], usedField: "uf", error };
  }

  {
    const lotteryKey =
      ufUp === RJ_STATE_CODE ? RJ_LOTTERY_KEY : resolveLotteryKeyForQuery(ufTrim);

    const { snap, error } = await queryDrawsByField({
      fieldName: "lottery_key",
      uf: String(lotteryKey).toUpperCase(),
      extraWheres,
      extraOrderBy,
      extraLimit,
      policy,
    });

    if (!error && snap?.docs?.length) {
      return { docs: snap.docs, usedField: "lottery_key", error: null };
    }
    if (error) return { docs: [], usedField: "lottery_key", error };
  }

  return { docs: [], usedField: "none", error: null };
}'''

new = r'''async function fetchDrawDocsPreferUf({
  uf,
  extraWheres = [],
  extraOrderBy = null,
  extraLimit = null,
  policy = DEFAULT_READ_POLICY,
}) {
  const ufTrim = String(extractUfParam(uf) || "").trim();
  const ufUp = ufTrim.toUpperCase();

  if (isFederalInput(ufUp)) {
    for (const lk of FEDERAL_LOTTERY_KEYS) {
      const { snap, error } = await queryDrawsByField({
        fieldName: "lottery_key",
        uf: lk,
        extraWheres,
        extraOrderBy,
        extraLimit,
        policy,
      });

      if (error) return { docs: [], usedField: "lottery_key", error };
      if (snap?.docs?.length) {
        return { docs: snap.docs, usedField: "lottery_key", error: null };
      }
    }

    return { docs: [], usedField: "lottery_key", error: null };
  }

  /*
   * RJ possui documentos históricos gravados em dois formatos:
   * - uf == "RJ"
   * - lottery_key == "PT_RIO"
   *
   * Não podemos retornar somente a primeira consulta que encontrar dados,
   * pois isso elimina horários existentes apenas no outro formato.
   */
  if (ufUp === RJ_STATE_CODE || ufUp === RJ_LOTTERY_KEY) {
    const [byUf, byLotteryKey] = await Promise.all([
      queryDrawsByField({
        fieldName: "uf",
        uf: RJ_STATE_CODE,
        extraWheres,
        extraOrderBy,
        extraLimit,
        policy,
      }),
      queryDrawsByField({
        fieldName: "lottery_key",
        uf: RJ_LOTTERY_KEY,
        extraWheres,
        extraOrderBy,
        extraLimit,
        policy,
      }),
    ]);

    if (byUf.error) {
      return { docs: [], usedField: "uf+lottery_key", error: byUf.error };
    }

    if (byLotteryKey.error) {
      return {
        docs: [],
        usedField: "uf+lottery_key",
        error: byLotteryKey.error,
      };
    }

    const mergedById = new Map();

    for (const doc of byUf.snap?.docs || []) {
      mergedById.set(doc.id, doc);
    }

    for (const doc of byLotteryKey.snap?.docs || []) {
      mergedById.set(doc.id, doc);
    }

    return {
      docs: Array.from(mergedById.values()),
      usedField: "uf+lottery_key",
      error: null,
    };
  }

  {
    const { snap, error } = await queryDrawsByField({
      fieldName: "uf",
      uf: ufUp,
      extraWheres,
      extraOrderBy,
      extraLimit,
      policy,
    });

    if (!error && snap?.docs?.length) {
      return { docs: snap.docs, usedField: "uf", error: null };
    }
    if (error) return { docs: [], usedField: "uf", error };
  }

  {
    const lotteryKey = resolveLotteryKeyForQuery(ufTrim);

    const { snap, error } = await queryDrawsByField({
      fieldName: "lottery_key",
      uf: String(lotteryKey).toUpperCase(),
      extraWheres,
      extraOrderBy,
      extraLimit,
      policy,
    });

    if (!error && snap?.docs?.length) {
      return { docs: snap.docs, usedField: "lottery_key", error: null };
    }
    if (error) return { docs: [], usedField: "lottery_key", error };
  }

  return { docs: [], usedField: "none", error: null };
}'''

if old not in text:
    print("ERRO: bloco exato de fetchDrawDocsPreferUf não localizado.")
    sys.exit(1)

if text.count(old) != 1:
    print(f"ERRO: bloco localizado {text.count(old)} vezes; nenhuma alteração aplicada.")
    sys.exit(1)

target.write_text(text.replace(old, new, 1), encoding="utf-8")
print("OK: fetchDrawDocsPreferUf corrigida.")
