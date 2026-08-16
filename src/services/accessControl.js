/**
 * PALPITACO JB
 * Controle central de acesso da interface.
 *
 * IMPORTANTE:
 * - Este módulo NÃO altera motor, ranking, resultados ou Firestore.
 * - Ele apenas descreve permissões de interface por tipo de sessão.
 * - Nesta primeira etapa, o foco é o perfil Guest/Preview.
 */

export const SESSION_KIND = Object.freeze({
  ANON: "anon",
  GUEST: "guest",
  USER: "user",
});

export const ACCOUNT_SESSION_KEY = "pp_session_v1";
/**
 * ============================================================
 * PALPITACO JB — ACCESS ENTITLEMENT CONTRACT
 * ============================================================
 *
 * SESSION_KIND descreve COMO a pessoa entrou.
 * ACCESS_ENTITLEMENT descreve O NÍVEL DE ACESSO de um USER.
 *
 * TRIAL não é plano comercial.
 * É um entitlement temporário concedido por 7 dias.
 *
 * Compatibilidade:
 * - FREE permanece FREE.
 * - PREMIUM legado permanece reconhecido.
 * - VIP é entitlement próprio e não é convertido em PREMIUM.
 *
 * Este módulo continua sendo apenas política de interface.
 * Segurança real dos dados será aplicada posteriormente
 * também nas Firestore Rules/backend.
 */

export const TRIAL_DAYS = 7;

export const ACCESS_ENTITLEMENT = Object.freeze({
  FREE: "FREE",
  TRIAL: "TRIAL",
  STANDARD: "STANDARD",
  PLUS: "PLUS",
  PREMIUM: "PREMIUM",
  VIP: "VIP",
  ADMIN: "ADMIN",
});

export const COMMERCIAL_PLAN = Object.freeze({
  STANDARD: "STANDARD",
  PLUS: "PLUS",
  PREMIUM: "PREMIUM",
});

const LEGACY_PLAN_ALIAS = Object.freeze({
  FREE: ACCESS_ENTITLEMENT.FREE,
  TRIAL: ACCESS_ENTITLEMENT.TRIAL,

  STANDARD: ACCESS_ENTITLEMENT.STANDARD,
  PLUS: ACCESS_ENTITLEMENT.PLUS,
  PREMIUM: ACCESS_ENTITLEMENT.PREMIUM,

  // compatibilidade temporária
  PRO: ACCESS_ENTITLEMENT.PLUS,
  VIP: ACCESS_ENTITLEMENT.VIP,

  ADMIN: ACCESS_ENTITLEMENT.ADMIN,
});

export function normalizeAccessEntitlement(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase();

  return LEGACY_PLAN_ALIAS[key] || ACCESS_ENTITLEMENT.FREE;
}

export function isCommercialPlan(value) {
  const entitlement = normalizeAccessEntitlement(value);

  return (
    entitlement === ACCESS_ENTITLEMENT.STANDARD ||
    entitlement === ACCESS_ENTITLEMENT.PLUS ||
    entitlement === ACCESS_ENTITLEMENT.PREMIUM
  );
}

export function isTrialEntitlement(value) {
  return (
    normalizeAccessEntitlement(value) ===
    ACCESS_ENTITLEMENT.TRIAL
  );
}

export function isPaidEntitlement(value) {
  const entitlement = normalizeAccessEntitlement(value);

  return (
    entitlement === ACCESS_ENTITLEMENT.STANDARD ||
    entitlement === ACCESS_ENTITLEMENT.PLUS ||
    entitlement === ACCESS_ENTITLEMENT.PREMIUM ||
    entitlement === ACCESS_ENTITLEMENT.ADMIN
  );
}

export function getAccessEntitlement(session) {
  const obj = session || loadAccessSession();

  if (!obj || obj.ok !== true) {
    return ACCESS_ENTITLEMENT.FREE;
  }

  const kind = getAccessSessionKind(obj);

  if (kind !== SESSION_KIND.USER) {
    return ACCESS_ENTITLEMENT.FREE;
  }

  if (obj.isAdmin === true) {
    return ACCESS_ENTITLEMENT.ADMIN;
  }

  // Novo contrato: entitlement explícito tem precedência.
  const explicitEntitlement = String(obj.entitlement || "").trim();

  if (explicitEntitlement) {
    return normalizeAccessEntitlement(explicitEntitlement);
  }

  // Compatibilidade com sessões atuais/legadas que possuem apenas plan.
  return normalizeAccessEntitlement(obj.plan);
}

