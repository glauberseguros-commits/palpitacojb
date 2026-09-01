import fs from "fs";
import path from "path";

const root =
  path.resolve(__dirname, "../..");

function read(relative) {
  return fs.readFileSync(
    path.join(root, relative),
    "utf8"
  );
}

describe(
  "PalPitaco paid profile authority",
  () => {
    test("user profile service contains no client-side subscription authority", () => {
      const source =
        read(
          "src/pages/Account/account.profile.service.js"
        );

      [
        "SIGNUP_TRIAL_DAYS",
        "trialStartAt",
        "trialEndAt",
        "trialActive",
        "planStartAt",
        "planEndAt",
        "isLifetime",
        "PLAN_PREMIUM",
        "PLAN_VIP",
        "serverTimestamp",
        "Timestamp.fromMillis",
      ].forEach((marker) => {
        expect(source).not.toContain(marker);
      });

      expect(source).toContain(
        'doc(db, "users", u)'
      );

      expect(source).toContain(
        "export async function ensureUserDoc"
      );

      expect(source).toContain(
        "export async function loadUserProfile"
      );

      expect(source).toContain(
        "export async function saveUserProfile"
      );
    });

    test("Firestore user rules no longer create Trial or client-side plans", () => {
      const source =
        read("firestore.rules");

      [
        "trialSafeForCreate",
        "trialNotChangedOnUpdate",
        "planSafeForCreate",
        "planMetadataSafeForCreate",
        "planNotChangedOnUpdate",
        "planMetadataNotChangedOnUpdate",
        '"trialActive"',
        '"planStartAt"',
        '"planEndAt"',
        '"isLifetime"',
      ].forEach((marker) => {
        expect(source).not.toContain(marker);
      });

      expect(source).toContain(
        "function userCreateIsSafe()"
      );

      expect(source).toContain(
        "function userUpdateIsSafe()"
      );

      expect(source).toContain(
        "diff(resource.data)"
      );

      expect(source).toContain(
        "request.auth.token.email"
      );
    });

    test("authoritative subscription backend remains the commercial source", () => {
      const source =
        read(
          "backend/access/accessConfig.js"
        );

      expect(source).toContain("4990");
      expect(source).toContain("30");
      expect(source).toContain("PIX");
    });
  }
);