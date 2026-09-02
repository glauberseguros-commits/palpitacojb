import fs from "fs";
import path from "path";

import {
  ACCESS_CAPABILITY,
  USER_ACCESS,
  can,
  getAccessPolicy,
} from "./accessControl";


function source(relative) {
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
  "PalPitaco single paid platform authority",
  () => {

    test(
      "authorized platform user has every internal capability",
      () => {
        const capabilities =
          Object.values(
            ACCESS_CAPABILITY
          );

        expect(
          capabilities.length
        ).toBeGreaterThan(0);

        for (
          const capability of
          capabilities
        ) {
          expect(
            USER_ACCESS[
              capability
            ]
          ).toBe(true);
        }
      }
    );


    test(
      "legacy FREE session cannot downgrade an already authorized user",
      () => {
        const legacyFreeSession = {
          ok: true,
          type: "user",
          plan: "FREE",
          entitlement: "FREE",
          uid: "legacy-free-user",
        };

        const policy =
          getAccessPolicy(
            legacyFreeSession
          );

        for (
          const capability of
          Object.values(
            ACCESS_CAPABILITY
          )
        ) {
          expect(
            policy[
              capability
            ]
          ).toBe(true);

          expect(
            can(
              legacyFreeSession,
              capability
            )
          ).toBe(true);
        }
      }
    );


    test(
      "legacy PREMIUM VIP STANDARD PLUS values cannot create different platform permissions",
      () => {
        const labels = [
          "FREE",
          "STANDARD",
          "PLUS",
          "PREMIUM",
          "VIP",
          "TRIAL",
        ];

        for (
          const label of labels
        ) {
          const policy =
            getAccessPolicy({
              ok: true,
              type: "user",
              plan: label,
              entitlement: label,
            });

          expect(
            policy
          ).toBe(
            USER_ACCESS
          );
        }
      }
    );


    test(
      "sidebar does not expose FREE or any plan entitlement",
      () => {
        const shell =
          source(
            "pages/Dashboard/components/Sidebar/AppShell.jsx"
          );

        [
          "getAccessEntitlement",
          "ACCESS_ENTITLEMENT",
          "isCommercialPlan",
          "normalizeAccessEntitlement",
          "normalizeSessionPlan",
          "planLabel",
          'style={UI.plan}',
        ].forEach(
          (marker) => {
            expect(shell)
              .not
              .toContain(marker);
          }
        );

        expect(shell)
          .toContain(
            'data-access-authority="paid-full"'
          );
      }
    );


    test(
      "top level App remains the commercial gate",
      () => {
        const app =
          source("App.jsx");

        const flow =
          source(
            "services/accessFlow.js"
          );

        expect(app)
          .toContain(
            "bootstrapAuthorizedAccess"
          );

        expect(app)
          .toContain(
            "ACCESS_FLOW_STATE.SUBSCRIPTION_REQUIRED"
          );

        expect(app)
          .toContain(
            "ACCESS_FLOW_STATE.AUTHORIZED"
          );

        expect(flow)
          .toContain(
            "ADMIN_SUBSCRIPTION_SOVEREIGN"
          );

        expect(flow)
          .toContain(
            "?.subscription"
          );

        expect(flow)
          .toContain(
            "?.active === true"
          );
      }
    );
  }
);
