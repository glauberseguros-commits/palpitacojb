"use strict";

const crypto =
  require("crypto");

const {
  admin,
  getDb,
} = require("../service/firebaseAdmin");

const {
  ACCESS_PRODUCT,
  DEVICE_SLOT,
  DEVICE_POLICY,
} = require("./accessConfig");

const {
  computeSubscriptionState,
} = require("./accessService");


function makeError(
  code,
  message = code
) {
  const error =
    new Error(message);

  error.code = code;

  return error;
}


function normalizeDeviceSlot(value) {
  const slot =
    String(value || "")
      .trim()
      .toUpperCase();

  if (
    slot === DEVICE_SLOT.MOBILE ||
    slot === DEVICE_SLOT.DESKTOP
  ) {
    return slot;
  }

  return "";
}


function normalizeDeviceId(value) {
  const id =
    String(value || "").trim();

  if (
    id.length <
      DEVICE_POLICY.deviceIdMinLength ||
    id.length >
      DEVICE_POLICY.deviceIdMaxLength
  ) {
    return "";
  }

  if (
    !/^[A-Za-z0-9._:-]+$/
      .test(id)
  ) {
    return "";
  }

  return id;
}


function normalizeDeviceSecret(value) {
  const secret =
    String(value || "").trim();

  if (
    secret.length <
      DEVICE_POLICY.deviceSecretMinLength ||
    secret.length >
      DEVICE_POLICY.deviceSecretMaxLength
  ) {
    return "";
  }

  return secret;
}


function hashCredential(
  domain,
  value
) {
  const safeDomain =
    String(domain || "").trim();

  const safeValue =
    String(value || "");

  return crypto
    .createHash(
      DEVICE_POLICY.hashAlgorithm
    )
    .update(
      safeDomain +
        "\0" +
        safeValue,
      "utf8"
    )
    .digest("hex");
}


function timingSafeHashEqual(
  left,
  right
) {
  const a =
    String(left || "");

  const b =
    String(right || "");

  if (
    !a ||
    !b ||
    a.length !== b.length
  ) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(a, "utf8"),
      Buffer.from(b, "utf8")
    );
  } catch {
    return false;
  }
}


function createSessionToken() {
  return crypto
    .randomBytes(
      DEVICE_POLICY.sessionTokenBytes
    )
    .toString("base64url");
}


