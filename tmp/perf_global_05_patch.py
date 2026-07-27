from pathlib import Path
import sys

APP = Path("src/App.jsx")
SHELL = Path("src/pages/Dashboard/components/Sidebar/AppShell.jsx")

def read_file(path):
    return path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")

def write_file(path, content):
    path.write_text(content, encoding="utf-8", newline="\n")

def replace_once(content, old, new, label):
    count = content.count(old)

    if count != 1:
        raise RuntimeError(
            f"{label}: esperado exatamente 1 bloco, encontrado {count}."
        )

    return content.replace(old, new, 1)

app = read_file(APP)
shell = read_file(SHELL)

# ============================================================
# APP.JSX — REMOVER IMPORTS ESTÁTICOS INDIVIDUALMENTE
# ============================================================

app = replace_once(
    app,
    'import DashboardMod from "./pages/Dashboard/Dashboard";\n',
    '',
    'Import estático Dashboard',
)

app = replace_once(
    app,
    'import AccountMod from "./pages/Account/Account";\n',
    '',
    'Import estático Account',
)

app = replace_once(
    app,
    'import AppShellMod from "./pages/Dashboard/components/Sidebar/AppShell";\n',
    '',
    'Import estático AppShell',
)

# ============================================================
# APP.JSX — ADICIONAR LAZY LOADING
# ============================================================

old_lazy_anchor = '''const Results = lazy(() => import("./pages/Results/Results"));'''

new_lazy_block = '''const Dashboard = lazy(() =>
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
    old_lazy_anchor,
    new_lazy_block,
    'Declarações lazy Dashboard/Account/AppShell',
)

# ============================================================
# APP.JSX — REMOVER MEMOS DOS IMPORTS ESTÁTICOS
# ============================================================

old_component_memos = '''  const Dashboard = useMemo(() => resolveComponent(DashboardMod, "Dashboard"), []);
  const Account = useMemo(() => resolveComponent(AccountMod, "Account"), []);

  const AppShell = useMemo(() => resolveComponent(AppShellMod, "AppShell"), []);


'''

app = replace_once(
    app,
    old_component_memos,
    '',
    'Memos Dashboard/Account/AppShell',
)

# ============================================================
# APP.JSX — REMOVER RERENDER POR FOCUS/VISIBILITY
# ============================================================

old_app_effect = '''  useEffect(() => {
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

new_app_effect = '''  useEffect(() => {
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
    old_app_effect,
    new_app_effect,
    'Listeners globais App.jsx',
)

# ============================================================
# APPSHELL.JSX — REMOVER AUTH LISTENER DUPLICADO
# ============================================================

shell = replace_once(
    shell,
    'import { onAuthStateChanged, signOut } from "firebase/auth";',
    'import { signOut } from "firebase/auth";',
    'Import Firebase Auth AppShell',
)

old_auth_effect = '''  useEffect(() => {
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
    old_auth_effect,
    '',
    'Listener onAuthStateChanged duplicado',
)

# ============================================================
# APPSHELL.JSX — REMOVER LISTENER DE FOCUS
# ============================================================

old_shell_effect = '''  useEffect(() => {
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

new_shell_effect = '''  useEffect(() => {
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
    old_shell_effect,
    new_shell_effect,
    'Listener focus AppShell',
)

# ============================================================
# VALIDAÇÕES ANTES DE GRAVAR
# ============================================================

checks = {
    'Dashboard lazy': 'const Dashboard = lazy(() =>' in app,
    'Account lazy': 'const Account = lazy(() =>' in app,
    'AppShell lazy': 'const AppShell = lazy(() =>' in app,

    'Dashboard estático removido':
        'import DashboardMod from' not in app,

    'Account estático removido':
        'import AccountMod from' not in app,

    'AppShell estático removido':
        'import AppShellMod from' not in app,

    'Memos estáticos removidos':
        'resolveComponent(DashboardMod' not in app
        and 'resolveComponent(AccountMod' not in app
        and 'resolveComponent(AppShellMod' not in app,

    'Focus removido do App':
        'window.addEventListener("focus", onFocus)' not in app,

    'Visibility removido do App':
        'document.addEventListener("visibilitychange", onVis)' not in app,

    'Auth duplicado removido do AppShell':
        'onAuthStateChanged' not in shell,

    'Focus removido do AppShell':
        'window.addEventListener("focus", refresh)' not in shell,

    'Storage mantido no App':
        'window.addEventListener("storage", onStorage)' in app,

    'Evento de sessão mantido no App':
        'window.addEventListener("pp_session_changed", onSessionChanged)' in app,

    'Storage mantido no AppShell':
        'window.addEventListener("storage", onStorage)' in shell,

    'Evento de sessão mantido no AppShell':
        'window.addEventListener("pp_session_changed", refresh)' in shell,
}

failed = [name for name, ok in checks.items() if not ok]

if failed:
    raise RuntimeError(
        'Validações falharam: ' + ', '.join(failed)
    )

write_file(APP, app)
write_file(SHELL, shell)

for name, ok in checks.items():
    print(f'{name}: {ok}')

print('')
print('PATCH_OK')
print(f'Arquivo alterado: {APP}')
print(f'Arquivo alterado: {SHELL}')
