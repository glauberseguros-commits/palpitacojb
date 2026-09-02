import fs from "fs";
import path from "path";


function srcFile(relative) {
  return fs.readFileSync(
    path.resolve(
      __dirname,
      "..",
      relative
    ),
    "utf8"
  );
}


describe(
  "PalPitaco sovereign administrative access integration",
  () => {

    test(
      "login visual has no guest entry",
      () => {
        const source =
          srcFile(
            "pages/Account/LoginVisual.jsx"
          );

        expect(source)
          .not
          .toContain("CONVIDADO");

        expect(source)
          .not
          .toContain("enterGuest");

        expect(source)
          .not
          .toContain("onSkip");
      }
    );


    test(
      "App uses subscription authority",
      () => {
        const source =
          srcFile("App.jsx");

        expect(source)
          .toContain(
            "bootstrapAuthorizedAccess"
          );

        expect(source)
          .toContain(
            "ACCESS_FLOW_STATE.AUTHORIZED"
          );

        expect(source)
          .toContain(
            "ACCESS_FLOW_STATE.SUBSCRIPTION_REQUIRED"
          );
      }
    );


    test(
      "App has no device confirmation gate",
      () => {
        const source =
          srcFile("App.jsx");

        expect(source)
          .not
          .toContain(
            "confirmDeviceAndAuthorize"
          );

        expect(source)
          .not
          .toContain(
            "DEVICE_CONFIRMATION_REQUIRED"
          );

        expect(source)
          .not
          .toContain(
            'mode="device"'
          );
      }
    );


    test(
      "access flow has no device email or session gate",
      () => {
        const source =
          srcFile(
            "services/accessFlow.js"
          );

        [
          "startDeviceConfirmation",
          "confirmDeviceConfirmation",
          "openAccessSession",
          "checkAuthorizedAccess",
          "DEVICE_NOT_AUTHORIZED",
          "EMAIL_DELIVERY_NOT_CONFIGURED",
          "DEVICE_CHALLENGE_COOLDOWN",
        ].forEach(
          (marker) => {
            expect(source)
              .not
              .toContain(marker);
          }
        );

        expect(source)
          .toContain(
            "ADMIN_SUBSCRIPTION_SOVEREIGN"
          );
      }
    );


    test(
      "logout remains wired",
      () => {
        const source =
          srcFile(
            "pages/Dashboard/components/Sidebar/AppShell.jsx"
          );

        expect(source)
          .toContain(
            'typeof onLogout === "function"'
          );

        expect(source)
          .toContain(
            "await onLogout();"
          );
      }
    );
  }
);
