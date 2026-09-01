import fs from "fs";
import path from "path";

function srcFile(relative) {
  return fs.readFileSync(
    path.resolve(__dirname, "..", relative),
    "utf8"
  );
}

describe(
  "PalPitaco B4B-2 authoritative frontend integration",
  () => {
    test("login visual has no guest entry", () => {
      const source =
        srcFile("pages/Account/LoginVisual.jsx");

      expect(source).not.toContain("CONVIDADO");
      expect(source).not.toContain("enterGuest");
      expect(source).not.toContain("onSkip");
    });

    test("Account cannot hydrate or enter guest mode", () => {
      const source =
        srcFile("pages/Account/Account.jsx");

      expect(source).not.toContain("loadFormalGuestSession");
      expect(source).not.toContain("markSessionGuest()");
      expect(source).not.toContain("onSkip={onSkip}");
    });

    test("App does not use pp_session as protected access authority", () => {
      const source =
        srcFile("App.jsx");

      expect(source).toContain("bootstrapAuthorizedAccess");
      expect(source).toContain("confirmDeviceAndAuthorize");
      expect(source).toContain("ACCESS_FLOW_STATE.AUTHORIZED");

      expect(source).not.toContain("loadSessionObj");
      expect(source).not.toContain("getSessionKind");
      expect(source).not.toContain("sessionObj");
    });

    test("protected render requires authoritative states", () => {
      const source =
        srcFile("App.jsx");

      expect(source).toContain(
        "ACCESS_FLOW_STATE.SUBSCRIPTION_REQUIRED"
      );

      expect(source).toContain(
        "ACCESS_FLOW_STATE.DEVICE_CONFIRMATION_REQUIRED"
      );

      expect(source).toContain(
        "authoritativePhase !=="
      );
    });

    test("logout delegates to authoritative App handler", () => {
      const source =
        srcFile(
          "pages/Dashboard/components/Sidebar/AppShell.jsx"
        );

      expect(source).toContain(
        'typeof onLogout === "function"'
      );

      expect(source).toContain(
        "await onLogout();"
      );
    });

    test("device UI requires six digits", () => {
      const source =
        srcFile("pages/Account/AccessGate.jsx");

      expect(source).toContain("maxLength={6}");
      expect(source).toContain("code.length !== 6");
      expect(source).toContain("CONFIRMAR DISPOSITIVO");
    });
  }
);