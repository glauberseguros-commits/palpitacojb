jest.mock("./accessClient", () => ({
  clearAccessRuntimeSession:
    jest.fn(),

  getMyAccess:
    jest.fn(),

  closeAccessSession:
    jest.fn(),
}));


import {
  clearAccessRuntimeSession,
  getMyAccess,
  closeAccessSession,
} from "./accessClient";

import {
  ACCESS_FLOW_STATE,
  isSubscriptionActive,
  bootstrapAuthorizedAccess,
  confirmDeviceAndAuthorize,
  closeAuthoritativeAccess,
} from "./accessFlow";


function activeMe({
  accessGranted = true,
} = {}) {
  return {
    ok: true,

    user: {
      uid:
        "uid-admin-sovereign-001",

      email:
        "teste@palpitaco.local",
    },

    access: {
      accessGranted,

      subscription: {
        active:
          true,

        status:
          "active",

        endsAt:
          "2099-01-01T00:00:00.000Z",
      },
    },
  };
}


function inactiveMe() {
  return {
    ok: true,

    user: {
      uid:
        "uid-admin-sovereign-001",

      email:
        "teste@palpitaco.local",
    },

    access: {
      accessGranted:
        false,

      subscription: {
        active:
          false,

        status:
          "pending",
      },
    },
  };
}


describe(
  "PalPitaco Admin sovereign access",
  () => {

    beforeEach(() => {
      jest.clearAllMocks();

      closeAccessSession
        .mockResolvedValue({
          ok: true,
          alreadyClosed: true,
        });
    });


    test(
      "active subscription grants total access immediately",
      async () => {
        getMyAccess
          .mockResolvedValue(
            activeMe()
          );

        const result =
          await bootstrapAuthorizedAccess();

        expect(
          result.state
        ).toBe(
          ACCESS_FLOW_STATE.AUTHORIZED
        );

        expect(
          result.accessGranted
        ).toBe(true);

        expect(
          result.authority
        ).toBe(
          "ADMIN_SUBSCRIPTION_SOVEREIGN"
        );

        expect(
          clearAccessRuntimeSession
        ).toHaveBeenCalled();

        expect(
          closeAccessSession
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "active subscription stays sovereign when legacy accessGranted is false",
      async () => {
        getMyAccess
          .mockResolvedValue(
            activeMe({
              accessGranted:
                false,
            })
          );

        const result =
          await bootstrapAuthorizedAccess();

        expect(
          result.state
        ).toBe(
          ACCESS_FLOW_STATE.AUTHORIZED
        );

        expect(
          result.accessGranted
        ).toBe(true);
      }
    );


    test(
      "inactive subscription stays blocked",
      async () => {
        getMyAccess
          .mockResolvedValue(
            inactiveMe()
          );

        const result =
          await bootstrapAuthorizedAccess();

        expect(
          result.state
        ).toBe(
          ACCESS_FLOW_STATE
            .SUBSCRIPTION_REQUIRED
        );

        expect(
          result.accessGranted
        ).toBe(false);

        expect(
          result.reason
        ).toBe("PENDING");
      }
    );


    test(
      "legacy access.active alone has no authority",
      () => {
        expect(
          isSubscriptionActive({
            access: {
              active:
                true,

              status:
                "active",
            },
          })
        ).toBe(false);
      }
    );


    test(
      "legacy confirmation cannot create a device gate",
      async () => {
        getMyAccess
          .mockResolvedValue(
            activeMe()
          );

        const result =
          await confirmDeviceAndAuthorize({
            challengeToken:
              "ignored",

            code:
              "000000",
          });

        expect(
          result.state
        ).toBe(
          ACCESS_FLOW_STATE.AUTHORIZED
        );

        expect(
          result.authority
        ).toBe(
          "ADMIN_SUBSCRIPTION_SOVEREIGN"
        );
      }
    );


    test(
      "logout may close legacy session without making it an access gate",
      async () => {
        await closeAuthoritativeAccess();

        expect(
          closeAccessSession
        ).toHaveBeenCalledTimes(1);

        expect(
          clearAccessRuntimeSession
        ).toHaveBeenCalled();
      }
    );
  }
);
