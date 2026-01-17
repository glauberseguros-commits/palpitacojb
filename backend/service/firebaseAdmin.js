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
      const s = String(line || "").trim();
      if (!s || s.startsWith("#")) return;

      const i = s.indexOf("=");
      if (i <= 0) return;

      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim();
      if (k && v && !process.env[k]) process.env[k] = v;
    });
  } catch {
    // silencioso por design
  }
})();

function tryParseServiceAccountFromEnv() {
  // 1) JSON puro
  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (rawJson) {
    try {
      const obj = JSON.parse(rawJson);
      if (obj && typeof obj === "object" && obj.project_id && obj.client_email) return obj;
    } catch (e) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON inválido (não é JSON válido).");
    }
  }

  // 2) Base64
  const b64 = String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (b64) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      const obj = JSON.parse(decoded);
      if (obj && typeof obj === "object" && obj.project_id && obj.client_email) return obj;
      throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 decodificou, mas JSON é inválido.");
    } catch (e) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 inválido (base64/JSON).");
    }
  }

  return null;
}

function resolveCredentialsPath() {
  const p = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!p) return null;
  try {
    if (fs.existsSync(p) && fs.lstatSync(p).isFile()) return p;
  } catch {
    // ignore
  }
  return null;
}

function initAdmin() {
  if (_inited) return admin;
  if (admin.apps.length) {
    _inited = true;
    return admin;
  }

  // ✅ Preferência: secrets (env) -> arquivo -> erro claro
  const serviceAccountObj = tryParseServiceAccountFromEnv();
  const credsPath = serviceAccountObj ? null : resolveCredentialsPath();

  if (serviceAccountObj) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountObj),
    });
  } else if (credsPath) {
    // ✅ Lê o JSON do arquivo apontado pela env
    let json = null;
    try {
      json = JSON.parse(fs.readFileSync(credsPath, "utf8"));
    } catch {
      throw new Error(`GOOGLE_APPLICATION_CREDENTIALS aponta para um arquivo inválido: ${credsPath}`);
    }

    admin.initializeApp({
      credential: admin.credential.cert(json),
    });
  } else {
    throw new Error(
      "Credenciais Firebase Admin ausentes.\n" +
        "Use UMA das opções:\n" +
        "- FIREBASE_SERVICE_ACCOUNT_JSON (recomendado no GitHub Actions)\n" +
        "- FIREBASE_SERVICE_ACCOUNT_BASE64\n" +
        "- GOOGLE_APPLICATION_CREDENTIALS (caminho de arquivo)\n"
    );
  }

  _inited = true;
  return admin;
}

function getDb() {
  if (_db) return _db;
  initAdmin();
  _db = admin.firestore();
  return _db;
}

module.exports = {
  admin,
  initAdmin,
  getDb,
  db: getDb(),
};
