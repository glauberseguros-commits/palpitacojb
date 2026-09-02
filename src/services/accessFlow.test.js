jest.mock("./accessClient", () => ({
  getStoredAccessSessionToken:
    jest.fn(),

  clearAccessRuntimeSession:
    jest.fn(),

  detectRegistrationDeviceSlot:
    jest.fn(),

  getMyAccess:
    jest.fn(),

  startDeviceConfirmation:
    jest.fn(),

  confirmDeviceConfirmation:
    jest.fn(),

  openAccessSession:
    jest.fn(),

  closeAccessSession:
    jest.fn(),

  checkAuthorizedAccess:
    jest.fn(),
}));


import {
  getStoredAccessSessionToken,
  clearAccessRuntimeSession,
  detectRegistrationDeviceSlot,
  getMyAccess,
  startDeviceConfirmation,
  confirmDeviceConfirmation,
  openAccessSession,
  checkAuthorizedAccess,
} from "./accessClient";

import {
  ACCESS_FLOW_STATE,
  isSubscriptionActive,
  bootstrapAuthorizedAccess,
  confirmDeviceAndAuthorize,
} from "./accessFlow";


function activeMe() {
  return {
    ok: true,

    user: {
      uid:
        "uid-b4b-001",

      email:
        "teste@palpitaco.local",
    },

    access: {
      uid:
        "uid-b4b-001",

      exists:
        true,

      subscription: {
        active:
          true,

        status:
          "active",
      },

      accessGranted:
        true,
    },
  };
}


function inactiveMe() {
  return {
    ok: true,

    user: {
      uid:
        "uid-b4b-001",

      email:
        "teste@palpitaco.local",
    },

    access: {
      uid:
        "uid-b4b-001",

      exists:
        true,

      subscription: {
        active:
          false,

        status:
          "pending",
      },

      accessGranted:
        false,
    },
  };
}

