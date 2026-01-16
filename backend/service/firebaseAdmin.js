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

  const credsPath = resolveCredentialsPath();

  if (!credsPath) {
    // Sem ADC no Windows: falha com instrução objetiva
    throw new Error(
      'Credenciais Firebase Admin ausentes.\n' +
        'Defina GOOGLE_APPLICATION_CREDENTIALS apontando para o JSON do service account.\n' +
        'Exemplo (PowerShell):\n' +
        '$env:GOOGLE_APPLICATION_CREDENTIALS="C:\\caminho\\sua-chave.json"\n'
    );
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });

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
