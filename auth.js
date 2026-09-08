// ============================================================
// Kitty Client — общий модуль авторизации (Supabase Auth + profiles)
// ============================================================

(function () {
  const TIER_INFO = {
    free: { name: "Без подписки", cls: "free", days: 0 },
    month: { name: "1 месяц", cls: "basic", days: 30 },
    quarter: { name: "90 дней", cls: "basic2", days: 90 },
    lifetime: { name: "Навсегда", cls: "premium", days: -1 },
    demo: { name: "Демо", cls: "demo", days: 30 }
  };
  const ROLE_INFO = {
    owner: { name: "ОВНЕР", cls: "owner", rank: 4 },
    coder: { name: "КОДЕР", cls: "coder", rank: 3 },
    media: { name: "МЕДИА", cls: "media", rank: 2 },
    user: { name: "ЮЗЕР", cls: "user", rank: 1 }
  };
  const ADMIN_ROLES = ["owner", "coder"];

  function client() {
    return window.supabaseClient;
  }

  // Текущая auth-сессия (обёртка)
  async function getSession() {
    try {
      const { data, error } = await client().auth.getSession();
      if (error) throw error;
      return data.session;
    } catch (e) {
      return null;
    }
  }

  // Подгрузить профиль по auth_id или по текущей сессии
  async function getProfile() {
    const s = await getSession();
    if (!s) return null;
    const { data, error } = await client()
      .from("profiles")
      .select("*")
      .eq("auth_id", s.user.id)
      .single();
    if (error) {
      console.error("getProfile error", error);
      return null;
    }
    return data;
  }

  // Регистрация: создаёт auth-юзера + профиль (ref — реферальный код пригласившего)
  async function signUp(login, email, password, ref) {
    // 1. Создаём auth-аккаунт
    const { data, error } = await client().auth.signUp({ email, password });
    if (error) return { error: error.message };
    const authId = data.user && data.user.id;

    // 2. Создаём профиль (связанный по auth_id)
    // Первый зарегистрированный автоматически становится овнером
    let role = "user";
    try {
      const { data, error } = await client().rpc("is_first_user");
      if (!error && data === true) role = "owner";
    } catch (e) { /* игнор */ }

    const { error: pErr } = await client().from("profiles").insert({
      auth_id: authId,
      login: login,
      email: email,
      role: role,
      banned: false,
      tier: "free",
      key_used: null,
      activated_at: new Date().toISOString(),
      expires_at: null,
      ref_by: ref || null
    });
    if (pErr) return { error: pErr.message };

    // Если пришёл реферальный код — пытаемся зачислить приглашение
    if (ref) {
      await client().rpc("apply_referral", { ref_code: ref, new_auth_id: authId }).catch(() => {});
    }

    // Если email подтверждён не нужен (Supabase может ставить confirmed)
    return { ok: true, user: data.user };
  }

  // Вход (по email или логину)
  async function signIn(loginOrEmail, password) {
    let email = loginOrEmail;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginOrEmail || "");
    if (!isEmail) {
      let resolved = null;
      try {
        const { data, error } = await client().rpc("login_resolve", { login_or_email: loginOrEmail });
        if (!error && data && data.email) resolved = data.email;
      } catch (e) { /* игнор */ }
      if (!resolved) return { error: "Пользователь не найден" };
      email = resolved;
    }
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { ok: true, user: data.user };
  }

  // Выход
  async function signOut() {
    await client().auth.signOut();
  }

  window.kittyAuth = {
    TIER_INFO,
    ROLE_INFO,
    ADMIN_ROLES,
    getSession,
    getProfile,
    signUp,
    signIn,
    signOut,
    client
  };
})();
