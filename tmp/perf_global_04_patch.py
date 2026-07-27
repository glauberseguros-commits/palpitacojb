from pathlib import Path
import re
import sys

APP = Path("src/App.jsx")
SHELL = Path("src/pages/Dashboard/components/Sidebar/AppShell.jsx")

def read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")

def write(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")

def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(
            f"{label}: esperado exatamente 1 bloco, encontrado {count}."
        )
    return content.replace(old, new, 1)

def regex_replace_once(
    content: str,
    pattern: str,
    replacement: str,
    label: str,
) -> str:
    updated, count = re.subn(
        pattern,
        replacement,
        content,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        raise RuntimeError(
            f"{label}: esperado exatamente 1 bloco, encontrado {count}."
        )
    return updated

app = read(APP)
shell = read(SHELL)

# ============================================================
# APP.JSX
# ============================================================

app = replace_once(
    app,
    'import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";',
    'import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";',
    "Import React do App",
)

static_imports_pattern = r'''
import DashboardMod from "\./pages/Dashboard/Dashboard";
import AccountMod from "\./pages/Account/Account";

(?://[^\n]*\n|\s)*?
import AppShellMod from "\./pages/Dashboard/components/Sidebar/AppShell";

'''

app = regex_replace_once(
    app,
    static_imports_pattern,
    "",
    "Imports estáticos Dashboard/Account/AppShell",
)

lazy_anchor = 'const Results = lazy(() => import("./pages/Results/Results"));'

lazy_global = '''const Dashboard = lazy(() =>
  import("./pages/Dashboard/Dashboard")
);

const Account = lazy(() =>
  import("./pages/Account/Account")
);

const AppShell = lazy(() =>
  import("./pages/Dashboard/components/Sidebar/AppShell")
);

const Results = lazy(() => import("./pages/Results/Results"));'''

app = replace_once(
    app,
    lazy_anchor,
    lazy_global,
    "Lazy loading global",
)

resolve_component_pattern = r'''
/\*\*
 \* ✅ Resolve default/named de forma robusta
 \*/
function resolveComponent\(mod, name\) \{
.*?
\}

'''

app = regex_replace_once(
    app,
    resolve_component_pattern,
    "",
    "Função resolveComponent",
)

component_memos_pattern = r'''
  const Dashboard = useMemo\(\(\) => resolveComponent\(DashboardMod, "Dashboard"\), \[\]\);
  const Account = useMemo\(\(\) => resolveComponent\(AccountMod, "Account"\), \[\]\);

  const AppShell = useMemo\(\(\) => resolveComponent\(AppShellMod, "AppShell"\), \[\]\);


'''

app = regex_replace_once(
    app,
    component_memos_pattern,
    "",
    "Memorização dos imports estáticos",
)

old_app_session_effect = '''  useEffect(() => {
    const bump = () => setSessionTick((v) => v + 1);

    const onStorage = (e) => {
      if (!e) return;
      if (e.key === ACCOUNT_SESSION_KEY || e.key === LS_GUEST_ACTIVE_KEY) {
        bump();
      }
    };

    const onSessionChanged = () => bump();
    const onFocus = () => bump();
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("pp_session_changed", onSessionChanged);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pp_session_changed", onSessionChanged);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);'''

new_app_session_effect = '''  useEffect(() => {
    const bump = () => setSessionTick((v) => v + 1);

    const onStorage = (e) => {
      if (!e) return;
      if (e.key === ACCOUNT_SESSION_KEY || e.key === LS_GUEST_ACTIVE_KEY) {
        bump();
      }
    };

    const onSessionChanged = () => bump();

    window.addEventListener("storage", onStorage);
    window.addEventListener("pp_session_changed", onSessionChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pp_session_changed", onSessionChanged);
    };
  }, []);'''

app = replace_once(
    app,
    old_app_session_effect,
    new_app_session_effect,
    "Listeners globais do App",
)

# ============================================================
# APPSHELL.JSX
# ============================================================

shell = replace_once(
    shell,
    'import { onAuthStateChanged, signOut } from "firebase/auth";',
    'import { signOut } from "firebase/auth";',
    "Import Firebase Auth do AppShell",
)

old_auth_listener = '''  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        setSession(readSession());
        return;
      }

      if (safeReadLS(LS_GUEST_ACTIVE_KEY) === "1") {
        setSession({
          ok: true,
          type: "guest",
          plan: "FREE",
          uid: "",
          email: "",
          raw: null,
        });
        return;
      }

      setSession({
        ok: false,
        type: "anon",
        plan: "",
        uid: "",
        email: "",
        raw: null,
      });
    });

    return () => unsub();
  }, []);

'''

shell = replace_once(
    shell,
    old_auth_listener,
    "",
    "Listener duplicado onAuthStateChanged do AppShell",
)

old_shell_session_effect = '''  useEffect(() => {
    const refresh = () => setSession(readSession());

    const onStorage = (e) => {
      if (!e) return;
      if (e.key === ACCOUNT_SESSION_KEY || e.key === LS_GUEST_ACTIVE_KEY) {
        refresh();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("pp_session_changed", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pp_session_changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);'''

new_shell_session_effect = '''  useEffect(() => {
    const refresh = () => setSession(readSession());

    const onStorage = (e) => {
      if (!e) return;
      if (e.key === ACCOUNT_SESSION_KEY || e.key === LS_GUEST_ACTIVE_KEY) {
        refresh();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("pp_session_changed", refresh);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pp_session_changed", refresh);
    };
  }, []);'''

shell = replace_once(
    shell,
    old_shell_session_effect,
    new_shell_session_effect,
    "Listener de foco do AppShell",
)

# ============================================================
# VALIDAÇÕES
# ============================================================

checks = {
    "Dashboard lazy": 'const Dashboard = lazy(() =>' in app,
    "Account lazy": 'const Account = lazy(() =>' in app,
    "AppShell lazy": 'const AppShell = lazy(() =>' in app,
    "Dashboard estático removido":
        'import DashboardMod from' not in app,
    "Account estático removido":
        'import AccountMod from' not in app,
    "AppShell estático removido":
        'import AppShellMod from' not in app,
    "resolveComponent removido":
        'function resolveComponent' not in app,
    "Focus global removido do App":
        'window.addEventListener("focus", onFocus)' not in app,
    "Visibility global removido do App":
        'document.addEventListener("visibilitychange", onVis)' not in app,
    "onAuthStateChanged removido do AppShell":
        'onAuthStateChanged' not in shell,
    "Focus removido do AppShell":
        'window.addEventListener("focus", refresh)' not in shell,
    "Storage mantido no App":
        'window.addEventListener("storage", onStorage)' in app,
    "Evento de sessão mantido no App":
        'window.addEventListener("pp_session_changed", onSessionChanged)' in app,
    "Storage mantido no AppShell":
        'window.addEventListener("storage", onStorage)' in shell,
    "Evento de sessão mantido no AppShell":
        'window.addEventListener("pp_session_changed", refresh)' in shell,
}

failed = [name for name, ok in checks.items() if not ok]

if failed:
    raise RuntimeError(
        "Validações falharam: " + ", ".join(failed)
    )

write(APP, app)
write(SHELL, shell)

for name, ok in checks.items():
    print(f"{name}: {ok}")

print("PATCH_OK")
print(f"Arquivo alterado: {APP}")
print(f"Arquivo alterado: {SHELL}")
