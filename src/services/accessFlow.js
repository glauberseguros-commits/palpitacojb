import {
  clearAccessRuntimeSession,
  getMyAccess,
  closeAccessSession,
} from "./accessClient";


export const ACCESS_FLOW_STATE =
  Object.freeze({
    AUTHORIZED:
      "AUTHORIZED",

    SUBSCRIPTION_REQUIRED:
      "SUBSCRIPTION_REQUIRED",
  });


export function isSubscriptionActive(
  mePayload
) {
  return (
    mePayload
      ?.access
      ?.subscription
      ?.active === true
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
      String(
        reason || ""
      ).trim(),

    user:
      mePayload?.user ||
      null,

    access:
      mePayload?.access ||
      null,
  };
}


function authorizedState(
  mePayload
) {
  return {
    state:
      ACCESS_FLOW_STATE.AUTHORIZED,

    accessGranted:
      true,

    authority:
      "ADMIN_SUBSCRIPTION_SOVEREIGN",

    user:
      mePayload?.user ||
      null,

    access:
      mePayload?.access ||
      null,

    session:
      null,

    reusedSession:
      false,
  };
}


export async function bootstrapAuthorizedAccess() {
  const me =
    await getMyAccess();

  /*
   * Device/session antigos não possuem mais
   * autoridade para bloquear acesso.
   */
  clearAccessRuntimeSession();

  if (
    !isSubscriptionActive(me)
  ) {
    return subscriptionRequiredState(
      me,
      String(
        me
          ?.access
          ?.subscription
          ?.status ||
        "INACTIVE"
      ).toUpperCase()
    );
  }

  return authorizedState(me);
}


/*
 * Compatibilidade com consumidores antigos.
 * Não cria challenge e não exige código.
 */
export async function confirmDeviceAndAuthorize() {
  return bootstrapAuthorizedAccess();
}


export async function closeAuthoritativeAccess() {
  try {
    return await closeAccessSession();
  }
  finally {
    clearAccessRuntimeSession();
  }
}


const accessFlow = {
  ACCESS_FLOW_STATE,
  isSubscriptionActive,
  bootstrapAuthorizedAccess,
  confirmDeviceAndAuthorize,
  closeAuthoritativeAccess,
};

export default accessFlow;
