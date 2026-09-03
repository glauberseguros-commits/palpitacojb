const fs = require("fs");
const path = require("path");

const read = (rel) =>
  fs.readFileSync(
    path.join(process.cwd(), rel),
    "utf8"
  );

describe("security persistence authority R1", () => {
  test("paid Firestore data is not publicly readable", () => {
    const rules =
      read("firestore.rules");

    expect(rules).toContain(
      "function authenticatedUser()"
    );

    expect(rules).toContain(
      'request.auth.token.firebase.sign_in_provider != "anonymous"'
    );

    expect(
      rules
        .split(
          "allow read: if authenticatedUser();"
        )
        .length - 1
    ).toBe(4);

    expect(rules).not.toContain(
      "allow read: if true;"
    );
  });

  test("Top3 and Terno never open anonymous sessions", () => {
    const top3 =
      read(
        "src/pages/Top3/top3.firestore.js"
      );

    const terno =
      read(
        "src/pages/TernoGrupo/top3.firestore.js"
      );

    expect(top3).not.toContain(
      "loginAnonymous"
    );

    expect(terno).not.toContain(
      "loginAnonymous"
    );

    expect(top3).toContain(
      "auth.currentUser"
    );

    expect(terno).toContain(
      "auth.currentUser"
    );
  });

  test("Top3 validation persisted fields are authorized by rules", () => {
    const rules =
      read("firestore.rules");

    const start =
      rules.indexOf(
        "match /top3_predictions/{predictionId} {"
      );

    const end =
      rules.indexOf(
        "match /terno_grupo_predictions/{predictionId} {",
        start
      );

    const block =
      rules.slice(
        start,
        end
      );

    [
      "resultGrupo",
      "resultMilhar",
      "resultLotteryKey",
      "resultAnimal",
      "resultTop3Groups",
      "resultTop3Milhares",
      "hitType",
      "hitScore",
      "hitPosition",
      "predictionPosition",
      "resultPosition",
      "podiumMedal",
      "matchedGrupo",
      "matchedMilhar",
      "matchedAnimal",
      "matchedValue",
      "hits",
      "hitCount",
      "matchedPredictions",
      "matchedPrizePositions",
      "validatedAt",
      "validatedBy",
      "updatedAt",
      "status",
    ].forEach(
      (field) => {
        expect(block).toContain(
          '"' + field + '"'
        );
      }
    );
  });
});
