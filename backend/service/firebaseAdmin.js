// backend/service/firebaseAdmin.js
"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

let _db = null;
let _initialized = false;

/* =========================
   .env.local loader (robusto)
========================= */
(function loadEnvLocal() {
  try {
    const envPath = path.join(__dirname, "..", ".env.local");
    if (!fs.existsSync(envPath)) return;

    let raw = fs.readFileSync(envPath, "utf8");
    raw = String(raw || "").replace(/^\uFEFF/, "");

    raw.split(/\r?\n/).forEach((line) => {
      let s = String(line || "").trim();
      if (!s || s.startsWith("#")) return;

      if (/^export\s+/i.test(s)) s = s.replace(/^export\s+/i, "").trim();

      const i = s.indexOf("=");
      if (i <= 0) return;

      const key = s.slice(0, i).trim();
      let val = s.slice(i + 1).trim();

      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      if (key && val && !process.env[key]) {
        process.env[key] = val;
      }
    });
  } catch {
    // silencioso por design
  }
})();

/* =========================
   Helpers
========================= */

function fail(msg) {
  throw new Error(`🔥 Firebase Admin init error:\n${msg}`);
}

function stripBomAndTrim(s) {
  return String(s || "").replace(/^\uFEFF/, "").trim();
}

function safeJsonParse(v) {
  try {
    const raw = stripBomAndTrim(v);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

function readJsonFileOrFail(filePath, labelForError) {
  const p = String(filePath || "").trim();
  try {
    const raw = stripBomAndTrim(fs.readFileSync(p, "utf8"));
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") {
      fail(`${labelForError} existe, mas NÃO é um JSON objeto válido:\n${p}`);
    }
    return obj;
  } catch (e) {
    fail(
      `${labelForError} inválido (falha ao ler/parsear JSON):\n${p}\n\n` +
        (e?.message || String(e))
    );
  }
}

function normalizePrivateKey(sa) {
  if (sa && typeof sa.private_key === "string") {
    // render/railway/vercel frequentemente salvam como "\n"
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  }
  return sa;
}

function isValidServiceAccount(sa) {
  if (!sa || typeof sa !== "object") return false;

  return (
    typeof sa.project_id === "string" &&
    typeof sa.client_email === "string" &&
    typeof sa.private_key === "string" &&
    sa.client_email.includes("@") &&
    sa.private_key.includes("BEGIN PRIVATE KEY") &&
    sa.private_key.includes("END PRIVATE KEY")
  );
}

/**
 * Procura candidatos comuns quando GOOGLE_APPLICATION_CREDENTIALS está errado.
 * - backend/*.json com "firebase-adminsdk" no nome
 * - backend/serviceAccount*.json
 * - backend/serviceAccount.json
 * - <repo>/_secrets/palpitaco/firebase-admin.json (se existir)
 */
function findCredentialCandidates() {
  const candidates = new Set();

  const backendDir = path.resolve(__dirname, ".."); // .../backend
  const repoDir = path.resolve(backendDir, ".."); // .../palpitaco

  // 1) backend/
  try {
    const files = fs.readdirSync(backendDir, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile()) continue;
      const name = String(f.name || "");
      const lower = name.toLowerCase();

      if (!lower.endsWith(".json")) continue;

      // padrões comuns
      if (lower.includes("firebase-adminsdk") || lower.startsWith("serviceaccount")) {
        candidates.add(path.join(backendDir, name));
      }
      if (lower === "serviceaccount.json") {
        candidates.add(path.join(backendDir, name));
      }
    }
  } catch {
    // ignora
  }

  // 2) _secrets/palpitaco/firebase-admin.json
  try {
    const p = path.join(repoDir, "_secrets", "palpitaco", "firebase-admin.json");
    if (fs.existsSync(p)) candidates.add(p);
  } catch {
    // ignora
  }

  // determinístico
  return Array.from(candidates).sort((a, b) => String(a).localeCompare(String(b)));
}

