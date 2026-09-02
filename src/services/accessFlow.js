import {
  getStoredAccessSessionToken,
  clearAccessRuntimeSession,
  detectRegistrationDeviceSlot,
  getMyAccess,
  startDeviceConfirmation,
  confirmDeviceConfirmation,
  openAccessSession,
  closeAccessSession,
  checkAuthorizedAccess,
} from "./accessClient";


export const ACCESS_FLOW_STATE = Object.freeze({
  AUTHORIZED: "AUTHORIZED",
  SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
  DEVICE_CONFIRMATION_REQUIRED: "DEVICE_CONFIRMATION_REQUIRED",
});


function normalizeErrorCode(error) {
  return String(
    error?.code ||
    error?.payload?.error ||
    error?.error ||
    ""
  )
    .trim()
    .toUpperCase();
}


function createFlowError(
  code,
  message
) {
  const error =
    new Error(
      String(message || code)
    );

  error.code =
    String(code || "ACCESS_FLOW_ERROR");

  return error;
}


export function isSubscriptionActive(
  mePayload
) {
  const access =
    mePayload?.access ||
    null;

  return (
    access?.accessGranted === true &&
    access?.subscription?.active === true
  );
}


function subscriptionRequiredState(
  mePayload,
  reason = ""
) {
  return {
    state:
      ACCESS_FLOW_STATE
        .SUBSCRIPTION_REQUIRED,

    accessGranted:
      false,

    reason:
      String(reason || "").trim(),

    user:
      mePayload?.user || null,

    access:
      mePayload?.access || null,
  };
}


function authorizedState({
  check,
  me = null,
  session = null,
  reusedSession = false,
} = {}) {
  if (
    check?.accessGranted !== true
  ) {
    throw createFlowError(
      "ACCESS_NOT_GRANTED",
      "Backend nao concedeu acesso."
    );
  }

  return {
    state:
      ACCESS_FLOW_STATE.AUTHORIZED,

    accessGranted:
      true,

    user:
      me?.user || null,

    access:
      check?.access ||
      me?.access ||
      null,

    session:
      session || null,

    reusedSession:
      reusedSession === true,
  };
}


async function tryStoredSession() {
  const storedToken =
    getStoredAccessSessionToken();

  if (!storedToken) {
    return null;
  }

  try {
    const check =
      await checkAuthorizedAccess();

    return authorizedState({
      check,
      reusedSession:
        true,
    });
  }
  catch {
    clearAccessRuntimeSession();
    return null;
  }
}


export async function bootstrapAuthorizedAccess() {
  const existing =
    await tryStoredSession();

  if (existing) {
    return existing;
  }

  const me =
    await getMyAccess();

  if (
    !isSubscriptionActive(me)
  ) {
    clearAccessRuntimeSession();

    return subscriptionRequiredState(
      me,
      String(
        me?.access?.subscription?.status ||
        me?.access?.status ||
        "INACTIVE"
      ).toUpperCase()
    );
  }

  let opened = null;

  try {
    opened =
      await openAccessSession();
  }
  catch (error) {
    const code =
      normalizeErrorCode(error);

    if (
      code ===
        "ACTIVE_SUBSCRIPTION_REQUIRED" ||
      code ===
        "ACCESS_ACCOUNT_NOT_FOUND"
    ) {
      clearAccessRuntimeSession();

      return subscriptionRequiredState(
        me,
        code
      );
    }

    if (
      code !==
      "DEVICE_NOT_AUTHORIZED"
    ) {
      throw error;
    }

    const slot =
      detectRegistrationDeviceSlot();

    const challengePayload =
      await startDeviceConfirmation({
        slot,
      });

    const challenge =
      challengePayload?.challenge ||
      null;

    const challengeToken =
      String(
        challenge?.challengeToken ||
        ""
      ).trim();

    if (!challengeToken) {
      throw createFlowError(
        "DEVICE_CHALLENGE_TOKEN_MISSING",
        "Backend nao retornou token do desafio de dispositivo."
      );
    }

    return {
      state:
        ACCESS_FLOW_STATE
          .DEVICE_CONFIRMATION_REQUIRED,

      accessGranted:
        false,

      slot,

      user:
        me?.user || null,

      access:
        me?.access || null,

      challenge,

      challengeToken,
    };
  }

  const check =
    await checkAuthorizedAccess();

  return authorizedState({
    check,
    me,

    session:
      opened?.session || null,

    reusedSession:
      false,
  });
}


export async function confirmDeviceAndAuthorize({
  challengeToken,
  code,
} = {}) {
  const token =
    String(
      challengeToken || ""
    ).trim();

  const confirmationCode =
    String(
      code || ""
    )
      .replace(/\D/g, "");

  if (!token) {
    throw createFlowError(
      "DEVICE_CHALLENGE_TOKEN_REQUIRED",
      "Token do desafio de dispositivo ausente."
    );
  }

  if (
    !/^\d{6}$/.test(
      confirmationCode
    )
  ) {
    throw createFlowError(
      "DEVICE_CONFIRMATION_CODE_INVALID",
      "O codigo de confirmacao deve conter 6 digitos."
    );
  }

  await confirmDeviceConfirmation({
    challengeToken:
      token,

    code:
      confirmationCode,
  });

  const opened =
    await openAccessSession();

  const check =
    await checkAuthorizedAccess();

  return authorizedState({
    check,

    session:
      opened?.session || null,

    reusedSession:
      false,
  });
}


export async function closeAuthoritativeAccess() {
  try {
    return await closeAccessSession();
  }
  finally {
    clearAccessRuntimeSession();
  }
}


export default {
  ACCESS_FLOW_STATE,

  isSubscriptionActive,

  bootstrapAuthorizedAccess,
  confirmDeviceAndAuthorize,
  closeAuthoritativeAccess,
};