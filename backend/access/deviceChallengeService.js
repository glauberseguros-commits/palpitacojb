"use strict";

const crypto =
  require("crypto");

const {
  admin,
  getDb,
} = require("../service/firebaseAdmin");

const {
  ACCESS_PRODUCT,
  DEVICE_CONFIRMATION_POLICY,
} = require("./accessConfig");

const {
  asMillis,
  computeSubscriptionState,
} = require("./accessService");

const {
  normalizeDeviceSlot,
  normalizeDeviceCredentials,
  discoverDeviceSlotFromData,
  timingSafeHashEqual,
} = require("./deviceSessionService");

const {
  sendDeviceConfirmationEmail,
} = require("../service/accessEmail");


function makeError(
  code,
  details = null
) {
  const error =
    new Error(code);

  error.code = code;

  if (details) {
    error.details =
      details;
  }

  return error;
}


function normalizeChallengeToken(
  value
) {
  const token =
    String(value || "")
      .trim();

  if (
    token.length < 40 ||
    token.length > 128
  ) {
    return "";
  }

  if (
    !/^[A-Za-z0-9_-]+$/
      .test(token)
  ) {
    return "";
  }

  return token;
}


function normalizeConfirmationCode(
  value
) {
  const code =
    String(value || "")
      .trim();

  return /^\d{6}$/.test(code)
    ? code
    : "";
}


function hashChallengeToken(
  token
) {
  return crypto
    .createHash("sha256")
    .update(
      "device-challenge\0" +
        String(token || ""),
      "utf8"
    )
    .digest("hex");
}


function hashVerificationCode(
  code,
  salt
) {
  return crypto
    .pbkdf2Sync(
      String(code || ""),
      String(salt || ""),

      DEVICE_CONFIRMATION_POLICY
        .pbkdf2Iterations,

      DEVICE_CONFIRMATION_POLICY
        .pbkdf2KeyLength,

      DEVICE_CONFIRMATION_POLICY
        .pbkdf2Digest
    )
    .toString("hex");
}


function verifyVerificationCode(
  code,
  salt,
  expectedHash
) {
  const normalized =
    normalizeConfirmationCode(
      code
    );

  if (
    !normalized ||
    !salt ||
    !expectedHash
  ) {
    return false;
  }

  const actualHash =
    hashVerificationCode(
      normalized,
      salt
    );

  return timingSafeHashEqual(
    actualHash,
    expectedHash
  );
}


function generateChallengeMaterial() {
  const challengeToken =
    crypto
      .randomBytes(
        DEVICE_CONFIRMATION_POLICY
          .challengeTokenBytes
      )
      .toString("base64url");

  const code =
    String(
      crypto.randomInt(
        0,
        1000000
      )
    ).padStart(
      DEVICE_CONFIRMATION_POLICY
        .codeDigits,
      "0"
    );

  const codeSalt =
    crypto
      .randomBytes(
        DEVICE_CONFIRMATION_POLICY
          .codeSaltBytes
      )
      .toString("hex");

  return {
    challengeToken,

    challengeHash:
      hashChallengeToken(
        challengeToken
      ),

    code,

    codeSalt,

    codeHash:
      hashVerificationCode(
        code,
        codeSalt
      ),
  };
}


function getChallengeState(
  challenge,
  nowMs = Date.now()
) {
  const data =
    challenge &&
    typeof challenge === "object"
      ? challenge
      : {};

  const status =
    String(
      data.status || "pending"
    )
      .trim()
      .toLowerCase();

  const expiresAtMs =
    asMillis(
      data.expiresAt
    );

  const attemptsRemaining =
    Math.max(
      0,
      Number(
        data.attemptsRemaining
      ) || 0
    );

  if (
    status === "consumed"
  ) {
    return {
      state: "consumed",
      attemptsRemaining,
      expiresAtMs,
    };
  }

  if (
    status === "cancelled"
  ) {
    return {
      state: "cancelled",
      attemptsRemaining,
      expiresAtMs,
    };
  }

  if (
    status === "locked" ||
    attemptsRemaining <= 0
  ) {
    return {
      state: "locked",
      attemptsRemaining: 0,
      expiresAtMs,
    };
  }

  if (
    typeof expiresAtMs !==
      "number" ||
    expiresAtMs <= nowMs
  ) {
    return {
      state: "expired",
      attemptsRemaining,
      expiresAtMs,
    };
  }

  return {
    state: "pending",
    attemptsRemaining,
    expiresAtMs,
  };
}


