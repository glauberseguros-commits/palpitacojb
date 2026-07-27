from pathlib import Path

path = Path("tmp/perf_top3_16_patch.py")
text = path.read_text(encoding="utf-8")

old = '''sync = replace_once(
    sync,
    \'\'\'  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;

  try {
\'\'\',
    \'\'\'  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;

  const loadCompactManifest =
    dependencies.readCompactManifest ||
    readCompactManifest;

  const saveCompactManifest =
    dependencies.writeCompactManifest ||
    writeCompactManifest;

  const saveCompactYear =
    dependencies.upsertCompactHistoryYear ||
    upsertCompactHistoryYear;

  try {
\'\'\',
    "sync/dependencies",
)
'''

new = '''sync = replace_once(
    sync,
    \'\'\'async function syncImportedResultToTop3History(
  importResult = {},
  dependencies = {}
) {
  const lotteryKey = normalizeLotteryKey(
    importResult.lotteryKey
  );

  const loadMetadata =
    dependencies.readMetadata ||
    readMetadata;

  const saveMonth =
    dependencies.upsertHistoryMonth ||
    upsertHistoryMonth;

  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;

  try {
\'\'\',
    \'\'\'async function syncImportedResultToTop3History(
  importResult = {},
  dependencies = {}
) {
  const lotteryKey = normalizeLotteryKey(
    importResult.lotteryKey
  );

  const loadMetadata =
    dependencies.readMetadata ||
    readMetadata;

  const saveMonth =
    dependencies.upsertHistoryMonth ||
    upsertHistoryMonth;

  const saveMetadata =
    dependencies.writeMetadata ||
    writeMetadata;

  const loadCompactManifest =
    dependencies.readCompactManifest ||
    readCompactManifest;

  const saveCompactManifest =
    dependencies.writeCompactManifest ||
    writeCompactManifest;

  const saveCompactYear =
    dependencies.upsertCompactHistoryYear ||
    upsertCompactHistoryYear;

  try {
\'\'\',
    "sync/dependencies",
)
'''

count = text.count(old)

if count != 1:
    raise RuntimeError(
        f"Bloco ambíguo esperado uma vez no patch; encontrado {count}"
    )

path.write_text(
    text.replace(old, new, 1),
    encoding="utf-8",
    newline="\n",
)

print("PATCH_ANCHOR_FIXED")
