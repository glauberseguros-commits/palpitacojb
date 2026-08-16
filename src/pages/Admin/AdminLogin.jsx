import React, { useEffect, useRef, useState } from "react";

import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  auth,
  authReady,
  db,
} from "../../services/firebase";

import {
  ADMINS_COLLECTION,
} from "./adminKeys";

import "./AdminLogin.css";

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function translateAuthError(error) {
  const code = String(error?.code || "").trim();

  switch (code) {
    case "auth/invalid-email":
      return "Informe um e-mail válido.";

    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "E-mail ou senha inválidos.";

    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

    case "auth/network-request-failed":
      return "Falha de conexão. Verifique sua internet.";

    case "auth/user-disabled":
      return "Esta conta está desativada.";

    default:
      return "Não foi possível acessar o ambiente administrativo.";
  }
}

async function isAuthorizedAdmin(uid) {
  const normalizedUid = String(uid || "").trim();

  if (!normalizedUid) {
    return false;
  }

  const ref = doc(
    db,
    ADMINS_COLLECTION,
    normalizedUid
  );

  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return false;
  }

  const data = snapshot.data() || {};

  return data.active !== false;
}

export default function AdminLogin({
  onCancel,
  onAuthed,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] =
    useState(true);

  const [error, setError] = useState("");
  const [showPassword, setShowPassword] =
    useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const checkCurrentSession = async () => {
      try {
        await authReady;

        const currentUser = auth.currentUser;

        if (!currentUser?.uid) {
          return;
        }

        const authorized =
          await isAuthorizedAdmin(
            currentUser.uid
          );

        if (!alive) return;

        if (authorized) {
          onAuthed?.();
          return;
        }

        try {
          await signOut(auth);
        } catch {}
      } catch (sessionError) {
        console.error(
          "[ADMIN_LOGIN_SESSION]",
          sessionError
        );
      } finally {
        if (alive) {
          setCheckingSession(false);
        }
      }
    };

    checkCurrentSession();

    return () => {
      alive = false;
    };
  }, [onAuthed]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading || checkingSession) {
      return;
    }

    const normalizedEmail =
      normalizeEmail(email);

    if (!normalizedEmail) {
      setError("Informe o e-mail administrativo.");
      return;
    }

    if (!password) {
      setError("Informe a senha.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await authReady;

      const credential =
        await signInWithEmailAndPassword(
          auth,
          normalizedEmail,
          password
        );

      const uid = String(
        credential?.user?.uid || ""
      ).trim();

      const authorized =
        await isAuthorizedAdmin(uid);

      if (!authorized) {
        try {
          await signOut(auth);
        } catch {}

        throw new Error(
          "ADMIN_NOT_AUTHORIZED"
        );
      }

      if (mountedRef.current) {
        onAuthed?.();
      }
    } catch (loginError) {
      console.error(
        "[ADMIN_LOGIN]",
        loginError
      );

      if (
        String(loginError?.message || "") ===
        "ADMIN_NOT_AUTHORIZED"
      ) {
        setError(
          "Esta conta não possui autorização administrativa."
        );
      } else {
        setError(
          translateAuthError(loginError)
        );
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const disabled =
    loading || checkingSession;

  return (
    <main className="admin-login-shell">
      <section
        className="admin-login-card"
        aria-labelledby="admin-login-title"
      >
        <div className="admin-login-brand">
          <div className="admin-login-brand__mark">
            PB
          </div>

          <div>
            <span>PALPITACO JB</span>
            <strong>Engine Center</strong>
          </div>
        </div>

        <div className="admin-login-heading">
          <div className="admin-login-eyebrow">
            ACESSO RESTRITO
          </div>

          <h1 id="admin-login-title">
            Administração
          </h1>

          <p>
            Entre com uma conta autorizada para acessar auditorias,
            backtests e ferramentas internas.
          </p>
        </div>

        <form
          className="admin-login-form"
          onSubmit={handleSubmit}
          noValidate
        >
          <label htmlFor="admin-email">
            E-mail
          </label>

          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError("");
            }}
            autoComplete="username"
            placeholder="admin@palpitacojb.com.br"
            disabled={disabled}
            autoFocus
          />

          <label htmlFor="admin-password">
            Senha
          </label>

          <div className="admin-login-password">
            <input
              id="admin-password"
              type={
                showPassword
                  ? "text"
                  : "password"
              }
              value={password}
              onChange={(event) => {
                setPassword(
                  event.target.value
                );

                if (error) setError("");
              }}
              autoComplete="current-password"
              placeholder="Digite sua senha"
              disabled={disabled}
            />

            <button
              type="button"
              className="admin-login-password__toggle"
              onClick={() =>
                setShowPassword(
                  (current) => !current
                )
              }
              disabled={disabled}
              aria-label={
                showPassword
                  ? "Ocultar senha"
                  : "Mostrar senha"
              }
            >
              {showPassword
                ? "Ocultar"
                : "Mostrar"}
            </button>
          </div>

          {error ? (
            <div
              className="admin-login-error"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="admin-login-submit"
            disabled={disabled}
          >
            {checkingSession
              ? "Verificando sessão..."
              : loading
              ? "Validando acesso..."
              : "Entrar no Engine Center"}
          </button>

          <button
            type="button"
            className="admin-login-cancel"
            onClick={() => onCancel?.()}
            disabled={loading}
          >
            Voltar à plataforma
          </button>
        </form>

        <footer className="admin-login-footer">
          Ambiente exclusivo para desenvolvimento e administração.
        </footer>
      </section>
    </main>
  );
}
