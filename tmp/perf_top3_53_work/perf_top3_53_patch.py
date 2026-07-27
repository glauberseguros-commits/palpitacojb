from pathlib import Path
import sys

target = Path(r"src/pages/Top3/top3.engine.js")
text = target.read_text(encoding="utf-8")

old = r'''function buildHistoricalSceneRanking(draws, currentScene, limit = 100) {
  const list = Array.isArray(draws) ? draws : [];
  if (!currentScene) return [];

  const ordered = list
    .map((draw) => ({
      draw,
      scene: buildSceneFromDraw(draw),
    }))
    .filter((x) => x.scene)
    .sort((a, b) => {
      const ta = ymdHourToTs(a.scene?.ymd, a.scene?.hour);
      const tb = ymdHourToTs(b.scene?.ymd, b.scene?.hour);
      return Number(ta || 0) - Number(tb || 0);
    });

  return ordered
    .map((item, idx) => {
      const next = ordered[idx + 1] || null;
      const score = compareScenes(currentScene, item.scene);

      return {
        draw: item.draw,
        scene: item.scene,
        nextDraw: next?.draw || null,
        nextScene: next?.scene || null,
        score,
      };
    })
    .filter((x) => x.scene && x.nextDraw && Number(x.score) > 0)
    .sort((a, b) => {
      if (Number(b.score) !== Number(a.score)) {
        return Number(b.score) - Number(a.score);
      }

      const ta = ymdHourToTs(a.scene?.ymd, a.scene?.hour);
      const tb = ymdHourToTs(b.scene?.ymd, b.scene?.hour);
      return Number(tb || 0) - Number(ta || 0);
    })
    .slice(0, Math.max(1, Number(limit || 100)));
}'''

new = r'''const PERF_TOP3_SCENE_PROFILE_KEY =
  "__PALPITACO_PERF_TOP3_SCENE_PROFILE__";

function getPerfTop3SceneProfile() {
  if (!globalThis[PERF_TOP3_SCENE_PROFILE_KEY]) {
    globalThis[PERF_TOP3_SCENE_PROFILE_KEY] = {
      calls: 0,
      draws: 0,
      candidates: 0,
      selected: 0,
      buildScenesNs: 0n,
      firstSortNs: 0n,
      compareNs: 0n,
      filterNs: 0n,
      secondSortNs: 0n,
      sliceNs: 0n,
      totalNs: 0n,
      registered: false,
    };
  }

  const profile =
    globalThis[PERF_TOP3_SCENE_PROFILE_KEY];

  if (!profile.registered) {
    profile.registered = true;

    process.once("exit", () => {
      const nsToMs = (value) =>
        Number(value || 0n) / 1_000_000;

      console.log("");
      console.log("===== PERF_TOP3_SCENE_PROFILE =====");
      console.log(`calls=${profile.calls}`);
      console.log(`draws=${profile.draws}`);
      console.log(`candidates=${profile.candidates}`);
      console.log(`selected=${profile.selected}`);
      console.log(
        `build_scenes_ms=${nsToMs(profile.buildScenesNs).toFixed(3)}`
      );
      console.log(
        `first_sort_ms=${nsToMs(profile.firstSortNs).toFixed(3)}`
      );
      console.log(
        `compare_ms=${nsToMs(profile.compareNs).toFixed(3)}`
      );
      console.log(
        `filter_ms=${nsToMs(profile.filterNs).toFixed(3)}`
      );
      console.log(
        `second_sort_ms=${nsToMs(profile.secondSortNs).toFixed(3)}`
      );
      console.log(
        `slice_ms=${nsToMs(profile.sliceNs).toFixed(3)}`
      );
      console.log(
        `total_ms=${nsToMs(profile.totalNs).toFixed(3)}`
      );
      console.log("===== FIM_PERF_TOP3_SCENE_PROFILE =====");
    });
  }

  return profile;
}

function buildHistoricalSceneRanking(draws, currentScene, limit = 100) {
  const profile = getPerfTop3SceneProfile();
  const totalStart = process.hrtime.bigint();

  const list = Array.isArray(draws) ? draws : [];

  profile.calls += 1;
  profile.draws += list.length;

  if (!currentScene) {
    profile.totalNs +=
      process.hrtime.bigint() - totalStart;

    return [];
  }

  const buildStart = process.hrtime.bigint();

  const ordered = list
    .map((draw) => ({
      draw,
      scene: buildSceneFromDraw(draw),
    }))
    .filter((x) => x.scene);

  profile.buildScenesNs +=
    process.hrtime.bigint() - buildStart;

  const firstSortStart = process.hrtime.bigint();

  ordered.sort((a, b) => {
    const ta = ymdHourToTs(
      a.scene?.ymd,
      a.scene?.hour
    );

    const tb = ymdHourToTs(
      b.scene?.ymd,
      b.scene?.hour
    );

    return Number(ta || 0) - Number(tb || 0);
  });

  profile.firstSortNs +=
    process.hrtime.bigint() - firstSortStart;

  const compareStart = process.hrtime.bigint();

  const compared = ordered.map((item, idx) => {
    const next = ordered[idx + 1] || null;
    const score = compareScenes(
      currentScene,
      item.scene
    );

    return {
      draw: item.draw,
      scene: item.scene,
      nextDraw: next?.draw || null,
      nextScene: next?.scene || null,
      score,
    };
  });

  profile.compareNs +=
    process.hrtime.bigint() - compareStart;

  const filterStart = process.hrtime.bigint();

  const candidates = compared.filter(
    (x) =>
      x.scene &&
      x.nextDraw &&
      Number(x.score) > 0
  );

  profile.filterNs +=
    process.hrtime.bigint() - filterStart;

  profile.candidates += candidates.length;

  const secondSortStart = process.hrtime.bigint();

  candidates.sort((a, b) => {
    if (Number(b.score) !== Number(a.score)) {
      return Number(b.score) - Number(a.score);
    }

    const ta = ymdHourToTs(
      a.scene?.ymd,
      a.scene?.hour
    );

    const tb = ymdHourToTs(
      b.scene?.ymd,
      b.scene?.hour
    );

    return Number(tb || 0) - Number(ta || 0);
  });

  profile.secondSortNs +=
    process.hrtime.bigint() - secondSortStart;

  const sliceStart = process.hrtime.bigint();

  const result = candidates.slice(
    0,
    Math.max(1, Number(limit || 100))
  );

  profile.sliceNs +=
    process.hrtime.bigint() - sliceStart;

  profile.selected += result.length;

  profile.totalNs +=
    process.hrtime.bigint() - totalStart;

  return result;
}'''

count = text.count(old)

if count != 1:
    print(
        f"ERRO: função-alvo encontrada {count} vez(es); esperado=1."
    )
    sys.exit(1)

target.write_text(
    text.replace(old, new, 1),
    encoding="utf-8",
    newline=""
)

print("PATCH_OK")