function safeParseSession(raw) {
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

export function loadAccessSession() {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_SESSION_KEY);
    if (!raw) return null;

    const obj = safeParseSession(raw);
    if (!obj || obj.ok !== true) return null;

    const type = String(obj.type || "")
      .trim()
      .toLowerCase();

    if (type !== SESSION_KIND.GUEST && type !== SESSION_KIND.USER) {
      return null;
    }

    return obj;
  } catch {
    return null;
  }
}

export function getAccessSessionKind(session) {
  const obj = session || loadAccessSession();

  if (!obj || obj.ok !== true) {
    return SESSION_KIND.ANON;
  }

  const type = String(obj.type || "")
    .trim()
    .toLowerCase();

  if (type === SESSION_KIND.GUEST) return SESSION_KIND.GUEST;
  if (type === SESSION_KIND.USER) return SESSION_KIND.USER;

  return SESSION_KIND.ANON;
}

export const ACCESS_CAPABILITY = Object.freeze({
  // ==========================================================
  // TRANSVERSAIS
  // ==========================================================
  NAVIGATE: "navigate",
  CHANGE_FILTERS: "changeFilters",
  CHANGE_DATE: "changeDate",
  CHANGE_LOTTERY: "changeLottery",
  CHANGE_HOUR: "changeHour",
  SEARCH: "search",

  COPY_CONTENT: "copyContent",
  EXPORT_DATA: "exportData",
  DOWNLOAD_FILES: "downloadFiles",

  // ==========================================================
  // ACESSO A PRODUTOS
  // ==========================================================
  ACCESS_TOP3: "accessTop3",
  ACCESS_CENTENAS: "accessCentenas",
  ACCESS_TERNO_GRUPO: "accessTernoGrupo",
  ACCESS_STATISTICS: "accessStatistics",
  ACCESS_DOWNLOADS: "accessDownloads",

  // ==========================================================
  // GERAÇÃO / RECURSOS DE PRODUTO
  // ==========================================================
  ACCESS_TOP3_LIVE_PREDICTIONS: "accessTop3LivePredictions",
  GENERATE_CENTENAS: "generateCentenas",
  GENERATE_TERNO_GRUPO: "generateTernoGrupo",
  GENERATE_STATISTICS_RANKING: "generateStatisticsRanking",
  GENERATE_DOWNLOAD_PREVIEW: "generateDownloadPreview",
  DOWNLOAD_REPORTS: "downloadReports",

  // ==========================================================
  // LEGADO TEMPORÁRIO
  // Mantidos até todos os consumidores serem migrados.
  // ==========================================================
  GENERATE: "generate",
  DOWNLOAD: "download",
  EXPORT: "export",
  ACCESS_LIVE_PREDICTIONS: "accessLivePredictions",
});


/**
 * ============================================================
 * PALPITACO JB — COMMERCIAL ACCESS MATRIX V1
 * ============================================================
 *
 * IMPORTANTE:
 *
 * 1. Esta matriz registra o contrato comercial aprovado.
 * 2. Ela NÃO está ligada automaticamente às telas nesta etapa.
 * 3. Os consumidores serão migrados separadamente.
 * 4. TRIAL oferece experiência completa durante os 7 dias.
 * 5. VIP permanece entitlement próprio, sem pagamento.
 * 6. ADMIN permanece privilégio administrativo independente.
 * 7. VIP não concede ADMIN.
 *
 * Escada comercial:
 *
 * STANDARD
 *   - navegação e consultas;
 *   - filtros/datas;
 *   - busca;
 *   - estatísticas;
 *   - TOP3.
 *
 * PLUS
 *   - tudo do STANDARD;
 *   - Centenas+;
 *   - Downloads/relatórios.
 *
 * PREMIUM
 *   - tudo do PLUS;
 *   - Terno de Grupo;
 *   - experiência completa.
 *
 * TRIAL
 *   - experiência PREMIUM durante 7 dias.
 */