describe(
  "PalPitaco authoritative access flow",
  () => {

    beforeEach(() => {
      jest.clearAllMocks();

      getStoredAccessSessionToken
        .mockReturnValue(null);

      detectRegistrationDeviceSlot
        .mockReturnValue(
          "DESKTOP"
        );
    });


    test(
      "subscription state follows current authoritative /me snapshot contract",
      () => {
        expect(
          isSubscriptionActive(
            activeMe()
          )
        ).toBe(true);

        expect(
          isSubscriptionActive(
            inactiveMe()
          )
        ).toBe(false);

        expect(
          isSubscriptionActive({
            access: {
              accessGranted:
                true,

              subscription: {
                active:
                  false,
              },
            },
          })
        ).toBe(false);

        expect(
          isSubscriptionActive({
            access: {
              accessGranted:
                false,

              subscription: {
                active:
                  true,
              },
            },
          })
        ).toBe(false);

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
      "inactive subscription never opens an access session",
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

        expect(
          openAccessSession
        ).not.toHaveBeenCalled();

        expect(
          startDeviceConfirmation
        ).not.toHaveBeenCalled();

        expect(
          clearAccessRuntimeSession
        ).toHaveBeenCalled();
      }
    );


    test(
      "active subscription and known device opens and validates session",
      async () => {
        getMyAccess
          .mockResolvedValue(
            activeMe()
          );

        openAccessSession
          .mockResolvedValue({
            ok:
              true,

            session: {
              slot:
                "DESKTOP",

              sessionToken:
                "session-b4b-001",
            },
          });

        checkAuthorizedAccess
          .mockResolvedValue({
            ok:
              true,

            accessGranted:
              true,

            access: {
              slot:
                "DESKTOP",
            },
          });

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
          openAccessSession
        ).toHaveBeenCalledTimes(1);

        expect(
          checkAuthorizedAccess
        ).toHaveBeenCalledTimes(1);

        expect(
          startDeviceConfirmation
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "unknown device starts email confirmation instead of granting access",
      async () => {
        getMyAccess
          .mockResolvedValue(
            activeMe()
          );

        openAccessSession
          .mockRejectedValue({
            code:
              "DEVICE_NOT_AUTHORIZED",
          });

        detectRegistrationDeviceSlot
          .mockReturnValue(
            "MOBILE"
          );

        startDeviceConfirmation
          .mockResolvedValue({
            ok:
              true,

            challenge: {
              challengeToken:
                "challenge-b4b-001",

              expiresAt:
                "2099-01-01T00:00:00.000Z",
            },
          });

        const result =
          await bootstrapAuthorizedAccess();

        expect(
          result.state
        ).toBe(
          ACCESS_FLOW_STATE
            .DEVICE_CONFIRMATION_REQUIRED
        );

        expect(
          result.accessGranted
        ).toBe(false);

        expect(
          result.slot
        ).toBe("MOBILE");

        expect(
          result.challengeToken
        ).toBe(
          "challenge-b4b-001"
        );

        expect(
          startDeviceConfirmation
        ).toHaveBeenCalledWith({
          slot:
            "MOBILE",
        });

        expect(
          checkAuthorizedAccess
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "email code confirmation binds device then opens and validates session",
      async () => {
        confirmDeviceConfirmation
          .mockResolvedValue({
            ok:
              true,
          });

        openAccessSession
          .mockResolvedValue({
            ok:
              true,

            session: {
              slot:
                "DESKTOP",

              sessionToken:
                "session-b4b-002",
            },
          });

        checkAuthorizedAccess
          .mockResolvedValue({
            ok:
              true,

            accessGranted:
              true,

            access: {
              slot:
                "DESKTOP",
            },
          });

        const result =
          await confirmDeviceAndAuthorize({
            challengeToken:
              "challenge-b4b-002",

            code:
              "123456",
          });

        expect(
          confirmDeviceConfirmation
        ).toHaveBeenCalledWith({
          challengeToken:
            "challenge-b4b-002",

          code:
            "123456",
        });

        expect(
          openAccessSession
        ).toHaveBeenCalledTimes(1);

        expect(
          checkAuthorizedAccess
        ).toHaveBeenCalledTimes(1);

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
      "valid stored access session is reused without reopening it",
      async () => {
        getStoredAccessSessionToken
          .mockReturnValue(
            "stored-session-b4b"
          );

        checkAuthorizedAccess
          .mockResolvedValue({
            ok:
              true,

            accessGranted:
              true,

            access: {
              slot:
                "DESKTOP",
            },
          });

        const result =
          await bootstrapAuthorizedAccess();

        expect(
          result.state
        ).toBe(
          ACCESS_FLOW_STATE.AUTHORIZED
        );

        expect(
          result.reusedSession
        ).toBe(true);

        expect(
          getMyAccess
        ).not.toHaveBeenCalled();

        expect(
          openAccessSession
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "stale stored session is discarded before normal bootstrap",
      async () => {
        getStoredAccessSessionToken
          .mockReturnValue(
            "stale-session-b4b"
          );

        checkAuthorizedAccess
          .mockRejectedValueOnce({
            code:
              "ACTIVE_SESSION_REQUIRED",
          })
          .mockResolvedValueOnce({
            ok:
              true,

            accessGranted:
              true,

            access: {
              slot:
                "DESKTOP",
            },
          });

        getMyAccess
          .mockResolvedValue(
            activeMe()
          );

        openAccessSession
          .mockResolvedValue({
            ok:
              true,

            session: {
              slot:
                "DESKTOP",

              sessionToken:
                "new-session-b4b",
            },
          });

        const result =
          await bootstrapAuthorizedAccess();

        expect(
          clearAccessRuntimeSession
        ).toHaveBeenCalledTimes(1);

        expect(
          getMyAccess
        ).toHaveBeenCalledTimes(1);

        expect(
          openAccessSession
        ).toHaveBeenCalledTimes(1);

        expect(
          checkAuthorizedAccess
        ).toHaveBeenCalledTimes(2);

        expect(
          result.state
        ).toBe(
          ACCESS_FLOW_STATE.AUTHORIZED
        );
      }
    );


    test(
      "subscription expiry race during session open fails closed",
      async () => {
        getMyAccess
          .mockResolvedValue(
            activeMe()
          );

        openAccessSession
          .mockRejectedValue({
            code:
              "ACTIVE_SUBSCRIPTION_REQUIRED",
          });

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
          clearAccessRuntimeSession
        ).toHaveBeenCalled();

        expect(
          startDeviceConfirmation
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "confirmation refuses malformed six digit code before backend call",
      async () => {
        await expect(
          confirmDeviceAndAuthorize({
            challengeToken:
              "challenge-b4b-003",

            code:
              "12A",
          })
        ).rejects.toMatchObject({
          code:
            "DEVICE_CONFIRMATION_CODE_INVALID",
        });

        expect(
          confirmDeviceConfirmation
        ).not.toHaveBeenCalled();

        expect(
          openAccessSession
        ).not.toHaveBeenCalled();
      }
    );
  }
);