function normalizeDeviceCredentials({
  deviceId,
  deviceSecret,
}) {
  const id =
    normalizeDeviceId(
      deviceId
    );

  const secret =
    normalizeDeviceSecret(
      deviceSecret
    );

  if (!id) {
    throw makeError(
      "INVALID_DEVICE_ID"
    );
  }

  if (!secret) {
    throw makeError(
      "INVALID_DEVICE_SECRET"
    );
  }

  return {
    deviceId: id,

    deviceSecret:
      secret,

    deviceIdHash:
      hashCredential(
        "device-id",
        id
      ),

    deviceSecretHash:
      hashCredential(
        "device-secret",
        secret
      ),
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


function assertSubscriptionActiveFromData(
  accountData,
  nowMs = Date.now()
) {
  const subscription =
    computeSubscriptionState(
      accountData,
      nowMs
    );

  if (!subscription.active) {
    const error =
      makeError(
        "ACTIVE_SUBSCRIPTION_REQUIRED"
      );

    error.subscription =
      subscription;

    throw error;
  }

  return subscription;
}


/**
 * Descobre o slot pelo par
 * deviceId + deviceSecret.
 *
 * O cliente NÃO informa o slot para
 * autorização de sessão/acesso.
 */
function discoverDeviceSlotFromData(
  accountData,
  credentials
) {
  const devices =
    accountData?.devices &&
    typeof accountData.devices ===
      "object"
      ? accountData.devices
      : {};

  for (
    const slot of DEVICE_POLICY.slots
  ) {
    const stored =
      devices?.[slot];

    if (
      !stored ||
      stored.active !== true
    ) {
      continue;
    }

    const idOk =
      timingSafeHashEqual(
        stored.deviceIdHash,
        credentials.deviceIdHash
      );

    const secretOk =
      timingSafeHashEqual(
        stored.deviceSecretHash,
        credentials.deviceSecretHash
      );

    if (idOk && secretOk) {
      return {
        slot,

        deviceIdHash:
          stored.deviceIdHash,

        boundAt:
          stored.boundAt || null,
      };
    }
  }

  return null;
}


/**
 * Função pura para validar
 * a sessão armazenada.
 */
function sessionMatches(
  accountData,
  deviceMatch,
  sessionToken
) {
  if (!deviceMatch) {
    return false;
  }

  const activeSession =
    accountData?.activeSession;

  if (
    !activeSession ||
    typeof activeSession !==
      "object" ||
    activeSession.status !==
      "active"
  ) {
    return false;
  }

  if (
    activeSession.slot !==
    deviceMatch.slot
  ) {
    return false;
  }

  if (
    !timingSafeHashEqual(
      activeSession.deviceIdHash,
      deviceMatch.deviceIdHash
    )
  ) {
    return false;
  }

  const token =
    String(
      sessionToken || ""
    ).trim();

  if (!token) {
    return false;
  }

  const tokenHash =
    hashCredential(
      "session-token",
      token
    );

  return timingSafeHashEqual(
    activeSession.tokenHash,
    tokenHash
  );
}


/**
 * Vínculo interno.
 *
 * IMPORTANTE:
 * esta função NÃO será publicada em rota no B2.
 *
 * O B3 chamará esta função somente após
 * confirmação de código enviado por e-mail.
 *
 * Substituir um slot invalida imediatamente
 * qualquer sessão ativa da conta.
 */
async function bindConfirmedDevice({
  uid,
  slot,
  deviceId,
  deviceSecret,
  confirmedBy = "email",
  nowMs = Date.now(),
}) {
  const safeUid =
    String(uid || "").trim();

  const safeSlot =
    normalizeDeviceSlot(
      slot
    );

  if (!safeUid) {
    throw makeError(
      "ACCESS_UID_REQUIRED"
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

  const db =
    getDb();

  const ref =
    accountRef(safeUid);

  let replaced =
    false;

  await db.runTransaction(
    async (tx) => {
      const snap =
        await tx.get(ref);

      if (!snap.exists) {
        throw makeError(
          "ACCESS_ACCOUNT_NOT_FOUND"
        );
      }

      const data =
        snap.data() || {};

      assertSubscriptionActiveFromData(
        data,
        nowMs
      );

      const existing =
        data?.devices?.[safeSlot];

      replaced =
        existing?.active === true;

      const nowTs =
        admin.firestore.Timestamp
          .fromMillis(nowMs);

      const binding = {
        active: true,

        slot:
          safeSlot,

        deviceIdHash:
          credentials.deviceIdHash,

        deviceSecretHash:
          credentials.deviceSecretHash,

        boundAt:
          nowTs,

        confirmedAt:
          nowTs,

        confirmedBy:
          String(
            confirmedBy || "email"
          )
            .trim()
            .slice(0, 64),

        replacedPrevious:
          replaced,
      };

      tx.update(
        ref,
        {
          [`devices.${safeSlot}`]:
            binding,

          /**
           * Uma troca de dispositivo
           * revoga a sessão anterior.
           */
          activeSession:
            null,

          updatedAt:
            nowTs,
        }
      );
    }
  );

  return {
    ok: true,
    slot: safeSlot,
    replaced,
    activeSessionInvalidated:
      true,
  };
}


/**
 * Abre a única sessão ativa da conta.
 *
 * Qualquer sessão anterior é substituída
 * atomicamente pela nova.
 */
async function openAccessSession({
  uid,
  deviceId,
  deviceSecret,
  nowMs = Date.now(),
}) {
  const safeUid =
    String(uid || "").trim();

  if (!safeUid) {
    throw makeError(
      "ACCESS_UID_REQUIRED"
    );
  }

  const credentials =
    normalizeDeviceCredentials({
      deviceId,
      deviceSecret,
    });

  const token =
    createSessionToken();

  const tokenHash =
    hashCredential(
      "session-token",
      token
    );

  const db =
    getDb();

  const ref =
    accountRef(safeUid);

  let resolvedSlot =
    "";

  await db.runTransaction(
    async (tx) => {
      const snap =
        await tx.get(ref);

      if (!snap.exists) {
        throw makeError(
          "ACCESS_ACCOUNT_NOT_FOUND"
        );
      }

      const data =
        snap.data() || {};

      const subscription =
        assertSubscriptionActiveFromData(
          data,
          nowMs
        );

      const deviceMatch =
        discoverDeviceSlotFromData(
          data,
          credentials
        );

      if (!deviceMatch) {
        throw makeError(
          "DEVICE_NOT_AUTHORIZED"
        );
      }

      resolvedSlot =
        deviceMatch.slot;

      const nowTs =
        admin.firestore.Timestamp
          .fromMillis(nowMs);

      tx.update(
        ref,
        {
          /**
           * Um único campo = uma única
           * sessão ativa total por conta.
           */
          activeSession: {
            status: "active",

            slot:
              deviceMatch.slot,

            deviceIdHash:
              deviceMatch.deviceIdHash,

            tokenHash,

            openedAt:
              nowTs,

            subscriptionEndsAt:
              subscription.endsAtMs
                ? admin.firestore
                    .Timestamp
                    .fromMillis(
                      subscription
                        .endsAtMs
                    )
                : null,
          },

          updatedAt:
            nowTs,
        }
      );
    }
  );

  return {
    ok: true,

    slot:
      resolvedSlot,

    /**
     * Token bruto é devolvido somente
     * nesta resposta.
     * Firestore armazena apenas hash.
     */
    sessionToken:
      token,
  };
}


/**
 * Validação completa:
 * assinatura + dispositivo + sessão.
 */
async function validateAuthorizedAccess({
  uid,
  deviceId,
  deviceSecret,
  sessionToken,
  nowMs = Date.now(),
}) {
  const safeUid =
    String(uid || "").trim();

  if (!safeUid) {
    throw makeError(
      "ACCESS_UID_REQUIRED"
    );
  }

  const token =
    String(
      sessionToken || ""
    ).trim();

  if (!token) {
    throw makeError(
      "SESSION_TOKEN_REQUIRED"
    );
  }

  const credentials =
    normalizeDeviceCredentials({
      deviceId,
      deviceSecret,
    });

  const snap =
    await accountRef(
      safeUid
    ).get();

  if (!snap.exists) {
    throw makeError(
      "ACCESS_ACCOUNT_NOT_FOUND"
    );
  }

  const data =
    snap.data() || {};

  const subscription =
    assertSubscriptionActiveFromData(
      data,
      nowMs
    );

  const deviceMatch =
    discoverDeviceSlotFromData(
      data,
      credentials
    );

  if (!deviceMatch) {
    throw makeError(
      "DEVICE_NOT_AUTHORIZED"
    );
  }

  if (
    !sessionMatches(
      data,
      deviceMatch,
      token
    )
  ) {
    throw makeError(
      "ACTIVE_SESSION_REQUIRED"
    );
  }

  return {
    ok: true,

    uid:
      safeUid,

    slot:
      deviceMatch.slot,

    subscription,
  };
}


/**
 * Logout da sessão ativa.
 *
 * Só o dispositivo/sessão atualmente
 * autorizados podem encerrá-la.
 */
async function closeAccessSession({
  uid,
  deviceId,
  deviceSecret,
  sessionToken,
  nowMs = Date.now(),
}) {
  const safeUid =
    String(uid || "").trim();

  if (!safeUid) {
    throw makeError(
      "ACCESS_UID_REQUIRED"
    );
  }

  const credentials =
    normalizeDeviceCredentials({
      deviceId,
      deviceSecret,
    });

  const token =
    String(
      sessionToken || ""
    ).trim();

  if (!token) {
    throw makeError(
      "SESSION_TOKEN_REQUIRED"
    );
  }

  const db =
    getDb();

  const ref =
    accountRef(safeUid);

  let closedSlot =
    "";

  await db.runTransaction(
    async (tx) => {
      const snap =
        await tx.get(ref);

      if (!snap.exists) {
        throw makeError(
          "ACCESS_ACCOUNT_NOT_FOUND"
        );
      }

      const data =
        snap.data() || {};

      assertSubscriptionActiveFromData(
        data,
        nowMs
      );

      const deviceMatch =
        discoverDeviceSlotFromData(
          data,
          credentials
        );

      if (!deviceMatch) {
        throw makeError(
          "DEVICE_NOT_AUTHORIZED"
        );
      }

      if (
        !sessionMatches(
          data,
          deviceMatch,
          token
        )
      ) {
        throw makeError(
          "ACTIVE_SESSION_REQUIRED"
        );
      }

      closedSlot =
        deviceMatch.slot;

      const nowTs =
        admin.firestore.Timestamp
          .fromMillis(nowMs);

      tx.update(
        ref,
        {
          activeSession:
            null,

          lastSessionClosedAt:
            nowTs,

          updatedAt:
            nowTs,
        }
      );
    }
  );

  return {
    ok: true,
    closed: true,
    slot: closedSlot,
  };
}


module.exports = {
  normalizeDeviceSlot,
  normalizeDeviceId,
  normalizeDeviceSecret,
  normalizeDeviceCredentials,

  hashCredential,
  timingSafeHashEqual,

  discoverDeviceSlotFromData,
  sessionMatches,

  bindConfirmedDevice,
  openAccessSession,
  validateAuthorizedAccess,
  closeAccessSession,
};