function buildPublicChallengeResponse({
  challengeToken,
  slot,
  replacement,
}) {
  return {
    challengeToken,

    slot,

    confirmationRequired:
      true,

    expiresInSeconds:
      Math.floor(
        DEVICE_CONFIRMATION_POLICY
          .ttlMs /
        1000
      ),

    replacement:
      replacement === true,
  };
}


function accountRef(uid) {
  const safeUid =
    String(uid || "").trim();

  if (!safeUid) {
    throw makeError(
      "ACCESS_UID_REQUIRED"
    );
  }

  return getDb()
    .collection(
      ACCESS_PRODUCT
        .accountCollection
    )
    .doc(safeUid);
}


function challengeRef(
  uid,
  challengeHash
) {
  return accountRef(uid)
    .collection(
      ACCESS_PRODUCT
        .deviceChallengeSubcollection
    )
    .doc(
      String(
        challengeHash || ""
      )
    );
}


function assertActiveSubscription(
  accountData,
  nowMs
) {
  const state =
    computeSubscriptionState(
      accountData,
      nowMs
    );

  if (!state.active) {
    throw makeError(
      "ACTIVE_SUBSCRIPTION_REQUIRED"
    );
  }

  return state;
}


function computeRateState(
  accountData,
  nowMs
) {
  const rate =
    accountData
      ?.deviceChallengeRate &&
    typeof accountData
      .deviceChallengeRate ===
      "object"
      ? accountData
          .deviceChallengeRate
      : {};

  let windowStartedAtMs =
    asMillis(
      rate.windowStartedAt
    );

  let count =
    Math.max(
      0,
      Number(rate.count) || 0
    );

  const lastStartedAtMs =
    asMillis(
      rate.lastStartedAt
    );

  if (
    typeof windowStartedAtMs !==
      "number" ||
    nowMs -
        windowStartedAtMs >=
      DEVICE_CONFIRMATION_POLICY
        .rateWindowMs
  ) {
    windowStartedAtMs =
      nowMs;

    count = 0;
  }

  if (
    typeof lastStartedAtMs ===
      "number" &&
    nowMs -
        lastStartedAtMs <
      DEVICE_CONFIRMATION_POLICY
        .cooldownMs
  ) {
    throw makeError(
      "DEVICE_CHALLENGE_COOLDOWN"
    );
  }

  if (
    count >=
    DEVICE_CONFIRMATION_POLICY
      .maxStartsPerWindow
  ) {
    throw makeError(
      "DEVICE_CHALLENGE_RATE_LIMIT"
    );
  }

  return {
    windowStartedAtMs,
    nextCount:
      count + 1,
  };
}


async function cancelChallengeAfterDeliveryFailure({
  uid,
  slot,
  challengeHash,
  nowMs = Date.now(),
}) {
  const db =
    getDb();

  const ref =
    accountRef(uid);

  const cRef =
    challengeRef(
      uid,
      challengeHash
    );

  await db.runTransaction(
    async (tx) => {
      const accountSnap =
        await tx.get(ref);

      const challengeSnap =
        await tx.get(cRef);

      const nowTs =
        admin.firestore.Timestamp
          .fromMillis(nowMs);

      if (
        challengeSnap.exists
      ) {
        tx.set(
          cRef,
          {
            status:
              "cancelled",

            cancelledAt:
              nowTs,

            cancelReason:
              "email_delivery_failed",
          },
          { merge: true }
        );
      }

      if (
        accountSnap.exists
      ) {
        const data =
          accountSnap.data() || {};

        const pointer =
          data
            ?.pendingDeviceChallenges
            ?.[slot];

        if (
          pointer
            ?.challengeHash ===
          challengeHash
        ) {
          tx.update(
            ref,
            {
              [`pendingDeviceChallenges.${slot}`]:
                null,

              updatedAt:
                nowTs,
            }
          );
        }
      }
    }
  );
}