export const COMMERCIAL_ACCESS_MATRIX_V1 = Object.freeze({
  [ACCESS_ENTITLEMENT.FREE]: Object.freeze({
    [ACCESS_CAPABILITY.NAVIGATE]: true,

    [ACCESS_CAPABILITY.CHANGE_FILTERS]: false,
    [ACCESS_CAPABILITY.CHANGE_DATE]: false,
    [ACCESS_CAPABILITY.CHANGE_LOTTERY]: false,
    [ACCESS_CAPABILITY.CHANGE_HOUR]: false,

    [ACCESS_CAPABILITY.SEARCH]: false,
    [ACCESS_CAPABILITY.COPY_CONTENT]: false,
    [ACCESS_CAPABILITY.EXPORT_DATA]: false,
    [ACCESS_CAPABILITY.DOWNLOAD_FILES]: false,

    [ACCESS_CAPABILITY.ACCESS_TOP3]: false,
    [ACCESS_CAPABILITY.ACCESS_TOP3_LIVE_PREDICTIONS]: false,

    [ACCESS_CAPABILITY.ACCESS_CENTENAS]: false,
    [ACCESS_CAPABILITY.GENERATE_CENTENAS]: false,

    [ACCESS_CAPABILITY.ACCESS_TERNO_GRUPO]: false,
    [ACCESS_CAPABILITY.GENERATE_TERNO_GRUPO]: false,

    [ACCESS_CAPABILITY.ACCESS_STATISTICS]: false,
    [ACCESS_CAPABILITY.GENERATE_STATISTICS_RANKING]: false,

    [ACCESS_CAPABILITY.ACCESS_DOWNLOADS]: false,
    [ACCESS_CAPABILITY.GENERATE_DOWNLOAD_PREVIEW]: false,
    [ACCESS_CAPABILITY.DOWNLOAD_REPORTS]: false,
  }),

  [ACCESS_ENTITLEMENT.STANDARD]: Object.freeze({
    [ACCESS_CAPABILITY.NAVIGATE]: true,

    [ACCESS_CAPABILITY.CHANGE_FILTERS]: true,
    [ACCESS_CAPABILITY.CHANGE_DATE]: true,
    [ACCESS_CAPABILITY.CHANGE_LOTTERY]: true,
    [ACCESS_CAPABILITY.CHANGE_HOUR]: true,

    [ACCESS_CAPABILITY.SEARCH]: true,
    [ACCESS_CAPABILITY.COPY_CONTENT]: true,
    [ACCESS_CAPABILITY.EXPORT_DATA]: false,
    [ACCESS_CAPABILITY.DOWNLOAD_FILES]: false,

    [ACCESS_CAPABILITY.ACCESS_TOP3]: true,
    [ACCESS_CAPABILITY.ACCESS_TOP3_LIVE_PREDICTIONS]: true,

    [ACCESS_CAPABILITY.ACCESS_CENTENAS]: false,
    [ACCESS_CAPABILITY.GENERATE_CENTENAS]: false,

    [ACCESS_CAPABILITY.ACCESS_TERNO_GRUPO]: false,
    [ACCESS_CAPABILITY.GENERATE_TERNO_GRUPO]: false,

    [ACCESS_CAPABILITY.ACCESS_STATISTICS]: true,
    [ACCESS_CAPABILITY.GENERATE_STATISTICS_RANKING]: true,

    [ACCESS_CAPABILITY.ACCESS_DOWNLOADS]: false,
    [ACCESS_CAPABILITY.GENERATE_DOWNLOAD_PREVIEW]: false,
    [ACCESS_CAPABILITY.DOWNLOAD_REPORTS]: false,
  }),

  [ACCESS_ENTITLEMENT.PLUS]: Object.freeze({
    [ACCESS_CAPABILITY.NAVIGATE]: true,

    [ACCESS_CAPABILITY.CHANGE_FILTERS]: true,
    [ACCESS_CAPABILITY.CHANGE_DATE]: true,
    [ACCESS_CAPABILITY.CHANGE_LOTTERY]: true,
    [ACCESS_CAPABILITY.CHANGE_HOUR]: true,

    [ACCESS_CAPABILITY.SEARCH]: true,
    [ACCESS_CAPABILITY.COPY_CONTENT]: true,
    [ACCESS_CAPABILITY.EXPORT_DATA]: true,
    [ACCESS_CAPABILITY.DOWNLOAD_FILES]: true,

    [ACCESS_CAPABILITY.ACCESS_TOP3]: true,
    [ACCESS_CAPABILITY.ACCESS_TOP3_LIVE_PREDICTIONS]: true,

    [ACCESS_CAPABILITY.ACCESS_CENTENAS]: true,
    [ACCESS_CAPABILITY.GENERATE_CENTENAS]: true,

    [ACCESS_CAPABILITY.ACCESS_TERNO_GRUPO]: false,
    [ACCESS_CAPABILITY.GENERATE_TERNO_GRUPO]: false,

    [ACCESS_CAPABILITY.ACCESS_STATISTICS]: true,
    [ACCESS_CAPABILITY.GENERATE_STATISTICS_RANKING]: true,

    [ACCESS_CAPABILITY.ACCESS_DOWNLOADS]: true,
    [ACCESS_CAPABILITY.GENERATE_DOWNLOAD_PREVIEW]: true,
    [ACCESS_CAPABILITY.DOWNLOAD_REPORTS]: true,
  }),

  [ACCESS_ENTITLEMENT.PREMIUM]: Object.freeze({
    [ACCESS_CAPABILITY.NAVIGATE]: true,

    [ACCESS_CAPABILITY.CHANGE_FILTERS]: true,
    [ACCESS_CAPABILITY.CHANGE_DATE]: true,
    [ACCESS_CAPABILITY.CHANGE_LOTTERY]: true,
    [ACCESS_CAPABILITY.CHANGE_HOUR]: true,

    [ACCESS_CAPABILITY.SEARCH]: true,
    [ACCESS_CAPABILITY.COPY_CONTENT]: true,
    [ACCESS_CAPABILITY.EXPORT_DATA]: true,
    [ACCESS_CAPABILITY.DOWNLOAD_FILES]: true,

    [ACCESS_CAPABILITY.ACCESS_TOP3]: true,
    [ACCESS_CAPABILITY.ACCESS_TOP3_LIVE_PREDICTIONS]: true,

    [ACCESS_CAPABILITY.ACCESS_CENTENAS]: true,
    [ACCESS_CAPABILITY.GENERATE_CENTENAS]: true,

    [ACCESS_CAPABILITY.ACCESS_TERNO_GRUPO]: true,
    [ACCESS_CAPABILITY.GENERATE_TERNO_GRUPO]: true,

    [ACCESS_CAPABILITY.ACCESS_STATISTICS]: true,
    [ACCESS_CAPABILITY.GENERATE_STATISTICS_RANKING]: true,

    [ACCESS_CAPABILITY.ACCESS_DOWNLOADS]: true,
    [ACCESS_CAPABILITY.GENERATE_DOWNLOAD_PREVIEW]: true,
    [ACCESS_CAPABILITY.DOWNLOAD_REPORTS]: true,
  }),
});

