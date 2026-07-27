(() => {
  const effects = window.__TOP3_EFFECT_COUNTS__ || {};

  const resources = performance
    .getEntriesByType("resource")
    .map(r => ({
      name: r.name,
      initiatorType: r.initiatorType,
      startTime: r.startTime,
      duration: r.duration,
      transferSize: r.transferSize
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    page: location.href,
    effects,
    resources,
    top3Audit: window.__TOP3_AUDIT__ || null,
    firestoreLastSave: window.__TOP3_FIRESTORE_LAST_SAVE__ || null
  };

  console.log(report);

  const blob = new Blob(
    [JSON.stringify(report, null, 2)],
    { type: "application/json" }
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "top3_perf_aud_03_runtime.json";
  a.click();

  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
})();