async function startDeviceChallenge({
  uid,
  email,
  slot,
  deviceId,
  deviceSecret,
  nowMs = Date.now(),
}) {
  const safeUid =
    String(uid || "").trim();

  const safeEmail =
    String(email || "")
      .trim()
      .toLowerCase();

  const safeSlot =
    normalizeDeviceSlot(
      slot
    );

  if (!safeUid) {
    throw makeError(
      "ACCESS_UID_REQUIRED"
    );
  }

  if (!safeEmail) {
    throw makeError(
      "AUTH_EMAIL_REQUIRED"
    );
  }

  if (!safeSlot) {
    throw makeError(
      "INVALID_DEVICE_SLOT"
    );
  }

  const credentials =
    normalizeDeviceCredentials({
      deviceId,
      deviceSecret,
    });

  const material =
    generateChallengeMaterial();

  const db =
    getDb();

  const ref =
    accountRef(safeUid);

  const cRef =
    challengeRef(
      safeUid,
      material.challengeHash
    );

  let replacement =
    false;

  await db.runTransaction(
    async (tx) => {
      const accountSnap =
        await tx.get(ref);

      const collisionSnap =
        await tx.get(cRef);

      if (!accountSnap.exists) {
        throw makeError(
          "ACCESS_ACCOUNT_NOT_FOUND"
        );
      }

      if (collisionSnap.exists) {
        throw makeError(
          "DEVICE_CHALLENGE_COLLISION"
        );
      }

      const data =
        accountSnap.data() || {};

      assertActiveSubscription(
        data,
        nowMs
      );

      const alreadyAuthorized =
        discoverDeviceSlotFromData(
          data,
          credentials
        );

      if (alreadyAuthorized) {
        throw makeError(
          "DEVICE_ALREADY_AUTHORIZED",
          {
            slot:
              alreadyAuthorized.slot,
          }
        );
      }

      const rate =
        computeRateState(
          data,
          nowMs
        );

      const existing =
        data
          ?.devices
          ?.[safeSlot];

      replacement =
        existing?.active === true;

      const nowTs =
        admin.firestore.Timestamp
          .fromMillis(nowMs);

      const expiresAtTs =
        admin.firestore.Timestamp
          .fromMillis(
            nowMs +
              DEVICE_CONFIRMATION_POLICY
                .ttlMs
          );

      tx.create(
        cRef,
        {
          schemaVersion:
            ACCESS_PRODUCT
              .schemaVersion,

          status:
            "pending",

          uid:
            safeUid,

          email:
            safeEmail,

          slot:
            safeSlot,

          challengeHash:
            material.challengeHash,

          deviceIdHash:
            credentials
              .deviceIdHash,

          deviceSecretHash:
            credentials
              .deviceSecretHash,

          codeSalt:
            material.codeSalt,

          codeHash:
            material.codeHash,

          attemptsRemaining:
            DEVICE_CONFIRMATION_POLICY
              .maxAttempts,

          replacement,

          createdAt:
            nowTs,

          expiresAt:
            expiresAtTs,
        }
      );

      tx.update(
        ref,
        {
          [`pendingDeviceChallenges.${safeSlot}`]:
            {
              challengeHash:
                material
                  .challengeHash,

              createdAt:
                nowTs,

              expiresAt:
                expiresAtTs,
            },

          deviceChallengeRate:
            {
              windowStartedAt:
                admin.firestore
                  .Timestamp
                  .fromMillis(
                    rate
                      .windowStartedAtMs
                  ),

              count:
                rate.nextCount,

              lastStartedAt:
                nowTs,
            },

          updatedAt:
            nowTs,
        }
      );
    }
  );

  try {
    await sendDeviceConfirmationEmail({
      to:
        safeEmail,

      code:
        material.code,
    });
  } catch (error) {
    try {
      await cancelChallengeAfterDeliveryFailure({
        uid:
          safeUid,

        slot:
          safeSlot,

        challengeHash:
          material
            .challengeHash,

        nowMs:
          Date.now(),
      });
    } catch (cleanupError) {
      console.error(
        "[DEVICE_CHALLENGE] cleanup after email failure:",
        cleanupError
          ?.message ||
          cleanupError
      );
    }

    throw error;
  }

  return buildPublicChallengeResponse({
    challengeToken:
      material.challengeToken,

    slot:
      safeSlot,

    replacement,
  });
}