/**
 * TRIAL = experiência PREMIUM durante a janela gratuita.
 */
export const TRIAL_ACCESS_POLICY =
  COMMERCIAL_ACCESS_MATRIX_V1[ACCESS_ENTITLEMENT.PREMIUM];

/**
 * VIP:
 *
 * Nesta etapa recebe baseline completo de plataforma,
 * equivalente funcional ao PREMIUM.
 *
 * VIP continua sendo entitlement próprio.
 * Não é convertido em PREMIUM.
 * Não concede ADMIN.
 *
 * Overrides individuais de VIP serão tratados em etapa própria.
 */
export const VIP_ACCESS_POLICY =
  COMMERCIAL_ACCESS_MATRIX_V1[ACCESS_ENTITLEMENT.PREMIUM];

/**
 * ADMIN:
 *
 * A política abaixo representa acesso funcional da plataforma.
 * A autorização administrativa real continua independente
 * e é validada pela infraestrutura/coleção admins.
 */
export const ADMIN_PLATFORM_ACCESS_POLICY =
  COMMERCIAL_ACCESS_MATRIX_V1[ACCESS_ENTITLEMENT.PREMIUM];

/**
 * Retorna a política comercial registrada para um entitlement.
 *
 * IMPORTANTE:
 * Esta função ainda NÃO substitui getAccessPolicy().
 * Portanto, a matriz não muda o comportamento das telas neste patch.
 */
export function getCommercialAccessPolicy(entitlement) {
  const normalized = normalizeAccessEntitlement(entitlement);

  if (normalized === ACCESS_ENTITLEMENT.TRIAL) {
    return TRIAL_ACCESS_POLICY;
  }

  if (normalized === ACCESS_ENTITLEMENT.VIP) {
    return VIP_ACCESS_POLICY;
  }

  if (normalized === ACCESS_ENTITLEMENT.ADMIN) {
    return ADMIN_PLATFORM_ACCESS_POLICY;
  }

  return (
    COMMERCIAL_ACCESS_MATRIX_V1[normalized] ||
    COMMERCIAL_ACCESS_MATRIX_V1[ACCESS_ENTITLEMENT.FREE]
  );
}
export const PROTECTED_FEATURE = Object.freeze({
  TOP3: "top3",
  CENTENAS: "centenas",
  TERNO_GRUPO: "terno-grupo",
  DOWNLOADS: "downloads",
});

