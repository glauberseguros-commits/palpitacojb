from pathlib import Path

repo_path = Path("backend/engine/top3HistoryRepository.js")
repo = repo_path.read_text(encoding="utf-8")

def replace_once(text, old, new, label):
    count = text.count(old)

    if count != 1:
        raise RuntimeError(
            f"{label}: esperado exatamente 1 bloco; encontrado {count}"
        )

    return text.replace(old, new, 1)


old_block = '''function encodeCompactPrize(prize = {}) {
  const normalized = normalizePrize(prize);

  if (!normalized) {
    return null;
  }

  return [
    normalized.id,
    normalized.position,
    normalized.grupo,
    normalized.milhar,
    normalized.centena,
    normalized.dezena,
  ];
}

function decodeCompactPrize(row) {
  if (!Array.isArray(row)) {
    return null;
  }

  return normalizePrize({
    id: row[0],
    position: row[1],
    grupo: row[2],
    milhar: row[3],
    centena: row[4],
    dezena: row[5],
  });
}

function encodeCompactDraw(draw = {}) {
  const normalized = normalizeDraw(draw);

  if (!normalized) {
    return null;
  }

  return [
    normalized.drawId,
    normalized.ymd,
    normalized.closeHour,
    normalized.lotteryKey,
    normalized.lotteryCode,
    safeArray(normalized.prizes)
      .map(encodeCompactPrize)
      .filter(Boolean),
  ];
}

function decodeCompactDraw(row) {
  if (!Array.isArray(row)) {
    return null;
  }

  return normalizeDraw({
    drawId: row[0],
    id: row[0],
    ymd: row[1],
    closeHour: row[2],
    lotteryKey: row[3],
    lotteryCode: row[4],
    prizes: safeArray(row[5])
      .map(decodeCompactPrize)
      .filter(Boolean),
  });
}
'''

new_block = '''function encodeCompactPrize(prize = {}) {
  const normalized = normalizePrize(prize);

  if (!normalized) {
    return null;
  }

  return {
    i: normalized.id,
    o: normalized.position,
    g: normalized.grupo,
    m: normalized.milhar,
    c: normalized.centena,
    d: normalized.dezena,
  };
}

function decodeCompactPrize(row) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    return null;
  }

  return normalizePrize({
    id: row.i,
    position: row.o,
    grupo: row.g,
    milhar: row.m,
    centena: row.c,
    dezena: row.d,
  });
}

function encodeCompactDraw(draw = {}) {
  const normalized = normalizeDraw(draw);

  if (!normalized) {
    return null;
  }

  return {
    d: normalized.drawId,
    y: normalized.ymd,
    h: normalized.closeHour,
    k: normalized.lotteryKey,
    c: normalized.lotteryCode,
    p: safeArray(normalized.prizes)
      .map(encodeCompactPrize)
      .filter(Boolean),
  };
}

function decodeCompactDraw(row) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    return null;
  }

  return normalizeDraw({
    drawId: row.d,
    id: row.d,
    ymd: row.y,
    closeHour: row.h,
    lotteryKey: row.k,
    lotteryCode: row.c,
    prizes: safeArray(row.p)
      .map(decodeCompactPrize)
      .filter(Boolean),
  });
}
'''

repo = replace_once(
    repo,
    old_block,
    new_block,
    "compact-serialization"
)

repo_path.write_text(
    repo,
    encoding="utf-8",
    newline="\n"
)

print("PATCH_OK")
