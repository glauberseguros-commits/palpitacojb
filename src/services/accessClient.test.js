jest.mock("./firebase", () => ({
  auth: {
    currentUser: null,
  },

  authReady:
    Promise.resolve(true),
}));

jest.mock("../config/apiBase", () => ({
  apiUrl: (path) => path,
}));

import { auth } from "./firebase";

import {
  ACCESS_CLIENT_STORAGE,
  ACCESS_CLIENT_HEADERS,

  getFirebaseIdToken,
  getStoredDeviceCredentials,
  clearAccessRuntimeSession,

  startDeviceConfirmation,
  openAccessSession,
  checkAuthorizedAccess,
} from "./accessClient";


function responseJson(
  payload,
  {
    status = 200,
  } = {}
) {
  return {
    ok:
      status >= 200 &&
      status < 300,

    status,

    text:
      async () =>
        JSON.stringify(payload),
  };
}


describe(
  "PalPitaco authoritative access client",
  () => {

    beforeEach(() => {

      window.localStorage.clear();
      window.sessionStorage.clear();

      auth.currentUser = {
        uid:
          "uid-test-001",

        email:
          "teste@palpitaco.local",

        isAnonymous:
          false,

        getIdToken:
          jest
            .fn()
            .mockResolvedValue(
              "firebase-id-token-001"
            ),
      };

      global.fetch =
        jest.fn();
    });


    afterEach(() => {
      jest.clearAllMocks();
    });


    test(
      "uses Firebase ID token and rejects anonymous auth",
      async () => {

        const token =
          await getFirebaseIdToken();

        expect(token).toBe(
          "firebase-id-token-001"
        );

        expect(
          auth.currentUser.getIdToken
        ).toHaveBeenCalledWith(false);

        auth.currentUser = {
          uid:
            "anonymous-user",

          isAnonymous:
            true,

          getIdToken:
            jest.fn(),
        };

        await expect(
          getFirebaseIdToken()
        ).rejects.toMatchObject({
          code:
            "ANONYMOUS_AUTH_NOT_ALLOWED",
        });
      }
    );


    test(
      "reads persistent device credentials from localStorage",
      () => {

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_ID,
          "device-id-0123456789abcdef0123456789abcdef"
        );

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_SECRET,
          "device-secret-0123456789abcdef0123456789abcdef0123456789abcdef"
        );

        const credentials =
          getStoredDeviceCredentials();

        expect(
          credentials.deviceId
        ).toContain(
          "device-id-"
        );

        expect(
          credentials.deviceSecret
        ).toContain(
          "device-secret-"
        );
      }
    );


    test(
      "device start sends Bearer and device credentials but never a trusted slot header",
      async () => {

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_ID,
          "device-id-0123456789abcdef0123456789abcdef"
        );

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_SECRET,
          "device-secret-0123456789abcdef0123456789abcdef0123456789abcdef"
        );

        global.fetch.mockResolvedValueOnce(
          responseJson({
            ok:
              true,

            challenge: {
              challengeToken:
                "challenge-token-test",

              expiresAt:
                "2099-01-01T00:00:00.000Z",
            },
          })
        );

        await startDeviceConfirmation({
          slot:
            "MOBILE",
        });

        expect(
          global.fetch
        ).toHaveBeenCalledTimes(1);

        const [
          path,
          options,
        ] =
          global.fetch.mock.calls[0];

        expect(path).toBe(
          "/api/access/device/start"
        );

        expect(
          options.headers.Authorization
        ).toBe(
          "Bearer firebase-id-token-001"
        );

        expect(
          options.headers[
            ACCESS_CLIENT_HEADERS.DEVICE_ID
          ]
        ).toBeTruthy();

        expect(
          options.headers[
            ACCESS_CLIENT_HEADERS.DEVICE_SECRET
          ]
        ).toBeTruthy();

        expect(
          options.headers[
            "X-Palpitaco-Device-Slot"
          ]
        ).toBeUndefined();

        expect(
          JSON.parse(options.body)
        ).toEqual({
          slot:
            "MOBILE",
        });
      }
    );


    test(
      "open session stores only access session token in sessionStorage",
      async () => {

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_ID,
          "device-id-0123456789abcdef0123456789abcdef"
        );

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_SECRET,
          "device-secret-0123456789abcdef0123456789abcdef0123456789abcdef"
        );

        global.fetch.mockResolvedValueOnce(
          responseJson({
            ok:
              true,

            session: {
              slot:
                "MOBILE",

              sessionToken:
                "access-session-token-001",
            },
          })
        );

        await openAccessSession();

        expect(
          window.sessionStorage.getItem(
            ACCESS_CLIENT_STORAGE.SESSION_TOKEN
          )
        ).toBe(
          "access-session-token-001"
        );

        expect(
          window.localStorage.getItem(
            ACCESS_CLIENT_STORAGE.SESSION_TOKEN
          )
        ).toBeNull();

        const [
          path,
          options,
        ] =
          global.fetch.mock.calls[0];

        expect(path).toBe(
          "/api/access/session/open"
        );

        expect(
          options.headers.Authorization
        ).toBe(
          "Bearer firebase-id-token-001"
        );
      }
    );


    test(
      "authorized check sends device and current session token",
      async () => {

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_ID,
          "device-id-0123456789abcdef0123456789abcdef"
        );

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_SECRET,
          "device-secret-0123456789abcdef0123456789abcdef0123456789abcdef"
        );

        window.sessionStorage.setItem(
          ACCESS_CLIENT_STORAGE.SESSION_TOKEN,
          "access-session-token-002"
        );

        global.fetch.mockResolvedValueOnce(
          responseJson({
            ok:
              true,

            accessGranted:
              true,

            access: {
              slot:
                "MOBILE",
            },
          })
        );

        const payload =
          await checkAuthorizedAccess();

        expect(
          payload.accessGranted
        ).toBe(true);

        const [
          path,
          options,
        ] =
          global.fetch.mock.calls[0];

        expect(path).toBe(
          "/api/access/check"
        );

        expect(
          options.headers[
            ACCESS_CLIENT_HEADERS.SESSION_TOKEN
          ]
        ).toBe(
          "access-session-token-002"
        );

        expect(
          options.headers[
            "X-Palpitaco-Device-Slot"
          ]
        ).toBeUndefined();
      }
    );


    test(
      "401 performs one Firebase force-refresh retry",
      async () => {

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_ID,
          "device-id-0123456789abcdef0123456789abcdef"
        );

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_SECRET,
          "device-secret-0123456789abcdef0123456789abcdef0123456789abcdef"
        );

        auth.currentUser.getIdToken =
          jest
            .fn()
            .mockResolvedValueOnce(
              "expired-token"
            )
            .mockResolvedValueOnce(
              "fresh-token"
            );

        global.fetch
          .mockResolvedValueOnce(
            responseJson(
              {
                ok:
                  false,

                error:
                  "AUTH_INVALID_TOKEN",
              },
              {
                status:
                  401,
              }
            )
          )
          .mockResolvedValueOnce(
            responseJson({
              ok:
                true,

              challenge: {
                challengeToken:
                  "challenge-token-after-refresh",
              },
            })
          );

        await startDeviceConfirmation({
          slot:
            "DESKTOP",
        });

        expect(
          auth.currentUser.getIdToken
        ).toHaveBeenNthCalledWith(
          1,
          false
        );

        expect(
          auth.currentUser.getIdToken
        ).toHaveBeenNthCalledWith(
          2,
          true
        );

        expect(
          global.fetch
        ).toHaveBeenCalledTimes(2);

        expect(
          global.fetch.mock.calls[1][1]
            .headers.Authorization
        ).toBe(
          "Bearer fresh-token"
        );
      }
    );


    test(
      "clearing runtime session preserves bound device identity",
      () => {

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_ID,
          "device-id-0123456789abcdef0123456789abcdef"
        );

        window.localStorage.setItem(
          ACCESS_CLIENT_STORAGE.DEVICE_SECRET,
          "device-secret-0123456789abcdef0123456789abcdef0123456789abcdef"
        );

        window.sessionStorage.setItem(
          ACCESS_CLIENT_STORAGE.SESSION_TOKEN,
          "access-session-token-003"
        );

        clearAccessRuntimeSession();

        expect(
          window.sessionStorage.getItem(
            ACCESS_CLIENT_STORAGE.SESSION_TOKEN
          )
        ).toBeNull();

        expect(
          window.localStorage.getItem(
            ACCESS_CLIENT_STORAGE.DEVICE_ID
          )
        ).toBeTruthy();

        expect(
          window.localStorage.getItem(
            ACCESS_CLIENT_STORAGE.DEVICE_SECRET
          )
        ).toBeTruthy();
      }
    );
  }
);