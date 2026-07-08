from pathlib import Path

p = Path("backend/routes/pitacoResults.js")
txt = p.read_text(encoding="utf-8")

marker = """function buildSlots(opts) {"""

helper = """function buildCalendarStatus({ slotsSummary, blocked = false, blockedReason = "", isToday = false }) {
  const expected = Number(slotsSummary?.expectedTotal || 0);
  const found = Number(slotsSummary?.foundTotal || 0);
  const missing = Number(slotsSummary?.missingTotal || 0);

  let status = "empty";
  if (blocked) status = blockedReason === "future_date" ? "future" : "blocked";
  else if (isToday && missing > 0) status = "pending";
  else if (expected > 0 && missing === 0) status = "complete";
  else if (found > 0 && missing > 0) status = "partial";
  else if (expected > 0 && found === 0) status = "empty";

  return {
    status,
    expected,
    found,
    missing,
    completionPct: Number(slotsSummary?.completionPct ?? 0),
  };
}

"""

if marker not in txt:
    raise SystemExit("Marcador buildSlots não encontrado.")

if "function buildCalendarStatus" not in txt:
    txt = txt.replace(marker, helper + marker, 1)

txt = txt.replace(
"""        slotsSummary,
        slots,
      });""",
"""        slotsSummary,
        calendarStatus: buildCalendarStatus({ slotsSummary, blocked: false, isToday }),
        slots,
      });"""
)

txt = txt.replace(
"""      slotsSummary,
      slots,
    });""",
"""      slotsSummary,
      calendarStatus: buildCalendarStatus({ slotsSummary, blocked: false, isToday }),
      slots,
    });"""
)

p.write_text(txt, encoding="utf-8")
print("OK - calendarStatus adicionado.")