/**
 * Política oficial do Guest.
 *
 * O Guest funciona como vitrine somente leitura:
 * - pode navegar;
 * - pode visualizar o estado padrão das páginas permitidas;
 * - não pode alterar consultas;
 * - não pode pesquisar;
 * - não pode gerar;
 * - não pode exportar;
 * - não recebe conteúdo operacional protegido.
 */
export const GUEST_ACCESS = Object.freeze({
  [ACCESS_CAPABILITY.NAVIGATE]: true,

  [ACCESS_CAPABILITY.CHANGE_FILTERS]: false,
  [ACCESS_CAPABILITY.CHANGE_DATE]: false,
  [ACCESS_CAPABILITY.CHANGE_LOTTERY]: false,
  [ACCESS_CAPABILITY.CHANGE_HOUR]: false,

  [ACCESS_CAPABILITY.SEARCH]: false,
  [ACCESS_CAPABILITY.GENERATE]: false,

  [ACCESS_CAPABILITY.DOWNLOAD]: false,
  [ACCESS_CAPABILITY.EXPORT]: false,

  [ACCESS_CAPABILITY.ACCESS_LIVE_PREDICTIONS]: false,
});

/**
 * Usuário autenticado.
 *
 * Nesta etapa não estamos impondo diferenças entre FREE/PREMIUM/VIP.
 * Isso será tratado posteriormente pela matriz de planos.
 */
export const USER_ACCESS = Object.freeze({
  [ACCESS_CAPABILITY.NAVIGATE]: true,

  [ACCESS_CAPABILITY.CHANGE_FILTERS]: true,
  [ACCESS_CAPABILITY.CHANGE_DATE]: true,
  [ACCESS_CAPABILITY.CHANGE_LOTTERY]: true,
  [ACCESS_CAPABILITY.CHANGE_HOUR]: true,

  [ACCESS_CAPABILITY.SEARCH]: true,
  [ACCESS_CAPABILITY.GENERATE]: true,

  [ACCESS_CAPABILITY.DOWNLOAD]: true,
  [ACCESS_CAPABILITY.EXPORT]: true,

  [ACCESS_CAPABILITY.ACCESS_LIVE_PREDICTIONS]: true,
});

export function normalizeSessionKind(kind) {
  const value = String(kind || "")
    .trim()
    .toLowerCase();

  if (value === SESSION_KIND.GUEST) return SESSION_KIND.GUEST;
  if (value === SESSION_KIND.USER) return SESSION_KIND.USER;

  return SESSION_KIND.ANON;
}


/**
 * ============================================================
 * PALPITACO JB — RUNTIME ACCESS POLICY V1
 * ============================================================
 *
 * Faz a ponte entre:
 *
 * - COMMERCIAL_ACCESS_MATRIX_V1
 * - consumidores novos de capabilities V2
 * - consumidores antigos ainda usando:
 *     GENERATE
 *     DOWNLOAD
 *     EXPORT
 *     ACCESS_LIVE_PREDICTIONS
 *
 * IMPORTANTE:
 * A compatibilidade abaixo é temporária.
 * Conforme as telas forem migradas para capabilities específicas
 * por produto, as chaves legadas poderão ser removidas.
 */
