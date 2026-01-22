// src/pages/Account/account.constants.js

/**
 * Constantes do módulo Account
 * Centraliza chaves e regras de negócio estáveis
 */

// ===== LocalStorage =====

// Perfil guest (local only)
export const LS_GUEST_PROFILE_KEY = "pp_guest_profile_v1";
export const LS_GUEST_ACTIVE_KEY = "pp_guest_active_v1";

// Sessão global do app (fonte de verdade usada pelo App.js)
export const ACCOUNT_SESSION_KEY = "pp_session_v1";

// ===== Trial =====

export const TRIAL_DAYS = 7;

// ===== Defaults =====

export const DEFAULT_INITIALS = "PP";

// ===== Eventos =====

// Evento disparado sempre que a sessão muda
export const SESSION_CHANGED_EVENT = "pp_session_changed";
