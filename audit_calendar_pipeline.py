from pathlib import Path

files = [
    "backend/routes/pitacoResults.js",
    "backend/services/kingResultsService.js",
    "backend/services/kingService.js",
    "backend/utils/resultNormalizer.js",
    "backend/utils/slotSchedule.js",
]

patterns = [
    "scheduleAll",
    "expectedHard",
    "expectedSoft",
    "presentHours",
    "missingHard",
    "missingSoft",
    "missingTotal",
    "completionPct",
    "calendarStatus",
    "buildSlots",
    "merge",
    "normalize",
    "draws",
    "close_hour",
    "closeHour",
]

for f in files:
    p = Path(f)
    if not p.exists():
        print(f"\n=== {f} (não encontrado) ===")
        continue

    print(f"\n================ {f} ================\n")

    txt = p.read_text(encoding="utf-8", errors="ignore").splitlines()

    for i, line in enumerate(txt):
        if any(k in line for k in patterns):
            a = max(0, i-3)
            b = min(len(txt), i+8)
            print(f"\n--- linha {i+1} ---")
            for j in range(a,b):
                print(f"{j+1:5}: {txt[j]}")
