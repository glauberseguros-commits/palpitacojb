import { auth, authReady } from "./firebase";
import { apiUrl } from "../config/apiBase";

/**
 * ============================================================
 * PALPITACO JB - AUTHORITATIVE ACCESS CLIENT
 * ============================================================
 *
 * Responsabilidades:
 *
 * - Firebase Auth prova identidade.
 * - Backend decide assinatura.
 * - Backend decide dispositivo autorizado.
 * - Backend decide sessao ativa.
 *
 * Persistencia:
 *
 * localStorage:
 *   deviceId
 *   deviceSecret
 *
 * sessionStorage:
 *   access session token
 *
 * O token de sessao NUNCA deve ser persistido em localStorage.
 */

export const ACCESS_CLIENT_STORAGE = Object.freeze({
  DEVICE_ID:
    "pp_access_device_id_v1",

  DEVICE_SECRET:
    "pp_access_device_secret_v1",

  SESSION_TOKEN:
    "pp_access_session_token_v1",
});

export const ACCESS_CLIENT_HEADERS = Object.freeze({
  DEVICE_ID:
    "X-Palpitaco-Device-Id",

  DEVICE_SECRET:
    "X-Palpitaco-Device-Secret",

  SESSION_TOKEN:
    "X-Palpitaco-Session-Token",
});

export const ACCESS_DEVICE_SLOT = Object.freeze({
  MOBILE:
    "MOBILE",

  DESKTOP:
    "DESKTOP",
});


export class AccessClientError extends Error {
  constructor(
    code,
    message,
    {
      status = 0,
      payload = null,
    } = {}
  ) {
    super(
      String(
        message ||
        code ||
        "ACCESS_CLIENT_ERROR"
      )
    );

    this.name =
      "AccessClientError";

    this.code =
      String(
        code ||
        "ACCESS_CLIENT_ERROR"
      );

    this.status =
      Number(status || 0);

    this.payload =
      payload &&
      typeof payload === "object"
        ? payload
        : null;
  }
}


function hasWindow() {
  return (
    typeof window !== "undefined"
  );
}


function localStore() {
  if (!hasWindow()) {
    throw new AccessClientError(
      "LOCAL_STORAGE_UNAVAILABLE",
      "Armazenamento local indisponivel."
    );
  }

  try {
    const storage =
      window.localStorage;

    const probe =
      "__pp_access_local_probe__";

    storage.setItem(
      probe,
      "1"
    );

    storage.removeItem(
      probe
    );

    return storage;
  } catch {
    throw new AccessClientError(
      "LOCAL_STORAGE_UNAVAILABLE",
      "Armazenamento local indisponivel."
    );
  }
}


function sessionStore() {
  if (!hasWindow()) {
    throw new AccessClientError(
      "SESSION_STORAGE_UNAVAILABLE",
      "Armazenamento de sessao indisponivel."
    );
  }

  try {
    const storage =
      window.sessionStorage;

    const probe =
      "__pp_access_session_probe__";

    storage.setItem(
      probe,
      "1"
    );

    storage.removeItem(
      probe
    );

    return storage;
  } catch {
    throw new AccessClientError(
      "SESSION_STORAGE_UNAVAILABLE",
      "Armazenamento de sessao indisponivel."
    );
  }
}