function resolveCredentialsPath() {
  const rawEnv = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!rawEnv) return null;

  // remove aspas externas
  let p = rawEnv.replace(/^['"]|['"]$/g, "").trim();

  // normaliza separadores
  p = path.normalize(p);

  // Se veio relativo, resolve a partir do repo (palpitaco),
  // mas também aceitamos relativo ao backend.
  if (!path.isAbsolute(p)) {
    const backendDir = path.resolve(__dirname, "..");
    const repoDir = path.resolve(backendDir, "..");

    const asBackend = path.resolve(backendDir, p);
    const asRepo = path.resolve(repoDir, p);

    if (fs.existsSync(asBackend)) {
      p = asBackend;
    } else {
      p = asRepo;
    }
  }

  if (!fs.existsSync(p)) {
    const found = findCredentialCandidates();

    // Se achou exatamente 1, usa automaticamente (evita travar dev)
    if (found.length === 1) {
      const auto = found[0];
      process.env.GOOGLE_APPLICATION_CREDENTIALS = auto;
      console.warn(
        "[WARN] GOOGLE_APPLICATION_CREDENTIALS inválido. Usando automaticamente:",
        auto
      );
      return auto;
    }

    const hint =
      found.length === 0
        ? "Nenhum JSON candidato encontrado em backend/ ou _secrets."
        : "Encontrei mais de um candidato. Defina explicitamente no .env.local.";

    const list =
      found.length > 0 ? "\nCandidatos:\n- " + found.join("\n- ") : "";

    fail(
      `GOOGLE_APPLICATION_CREDENTIALS aponta para caminho inexistente:\n${p}\n\n` +
        `${hint}${list}\n\n` +
        `✅ Ajuste no .env.local, exemplo:\n` +
        `GOOGLE_APPLICATION_CREDENTIALS=C:\\Users\\glaub\\palpitaco\\backend\\SEU_ARQUIVO.json`
    );
  }

  return p;
}

function readServiceAccountFromEnv() {
  if (process.env.FIREBASE_ADMIN_SA_JSON) {
    const sa = safeJsonParse(process.env.FIREBASE_ADMIN_SA_JSON);
    if (!sa) fail("FIREBASE_ADMIN_SA_JSON existe, mas NÃO é JSON válido.");

    normalizePrivateKey(sa);
    if (!isValidServiceAccount(sa)) {
      fail("FIREBASE_ADMIN_SA_JSON é JSON, mas NÃO é um service account válido.");
    }
    return sa;
  }

  if (process.env.FIREBASE_ADMIN_SA_BASE64) {
    let decoded;
    try {
      decoded = Buffer.from(
        String(process.env.FIREBASE_ADMIN_SA_BASE64),
        "base64"
      ).toString("utf8");
    } catch {
      fail("FIREBASE_ADMIN_SA_BASE64 não é base64 válido.");
    }

    const sa = safeJsonParse(decoded);
    if (!sa) fail("FIREBASE_ADMIN_SA_BASE64 decodificou, mas NÃO virou JSON.");

    normalizePrivateKey(sa);
    if (!isValidServiceAccount(sa)) {
      fail("FIREBASE_ADMIN_SA_BASE64 é JSON, mas NÃO é um service account válido.");
    }
    return sa;
  }

  return null;
}

/**
 * Garante que o runner tenha Project ID visível para as libs @google-cloud/*
 * (evita: "Unable to detect a Project Id in the current environment")
 */
function ensureProjectEnv(projectId) {
  const pid = String(projectId || "").trim();
  if (!pid) return;

  if (!process.env.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = pid;
  if (!process.env.GCLOUD_PROJECT) process.env.GCLOUD_PROJECT = pid;

  // opcional: alguns setups leem isso
  if (!process.env.FIREBASE_PROJECT_ID) process.env.FIREBASE_PROJECT_ID = pid;
}

/* =========================
   Init
========================= */

function initAdmin() {
  if (_initialized) return admin;

  if (admin.apps && admin.apps.length) {
    _initialized = true;
    return admin;
  }

  const saFromEnv = readServiceAccountFromEnv();
  if (saFromEnv) {
    ensureProjectEnv(saFromEnv.project_id);

    admin.initializeApp({
      credential: admin.credential.cert(saFromEnv),
      projectId: saFromEnv.project_id,
    });

    _initialized = true;
    return admin;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = resolveCredentialsPath();
    const json = readJsonFileOrFail(p, "Service account file");
    normalizePrivateKey(json);

    if (!isValidServiceAccount(json)) {
      fail(`Service account inválido no arquivo:\n${p}`);
    }

    ensureProjectEnv(json.project_id);

    admin.initializeApp({
      credential: admin.credential.cert(json),
      projectId: json.project_id,
    });

    _initialized = true;
    return admin;
  }

  // ADC só se NÃO houver nenhuma tentativa de credencial
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    _initialized = true;
    return admin;
  } catch (e) {
    fail(
      "Nenhuma credencial válida encontrada.\n" +
        "Use UMA opção:\n" +
        "- FIREBASE_ADMIN_SA_JSON\n" +
        "- FIREBASE_ADMIN_SA_BASE64\n" +
        "- GOOGLE_APPLICATION_CREDENTIALS\n\n" +
        (e?.message || "")
    );
  }
}

function getDb(forceNew = false) {
  if (_db && !forceNew) return _db;

  initAdmin();
  _db = admin.firestore();
  return _db;
}

/* =========================
   Exports (compat)
========================= */

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