export function getRuntimeAccessPolicyForEntitlement(entitlement) {
  const commercialPolicy =
    getCommercialAccessPolicy(entitlement);

  const legacyGenerate =
    commercialPolicy?.[
      ACCESS_CAPABILITY.ACCESS_TOP3_LIVE_PREDICTIONS
    ] === true ||
    commercialPolicy?.[
      ACCESS_CAPABILITY.GENERATE_CENTENAS
    ] === true ||
    commercialPolicy?.[
      ACCESS_CAPABILITY.GENERATE_TERNO_GRUPO
    ] === true ||
    commercialPolicy?.[
      ACCESS_CAPABILITY.GENERATE_STATISTICS_RANKING
    ] === true ||
    commercialPolicy?.[
      ACCESS_CAPABILITY.GENERATE_DOWNLOAD_PREVIEW
    ] === true;

  const legacyDownload =
    commercialPolicy?.[
      ACCESS_CAPABILITY.DOWNLOAD_FILES
    ] === true ||
    commercialPolicy?.[
      ACCESS_CAPABILITY.DOWNLOAD_REPORTS
    ] === true;

  const legacyExport =
    commercialPolicy?.[
      ACCESS_CAPABILITY.EXPORT_DATA
    ] === true;

  const legacyLivePredictions =
    commercialPolicy?.[
      ACCESS_CAPABILITY.ACCESS_TOP3_LIVE_PREDICTIONS
    ] === true;

  return Object.freeze({
    ...commercialPolicy,

    // ========================================================
    // COMPATIBILIDADE TEMPORÁRIA
    // ========================================================
    [ACCESS_CAPABILITY.GENERATE]:
      legacyGenerate,

    [ACCESS_CAPABILITY.DOWNLOAD]:
      legacyDownload,

    [ACCESS_CAPABILITY.EXPORT]:
      legacyExport,

    [ACCESS_CAPABILITY.ACCESS_LIVE_PREDICTIONS]:
      legacyLivePredictions,
  });
}
export function getAccessPolicy(sessionOrKind) {
  const session =
    sessionOrKind &&
    typeof sessionOrKind === "object"
      ? sessionOrKind
      : null;

  const kind = session
    ? getAccessSessionKind(session)
    : normalizeSessionKind(sessionOrKind);

  if (kind === SESSION_KIND.GUEST) {
    return GUEST_ACCESS;
  }

  if (kind === SESSION_KIND.USER) {
    /**
     * Runtime comercial ativo.
     *
     * A sessão determina o entitlement e toda a autorização
     * funcional passa pelo contrato central.
     *
     * Nenhuma página precisa conhecer diretamente:
     * FREE / TRIAL / STANDARD / PLUS / PREMIUM / VIP / ADMIN.
     */
    const entitlement =
      getAccessEntitlement(session);

    return getRuntimeAccessPolicyForEntitlement(
      entitlement
    );
  }

  return Object.freeze({
    [ACCESS_CAPABILITY.NAVIGATE]: false,

    [ACCESS_CAPABILITY.CHANGE_FILTERS]: false,
    [ACCESS_CAPABILITY.CHANGE_DATE]: false,
    [ACCESS_CAPABILITY.CHANGE_LOTTERY]: false,
    [ACCESS_CAPABILITY.CHANGE_HOUR]: false,

    [ACCESS_CAPABILITY.SEARCH]: false,
    [ACCESS_CAPABILITY.GENERATE]: false,

    [ACCESS_CAPABILITY.DOWNLOAD]: false,
    [ACCESS_CAPABILITY.EXPORT]: false,

    [ACCESS_CAPABILITY.ACCESS_LIVE_PREDICTIONS]: false,
  });
}

export function can(sessionOrKind, capability) {
  const policy = getAccessPolicy(sessionOrKind);

  return policy?.[capability] === true;
}

export function isGuestSession(sessionKind) {
  return normalizeSessionKind(sessionKind) === SESSION_KIND.GUEST;
}

export function isProtectedGuestFeature(feature) {
  const key = String(feature || "")
    .trim()
    .toLowerCase();

  return (
    key === PROTECTED_FEATURE.TOP3 ||
    key === PROTECTED_FEATURE.CENTENAS ||
    key === PROTECTED_FEATURE.TERNO_GRUPO ||
    key === PROTECTED_FEATURE.DOWNLOADS
  );
}

/**
 * Política inicial de páginas para Guest.
 *
 * "readonly":
 *   página pode ser exibida, mas sem interação de consulta.
 *
 * "preview":
 *   página existe como demonstração, sem conteúdo operacional real.
 *
 * "blocked":
 *   acesso funcional indisponível.
 */
export const GUEST_PAGE_MODE = Object.freeze({
  dashboard: "readonly",
  results: "readonly",
  late: "readonly",
  search: "readonly",
  statistics: "readonly",

  top3: "preview",
  centenas: "preview",
  "terno-grupo": "preview",

  downloads: "blocked",

  account: "readonly",
  payments: "readonly",
});

export function getGuestPageMode(screen) {
  const key = String(screen || "")
    .trim()
    .toLowerCase();

  return GUEST_PAGE_MODE[key] || "readonly";
}