function secureRandomHex(
  byteLength
) {
  const cryptoApi =
    typeof window !== "undefined"
      ? window.crypto
      : null;

  if (
    !cryptoApi ||
    typeof cryptoApi.getRandomValues !==
      "function"
  ) {
    throw new AccessClientError(
      "SECURE_RANDOM_UNAVAILABLE",
      "Gerador criptografico seguro indisponivel."
    );
  }

  const size =
    Math.max(
      16,
      Number(byteLength || 0)
    );

  const bytes =
    new Uint8Array(size);

  cryptoApi.getRandomValues(
    bytes
  );

  return Array.from(bytes)
    .map((value) =>
      value
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}


function validDeviceId(
  value
) {
  const text =
    String(value || "").trim();

  return (
    text.length >= 32 &&
    text.length <= 256
  );
}


function validDeviceSecret(
  value
) {
  const text =
    String(value || "").trim();

  return (
    text.length >= 32 &&
    text.length <= 512
  );
}


export function getStoredDeviceCredentials() {
  const storage =
    localStore();

  const deviceId =
    String(
      storage.getItem(
        ACCESS_CLIENT_STORAGE.DEVICE_ID
      ) || ""
    ).trim();

  const deviceSecret =
    String(
      storage.getItem(
        ACCESS_CLIENT_STORAGE.DEVICE_SECRET
      ) || ""
    ).trim();

  if (
    !validDeviceId(deviceId) ||
    !validDeviceSecret(deviceSecret)
  ) {
    return null;
  }

  return {
    deviceId,
    deviceSecret,
  };
}


export function getOrCreateDeviceCredentials() {
  const existing =
    getStoredDeviceCredentials();

  if (existing) {
    return existing;
  }

  const storage =
    localStore();

  /**
   * 24 bytes = 192 bits para ID.
   * 32 bytes = 256 bits para segredo.
   */
  const deviceId =
    secureRandomHex(24);

  const deviceSecret =
    secureRandomHex(32);

  storage.setItem(
    ACCESS_CLIENT_STORAGE.DEVICE_ID,
    deviceId
  );

  storage.setItem(
    ACCESS_CLIENT_STORAGE.DEVICE_SECRET,
    deviceSecret
  );

  return {
    deviceId,
    deviceSecret,
  };
}


export function clearStoredDeviceCredentials() {
  const storage =
    localStore();

  storage.removeItem(
    ACCESS_CLIENT_STORAGE.DEVICE_ID
  );

  storage.removeItem(
    ACCESS_CLIENT_STORAGE.DEVICE_SECRET
  );
}


export function getStoredAccessSessionToken() {
  const storage =
    sessionStore();

  return String(
    storage.getItem(
      ACCESS_CLIENT_STORAGE.SESSION_TOKEN
    ) || ""
  ).trim();
}


function saveAccessSessionToken(
  sessionToken
) {
  const token =
    String(
      sessionToken || ""
    ).trim();

  if (!token) {
    throw new AccessClientError(
      "ACCESS_SESSION_TOKEN_MISSING",
      "Backend nao retornou token de sessao."
    );
  }

  const storage =
    sessionStore();

  storage.setItem(
    ACCESS_CLIENT_STORAGE.SESSION_TOKEN,
    token
  );

  return token;
}


export function clearAccessRuntimeSession() {
  const storage =
    sessionStore();

  storage.removeItem(
    ACCESS_CLIENT_STORAGE.SESSION_TOKEN
  );
}


export function detectRegistrationDeviceSlot() {
  if (
    typeof navigator === "undefined"
  ) {
    return ACCESS_DEVICE_SLOT.DESKTOP;
  }

  const ua =
    String(
      navigator.userAgent || ""
    );

  const mobileByUserAgent =
    /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(
      ua
    );

  const ipadDesktopUserAgent =
    String(
      navigator.platform || ""
    ) === "MacIntel" &&
    Number(
      navigator.maxTouchPoints || 0
    ) > 1;

  return (
    mobileByUserAgent ||
    ipadDesktopUserAgent
  )
    ? ACCESS_DEVICE_SLOT.MOBILE
    : ACCESS_DEVICE_SLOT.DESKTOP;
}


function normalizeRegistrationSlot(
  slot
) {
  const value =
    String(slot || "")
      .trim()
      .toUpperCase();

  if (
    value ===
    ACCESS_DEVICE_SLOT.MOBILE
  ) {
    return ACCESS_DEVICE_SLOT.MOBILE;
  }

  if (
    value ===
    ACCESS_DEVICE_SLOT.DESKTOP
  ) {
    return ACCESS_DEVICE_SLOT.DESKTOP;
  }

  throw new AccessClientError(
    "INVALID_DEVICE_SLOT",
    "Slot de dispositivo invalido."
  );
}


async function waitAuthReady() {
  try {
    await authReady;
  } catch {
    throw new AccessClientError(
      "FIREBASE_AUTH_NOT_READY",
      "Firebase Auth nao esta pronto."
    );
  }
}


export async function getFirebaseIdToken(
  forceRefresh = false
) {
  await waitAuthReady();

  const user =
    auth.currentUser;

  if (!user) {
    throw new AccessClientError(
      "AUTH_REQUIRED",
      "Autenticacao obrigatoria."
    );
  }

  if (user.isAnonymous === true) {
    throw new AccessClientError(
      "ANONYMOUS_AUTH_NOT_ALLOWED",
      "Autenticacao anonima nao e aceita."
    );
  }

  if (
    typeof user.getIdToken !==
    "function"
  ) {
    throw new AccessClientError(
      "FIREBASE_ID_TOKEN_UNAVAILABLE",
      "Firebase ID token indisponivel."
    );
  }

  const token =
    String(
      await user.getIdToken(
        forceRefresh === true
      )
    ).trim();

  if (!token) {
    throw new AccessClientError(
      "FIREBASE_ID_TOKEN_EMPTY",
      "Firebase ID token vazio."
    );
  }

  return token;
}


async function parseResponseJson(
  response
) {
  try {
    const text =
      await response.text();

    if (!text) {
      return {};
    }

    const parsed =
      JSON.parse(text);

    return (
      parsed &&
      typeof parsed === "object"
    )
      ? parsed
      : {};
  } catch {
    return {};
  }
}


function payloadErrorCode(
  payload,
  response
) {
  const code =
    String(
      payload?.error ||
      payload?.code ||
      ""
    ).trim();

  if (code) {
    return code;
  }

  return (
    `HTTP_${Number(
      response?.status || 0
    ) || 0}`
  );
}


async function accessRequest(
  path,
  {
    method = "GET",
    body,
    authRequired = true,
    includeDevice = false,
    includeSession = false,
    retryAuth = true,
    forceRefreshToken = false,
  } = {}
) {
  const headers = {
    Accept:
      "application/json",
  };

  if (
    body !== undefined
  ) {
    headers["Content-Type"] =
      "application/json";
  }

  if (authRequired) {
    const idToken =
      await getFirebaseIdToken(
        forceRefreshToken
      );

    headers.Authorization =
      `Bearer ${idToken}`;
  }

  if (includeDevice) {
    const credentials =
      getOrCreateDeviceCredentials();

    headers[
      ACCESS_CLIENT_HEADERS.DEVICE_ID
    ] =
      credentials.deviceId;

    headers[
      ACCESS_CLIENT_HEADERS.DEVICE_SECRET
    ] =
      credentials.deviceSecret;
  }

  if (includeSession) {
    const sessionToken =
      getStoredAccessSessionToken();

    if (!sessionToken) {
      throw new AccessClientError(
        "ACCESS_SESSION_REQUIRED",
        "Sessao de acesso obrigatoria."
      );
    }

    headers[
      ACCESS_CLIENT_HEADERS.SESSION_TOKEN
    ] =
      sessionToken;
  }

  let response;

  try {
    response =
      await fetch(
        apiUrl(path),
        {
          method,
          headers,

          body:
            body === undefined
              ? undefined
              : JSON.stringify(body),

          cache:
            "no-store",
        }
      );
  } catch {
    throw new AccessClientError(
      "ACCESS_NETWORK_ERROR",
      "Falha de comunicacao com o servidor."
    );
  }

  /**
   * Um unico retry permitido quando o Firebase ID token
   * estiver expirado/rejeitado.
   *
   * O retry renova SOMENTE o Firebase ID token.
   * Device e access session continuam os mesmos.
   */
  if (
    authRequired &&
    response.status === 401 &&
    retryAuth === true
  ) {
    return accessRequest(
      path,
      {
        method,
        body,
        authRequired,
        includeDevice,
        includeSession,

        retryAuth:
          false,

        forceRefreshToken:
          true,
      }
    );
  }

  const payload =
    await parseResponseJson(
      response
    );

  if (
    !response.ok ||
    payload?.ok === false
  ) {
    const code =
      payloadErrorCode(
        payload,
        response
      );

    throw new AccessClientError(
      code,
      String(
        payload?.message ||
        payload?.error ||
        code
      ),
      {
        status:
          response.status,

        payload,
      }
    );
  }

  return payload;
}


/**
 * Produto comercial publico.
 */
export async function getAccessProduct() {
  return accessRequest(
    "/api/access/product",
    {
      authRequired:
        false,
    }
  );
}


/**
 * Firebase user + estado da assinatura.
 *
 * Nao exige dispositivo/sessao.
 */
export async function getMyAccess() {
  return accessRequest(
    "/api/access/me"
  );
}


/**
 * Consulta administrativa do acesso de um usuario.
 */
export async function getAdminUserAccess(
  uid
) {
  const safeUid =
    String(uid || "").trim();

  if (!safeUid) {
    throw new AccessClientError(
      "UID_REQUIRED",
      "UID do usuario e obrigatorio."
    );
  }

  return accessRequest(
    `/api/access/admin/user/${encodeURIComponent(
      safeUid
    )}`
  );
}


/**
 * Ativa ou renova +30 dias pelo backend autoritativo.
 */
export async function activateAdminUserAccess({
  uid,
  operationId,
  paymentReference = "",
} = {}) {
  const safeUid =
    String(uid || "").trim();

  const safeOperationId =
    String(operationId || "").trim();

  if (!safeUid) {
    throw new AccessClientError(
      "UID_REQUIRED",
      "UID do usuario e obrigatorio."
    );
  }

  if (!safeOperationId) {
    throw new AccessClientError(
      "OPERATION_ID_REQUIRED",
      "operationId e obrigatorio."
    );
  }

  return accessRequest(
    "/api/access/admin/activate",
    {
      method:
        "POST",

      body: {
        uid:
          safeUid,

        operationId:
          safeOperationId,

        paymentReference:
          String(
            paymentReference || ""
          ).trim(),
      },
    }
  );
}


/**
 * Revoga assinatura pelo backend autoritativo.
 */
export async function revokeAdminUserAccess({
  uid,
  operationId,
  reason = "",
} = {}) {
  const safeUid =
    String(uid || "").trim();

  const safeOperationId =
    String(operationId || "").trim();

  if (!safeUid) {
    throw new AccessClientError(
      "UID_REQUIRED",
      "UID do usuario e obrigatorio."
    );
  }

  if (!safeOperationId) {
    throw new AccessClientError(
      "OPERATION_ID_REQUIRED",
      "operationId e obrigatorio."
    );
  }

  return accessRequest(
    "/api/access/admin/revoke",
    {
      method:
        "POST",

      body: {
        uid:
          safeUid,

        operationId:
          safeOperationId,

        reason:
          String(
            reason || ""
          ).trim(),
      },
    }
  );
}


/**
 * Inicia confirmacao de dispositivo.
 *
 * O slot existe somente no fluxo de REGISTRO.
 *
 * O backend de autorizacao posterior NAO recebe
 * nem confia em header de slot.
 */
export async function startDeviceConfirmation({
  slot =
    detectRegistrationDeviceSlot(),
} = {}) {
  const normalizedSlot =
    normalizeRegistrationSlot(
      slot
    );

  return accessRequest(
    "/api/access/device/start",
    {
      method:
        "POST",

      body: {
        slot:
          normalizedSlot,
      },

      includeDevice:
        true,
    }
  );
}


/**
 * Confirma codigo enviado por e-mail.
 */
export async function confirmDeviceConfirmation({
  challengeToken,
  code,
} = {}) {
  const challenge =
    String(
      challengeToken || ""
    ).trim();

  const confirmationCode =
    String(
      code || ""
    ).trim();

  if (!challenge) {
    throw new AccessClientError(
      "DEVICE_CHALLENGE_TOKEN_REQUIRED",
      "Challenge token obrigatorio."
    );
  }

  if (
    !/^\d{6}$/.test(
      confirmationCode
    )
  ) {
    throw new AccessClientError(
      "DEVICE_CONFIRMATION_CODE_INVALID",
      "Codigo de confirmacao invalido."
    );
  }

  return accessRequest(
    "/api/access/device/confirm",
    {
      method:
        "POST",

      body: {
        challengeToken:
          challenge,

        code:
          confirmationCode,
      },

      includeDevice:
        true,
    }
  );
}


/**
 * Abre/rotaciona a unica sessao ativa.
 *
 * O sessionToken bruto existe somente no browser,
 * em sessionStorage.
 */
export async function openAccessSession() {
  const payload =
    await accessRequest(
      "/api/access/session/open",
      {
        method:
          "POST",

        includeDevice:
          true,
      }
    );

  const sessionToken =
    String(
      payload?.session?.sessionToken ||
      ""
    ).trim();

  saveAccessSessionToken(
    sessionToken
  );

  return payload;
}


/**
 * Fecha sessao no backend e remove sempre
 * o token local de runtime.
 */
export async function closeAccessSession() {
  const sessionToken =
    getStoredAccessSessionToken();

  if (!sessionToken) {
    clearAccessRuntimeSession();

    return {
      ok:
        true,

      alreadyClosed:
        true,
    };
  }

  try {
    return await accessRequest(
      "/api/access/session/close",
      {
        method:
          "POST",

        includeDevice:
          true,

        includeSession:
          true,
      }
    );
  } finally {
    clearAccessRuntimeSession();
  }
}


/**
 * Check autoritativo completo:
 *
 * Firebase user
 * + assinatura ativa
 * + dispositivo reconhecido
 * + sessao ativa atual.
 */
export async function checkAuthorizedAccess() {
  const payload =
    await accessRequest(
      "/api/access/check",
      {
        includeDevice:
          true,

        includeSession:
          true,
      }
    );

  if (
    payload?.accessGranted !== true
  ) {
    throw new AccessClientError(
      "ACCESS_NOT_GRANTED",
      "Backend nao concedeu acesso."
    );
  }

  return payload;
}


export default {
  getAccessProduct,
  getMyAccess,

  getStoredDeviceCredentials,
  getOrCreateDeviceCredentials,
  clearStoredDeviceCredentials,

  getStoredAccessSessionToken,
  clearAccessRuntimeSession,

  detectRegistrationDeviceSlot,

  getFirebaseIdToken,

  startDeviceConfirmation,
  confirmDeviceConfirmation,

  openAccessSession,
  closeAccessSession,
  checkAuthorizedAccess,
};