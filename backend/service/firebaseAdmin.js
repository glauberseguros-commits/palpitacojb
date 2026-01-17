// backend/service/firebaseAdmin.js
"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

let _db = null;
let _inited = false;

/**
 * Carrega variáveis do backend/.env.local (se existir)
 * Só define se ainda não existir no process.env
 */
(function loadEnvLocal() {
  try {
    const envPath = path.join(__dirname, "..", ".env.local");
    if (!fs.existsSync(envPath)) return;

    const raw = fs.readFileSync(envPath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      let s = String(line || "");
      s = s.replace(/^\uFEFF/, "").trim(); // remove BOM invisível
      if (!s || s.startsWith("#")) return;

      const i = s.indexOf("=");
      if (i <= 0) return;

      const k = s.slice(0, i).trim().replace(/^\uFEFF/, "");
      const v = s.slice(i + 1).trim();

      if (k && v && !process.env[k]) process.env[k] = v;
    });
  } catch {
    // silencioso por design
  }
})();

/* =========================
   Helpers
========================= */

function normalizePath(p) {
  let s = String(p || "").trim().replace(/^\uFEFF/, "");

  // remove aspas se vier "C:\..." ou 'C:\...'
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }

  // aceita caminho relativo (a partir da raiz do repo)
  if (s && !path.isAbsolute(s)) {
    s = path.resolve(path.join(__dirname, "..", ".."), s);
  }

  return s || "";
}

function resolveCredentialsPath() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const p = normalizePath(raw);
  if (!p) return null;

  try {
    if (fs.existsSync(p) && fs.lstatSync(p).isFile()) return p;
  } catch {
    // ignore
  }
  return null;
}

function safeJsonParse(s) {
  try {
    const obj = JSON.parse(String(s || ""));
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function normalizePrivateKey(sa) {
  // Corrige casos de private_key vindo com "\\n" nas envs
  if (sa && sa.private_key && typeof sa.private_key === "string") {
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  }
  return sa;
}

function readServiceAccountFromEnv() {
  // 1) JSON direto
  const rawJson = process.env.FIREBASE_ADMIN_SA_JSON;
  if (rawJson) {
    const sa = safeJsonParse(rawJson);
    if (sa) return normalizePrivateKey(sa);
  }

  // 2) JSON em base64
  const rawB64 = process.env.FIREBASE_ADMIN_SA_BASE64;
  if (rawB64) {
    try {
      const decoded = Buffer.from(String(rawB64), "base64").toString("utf8");
      const sa = safeJsonParse(decoded);
      if (sa) return normalizePrivateKey(sa);
    } catch {
      // ignore
    }
  }

  return null;
}

function initAdmin() {
  if (_inited) return admin;

  // Se já existe app inicializado (hot reload / múltiplos imports)
  if (admin.apps && admin.apps.length) {
    _inited = true;
    return admin;
  }

  // ✅ Preferência 1: credencial por ENV (melhor pra deploy)
  const saFromEnv = readServiceAccountFromEnv();
  if (saFromEnv) {
    admin.initializeApp({
      credential: admin.credential.cert(saFromEnv),
    });
    _inited = true;
    return admin;
  }

  // ✅ Preferência 2: caminho do arquivo via GOOGLE_APPLICATION_CREDENTIALS
  const credsPath = resolveCredentialsPath();
  if (credsPath) {
    const json = JSON.parse(fs.readFileSync(credsPath, "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(normalizePrivateKey(json)),
    });
    _inited = true;
    return admin;
  }

  // ✅ Preferência 3: ADC (funciona em alguns ambientes cloud)
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    _inited = true;
    return admin;
  } catch (e) {
    const hint =
      "Credenciais Firebase Admin ausentes.\n\n" +
      "Escolha UMA das opções:\n" +
      "A) Arquivo (local): defina GOOGLE_APPLICATION_CREDENTIALS apontando para o JSON.\n" +
      '   PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\\\caminho\\\\sua-chave.json"\n' +
      '   Relativo:   $env:GOOGLE_APPLICATION_CREDENTIALS="backend\\\\secrets\\\\firebase-admin.json"\n\n' +
      "B) Deploy (recomendado): cole o JSON do service account em FIREBASE_ADMIN_SA_JSON\n" +
      "   (ou base64 em FIREBASE_ADMIN_SA_BASE64)\n\n";

    throw new Error(
      hint + (e && e.message ? `Detalhe: ${e.message}\n` : "")
    );
  }
}

/**
 * Retorna Firestore admin.
 * - Lazy: só inicializa quando acessado.
 * - forceNew: útil em debugging (não use em produção).
 */
function getDb(forceNew = false) {
  if (_db && !forceNew) return _db;

  initAdmin();
  _db = admin.firestore();
  return _db;
}

/**
 * ✅ Compat:
 * scripts antigos fazem:
 * const { admin, db } = require("../service/firebaseAdmin")
 */
const exportsObj = {
  admin,
  initAdmin,
  getDb,
};

Object.defineProperty(exportsObj, "db", {
  enumerable: true,
  get() {
    return getDb(false);
  },
});

module.exports = exportsObj;