async function confirmDeviceChallenge({
  uid,
  email,
  challengeToken,
  code,
  deviceId,
  deviceSecret,
  nowMs = Date.now(),
}) {
  const safeUid =
    String(uid || "").trim();

  const safeEmail =
    String(email || "")
      .trim()
      .toLowerCase();

  const token =
    normalizeChallengeToken(
      challengeToken
    );

  const safeCode =
    normalizeConfirmationCode(
      code
    );

  if (!safeUid) {
    throw makeError(
      "ACCESS_UID_REQUIRED"
    );
  }

  if (!safeEmail) {
    throw makeError(
      "AUTH_EMAIL_REQUIRED"
    );
  }

  if (!token) {
    throw makeError(
      "INVALID_DEVICE_CHALLENGE"
    );
  }

  if (!safeCode) {
    throw makeError(
      "INVALID_CONFIRMATION_CODE"
    );
  }

  const credentials =
    normalizeDeviceCredentials({
      deviceId,
      deviceSecret,
    });

  const challengeHash =
    hashChallengeToken(
      token
    );

  const db =
    getDb();

  const ref =
    accountRef(safeUid);

  const cRef =
    challengeRef(
      safeUid,
      challengeHash
    );

  const transactionResult =
    await db.runTransaction(
      async (tx) => {
        const accountSnap =
          await tx.get(ref);

        const challengeSnap =
          await tx.get(cRef);

        if (
          !accountSnap.exists
        ) {
          return {
            ok: false,
            code:
              "ACCESS_ACCOUNT_NOT_FOUND",
          };
        }

        if (
          !challengeSnap.exists
        ) {
          return {
            ok: false,
            code:
              "DEVICE_CHALLENGE_NOT_FOUND",
          };
        }

        const data =
          accountSnap.data() || {};

        const challenge =
          challengeSnap.data() || {};

        try {
          assertActiveSubscription(
            data,
            nowMs
          );
        } catch {
          return {
            ok: false,
            code:
              "ACTIVE_SUBSCRIPTION_REQUIRED",
          };
        }

        if (
          String(
            challenge.uid || ""
          ) !== safeUid
        ) {
          return {
            ok: false,
            code:
              "DEVICE_CHALLENGE_OWNER_MISMATCH",
          };
        }

        if (
          String(
            challenge.email || ""
          )
            .trim()
            .toLowerCase() !==
          safeEmail
        ) {
          return {
            ok: false,
            code:
              "DEVICE_CHALLENGE_EMAIL_MISMATCH",
          };
        }

        const slot =
          normalizeDeviceSlot(
            challenge.slot
          );

        if (!slot) {
          return {
            ok: false,
            code:
              "INVALID_DEVICE_SLOT",
          };
        }

        const pointer =
          data
            ?.pendingDeviceChallenges
            ?.[slot];

        if (
          pointer
            ?.challengeHash !==
          challengeHash
        ) {
          return {
            ok: false,
            code:
              "DEVICE_CHALLENGE_SUPERSEDED",
          };
        }

        const state =
          getChallengeState(
            challenge,
            nowMs
          );

        if (
          state.state ===
          "consumed"
        ) {
          return {
            ok: false,
            code:
              "DEVICE_CHALLENGE_CONSUMED",
          };
        }

        if (
          state.state ===
          "cancelled"
        ) {
          return {
            ok: false,
            code:
              "DEVICE_CHALLENGE_CANCELLED",
          };
        }

        if (
          state.state ===
          "locked"
        ) {
          return {
            ok: false,
            code:
              "DEVICE_CHALLENGE_LOCKED",
          };
        }

        if (
          state.state ===
          "expired"
        ) {
          const nowTs =
            admin.firestore.Timestamp
              .fromMillis(nowMs);

          tx.set(
            cRef,
            {
              status:
                "expired",

              expiredAt:
                nowTs,
            },
            { merge: true }
          );

          return {
            ok: false,
            code:
              "DEVICE_CHALLENGE_EXPIRED",
          };
        }

        if (
          !timingSafeHashEqual(
            challenge
              .deviceIdHash,
            credentials
              .deviceIdHash
          ) ||
          !timingSafeHashEqual(
            challenge
              .deviceSecretHash,
            credentials
              .deviceSecretHash
          )
        ) {
          return {
            ok: false,
            code:
              "DEVICE_CHALLENGE_DEVICE_MISMATCH",
          };
        }

        const codeOk =
          verifyVerificationCode(
            safeCode,

            challenge
              .codeSalt,

            challenge
              .codeHash
          );

        if (!codeOk) {
          const remaining =
            Math.max(
              0,
              state
                .attemptsRemaining -
                1
            );

          const nowTs =
            admin.firestore.Timestamp
              .fromMillis(nowMs);

          tx.set(
            cRef,
            {
              attemptsRemaining:
                remaining,

              lastFailedAttemptAt:
                nowTs,

              status:
                remaining <= 0
                  ? "locked"
                  : "pending",

              lockedAt:
                remaining <= 0
                  ? nowTs
                  : null,
            },
            { merge: true }
          );

          return {
            ok: false,

            code:
              "DEVICE_CONFIRMATION_CODE_INVALID",

            attemptsRemaining:
              remaining,
          };
        }

        const existing =
          data
            ?.devices
            ?.[slot];

        const replaced =
          existing?.active === true;

        const nowTs =
          admin.firestore.Timestamp
            .fromMillis(nowMs);

        const firstBoundAt =
          existing
            ?.firstBoundAt ||
          existing
            ?.boundAt ||
          nowTs;

        tx.update(
          ref,
          {
            [`devices.${slot}`]:
              {
                active:
                  true,

                slot,

                deviceIdHash:
                  credentials
                    .deviceIdHash,

                deviceSecretHash:
                  credentials
                    .deviceSecretHash,

                firstBoundAt,

                boundAt:
                  nowTs,

                confirmedAt:
                  nowTs,

                confirmedBy:
                  "email",

                replacedPrevious:
                  replaced,
              },

            /**
             * Qualquer substituição/vínculo
             * invalida a sessão anterior.
             */
            activeSession:
              null,

            [`pendingDeviceChallenges.${slot}`]:
              null,

            lastDeviceConfirmedAt:
              nowTs,

            updatedAt:
              nowTs,
          }
        );

        tx.set(
          cRef,
          {
            status:
              "consumed",

            attemptsRemaining:
              state
                .attemptsRemaining,

            consumedAt:
              nowTs,
          },
          { merge: true }
        );

        return {
          ok: true,

          slot,

          replaced,

          activeSessionInvalidated:
            true,
        };
      }
    );

  if (
    !transactionResult?.ok
  ) {
    throw makeError(
      transactionResult
        ?.code ||
        "DEVICE_CONFIRMATION_FAILED",

      transactionResult || null
    );
  }

  return transactionResult;
}


module.exports = {
  normalizeChallengeToken,
  normalizeConfirmationCode,

  hashChallengeToken,
  hashVerificationCode,
  verifyVerificationCode,

  generateChallengeMaterial,
  getChallengeState,
  buildPublicChallengeResponse,

  startDeviceChallenge,
  confirmDeviceChallenge,
};
