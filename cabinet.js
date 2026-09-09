// Личный кабинет Kitty Client (Supabase)

const nameEl = document.getElementById("cabNick");
const TIER_INFO = window.kittyAuth.TIER_INFO;
const ROLE_INFO = window.kittyAuth.ROLE_INFO;
const ADMIN_ROLES = window.kittyAuth.ADMIN_ROLES;

let currentUser = null;

function client() {
  return window.supabaseClient;
}

// Состояние страницы: текущий профиль или null
async function loadUser() {
  const profile = await window.kittyAuth.getProfile();
  return profile;
}

async function requireAuth() {
  const user = await loadUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  if (user.banned) {
    await window.kittyAuth.signOut();
    window.location.href = "login.html";
    return null;
  }
  currentUser = user;
  return user;
}

function tierInfo(t) {
  return TIER_INFO[t] || TIER_INFO.free;
}
function roleInfo(r) {
  return ROLE_INFO[r] || ROLE_INFO.user;
}
function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

async function fillUser() {
  const user = await requireAuth();
  if (!user) return;
  const info = tierInfo(user.tier);

  nameEl.textContent = user.login;
  document.getElementById("cabAvatar").src = "https://i.pinimg.com/originals/d6/f2/38/d6f238dcf1e585ef7bc421a18cc7538f.jpg";
  const tierEl = document.getElementById("cabTier");
  tierEl.textContent = info.name;
  tierEl.className = "cab__tier cab__tier--" + info.cls;

  document.getElementById("ovNick").textContent = user.login;
  document.getElementById("heroAvatar").src = "https://i.pinimg.com/originals/d6/f2/38/d6f238dcf1e585ef7bc421a18cc7538f.jpg";
  document.getElementById("ovTier").textContent = "—";
  const pill = document.getElementById("ovPill");
  pill.textContent = info.name;
  pill.className = "cab__pill cab__pill--" + info.cls;

  const role = user.role || "user";
  const rinfo = roleInfo(role);
  const cabRole = document.getElementById("cabRole");
  cabRole.textContent = rinfo.name;
  cabRole.className = "cab__role cab__role--" + rinfo.cls;
  const heroRole = document.getElementById("heroRole");
  heroRole.textContent = rinfo.name;
  heroRole.className = "cab__role cab__role--" + rinfo.cls;

  const isAdmin = isAdminRole(role);
  const navAdmin = document.getElementById("navAdmin");
  if (navAdmin) navAdmin.style.display = isAdmin ? "" : "none";
  const adminTab = document.getElementById("tab-admin");
  if (adminTab) adminTab.style.display = isAdmin ? "" : "none";
  if (isAdmin) renderAdmin(user);

  const expireEl = document.getElementById("ovExpire");
  const daysEl = document.getElementById("ovDays");
  if (user.tier === "free" || !user.expiresAt) {
    expireEl.textContent = "—";
    daysEl.textContent = "—";
  } else if (user.expiresAt === "lifetime") {
    expireEl.textContent = "Навсегда";
    daysEl.textContent = "∞";
  } else {
    const exp = new Date(user.expiresAt);
    const now = Date.now();
    const daysLeft = Math.max(0, Math.ceil((exp.getTime() - now) / (1000 * 60 * 60 * 24)));
    expireEl.textContent = exp.toLocaleDateString("ru-RU");
    daysEl.textContent = daysLeft + (daysLeft % 10 === 1 && daysLeft % 100 !== 11 ? " день"
      : [2, 3, 4].includes(daysLeft % 10) && ![12, 13, 14].includes(daysLeft % 100) ? " дня"
      : " дней");
  }

  document.getElementById("pfLogin").textContent = user.login;
  document.getElementById("pfEmail").textContent = user.email;
  document.getElementById("pfDate").textContent = user.activated_at ? new Date(user.activated_at).toLocaleDateString("ru-RU") : "—";

  renderTg(user);
  renderSubscription(user);
}

// ---- Связка Telegram ----
function renderTg(user) {
  const desc = document.getElementById("tgDesc");
  const state = document.getElementById("tgState");
  const btn = document.getElementById("tgLinkBtn");
  if (user.tg_id) {
    desc.textContent = "Telegram привязан ✓ Коды 2FA и напоминания приходят в бот.";
    state.innerHTML = '<button id="tgLinkBtn" class="btn btn--ghost btn--sm" type="button">Перепривязать</button>';
  } else {
    desc.textContent = "Привяжите Telegram, чтобы получать коды 2FA и напоминания о подписке в боте.";
    state.innerHTML = '<button id="tgLinkBtn" class="btn btn--accent btn--sm" type="button">Привязать Telegram</button>';
  }
  state.querySelector("#tgLinkBtn").addEventListener("click", linkTelegram);
}

async function linkTelegram() {
  const msg = document.getElementById("tgMsg");
  if (msg) { msg.textContent = ""; }
  const sess = await window.kittyAuth.getSession();
  if (!sess) { if (msg) msg.textContent = "Войдите заново."; return; }
  try {
    const res = await fetch(window.KITTY_CONFIG.SUPABASE_URL + "/functions/v1/link-telegram", {
      method: "POST",
      headers: { Authorization: "Bearer " + sess.access_token, "Content-Type": "application/json" },
      body: "{}"
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      if (msg) { msg.textContent = "Ошибка: " + (data.detail || data.error || res.status); msg.style.color = "#ff5f56"; }
      return;
    }
    if (data.alreadyLinked) {
      if (msg) { msg.textContent = "Telegram уже привязан."; msg.style.color = "#a3c98f"; }
      return;
    }
    if (msg) {
      msg.textContent = "Введите в боте команду /link " + data.code + " (код действует 5 минут).";
      msg.style.color = "#a3c98f";
    }
    const desc = document.getElementById("tgDesc");
    if (desc) desc.textContent = "Ждём ввода кода в боте @kitty2fa_bot... Скажите боту /link " + data.code;
  } catch (e) {
    if (msg) { msg.textContent = "Ошибка запроса: " + e.message; msg.style.color = "#ff5f56"; }
  }
}

async function renderAdmin(admin) {
  const body = document.getElementById("adminBody");
  if (!body) return;
  const adminIsOwner = (admin.role || "user") === "owner";
  const q = (document.getElementById("adminSearch").value || "").trim().toLowerCase();

  let users = [];
  try {
    const { data, error } = await client().rpc("admin_list_users");
    if (error) throw error;
    users = data || [];
  } catch (e) {
    body.innerHTML = '<tr><td colspan="6" class="admin-empty">Ошибка загрузки списка: ' + esc(e.message || "нет доступа") + "</td></tr>";
    return;
  }

  users = users
    .filter((u) => !q || u.login.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q))
    .sort((a, b) => (roleInfo(a.role).rank < roleInfo(b.role).rank ? 1 : -1));

  let html = "";
  users.forEach((u) => {
    const r = u.role || "user";
    const rinfo = roleInfo(r);
    const info = tierInfo(u.tier || "free");
    const banned = !!u.banned;
    const isSelf = u.login === admin.login;

    let roleOptions = ["owner", "coder", "media", "user"]
      .map((rr) => {
        const canGrant = rr === "owner" ? adminIsOwner : true;
        if (!canGrant) return "";
        return '<option value="' + rr + '" ' + (rr === r ? "selected" : "") + '>' + ROLE_INFO[rr].name + "</option>";
      })
      .join("");

    html += '<tr class="' + (banned ? "admin-row--banned" : "") + '">'
      + "<td>" + esc(u.login) + (isSelf ? ' <span class="admin-you">(вы)</span>' : "") + "</td>"
      + "<td>" + esc(u.email || "—") + "</td>"
      + '<td><select class="admin-role" data-login="' + esc(u.login) + '" data-field="role" ' + (roleOptions ? "" : "disabled") + '>' + roleOptions + "</select></td>"
      + '<td><select class="admin-role" data-login="' + esc(u.login) + '" data-field="tier">'
      + Object.keys(TIER_INFO).map((t) => '<option value="' + t + '" ' + (u.tier === t ? "selected" : "") + '>' + TIER_INFO[t].name + "</option>").join("")
      + "</select></td>"
      + '<td><span class="admin-status ' + (banned ? "admin-status--banned" : "admin-status--ok") + '">' + (banned ? "Забанен" : "Активен") + "</span></td>"
      + '<td class="admin-actions">'
      + '<button class="admin-btn admin-btn--' + (banned ? "unban" : "ban") + '" data-login="' + esc(u.login) + '" data-action="' + (banned ? "unban" : "ban") + '" ' + (isSelf ? "disabled" : "") + '>' + (banned ? "Разбанить" : "Забанить") + "</button>"
      + '<button class="admin-btn admin-btn--del" data-login="' + esc(u.login) + '" data-action="del" ' + (isSelf ? "disabled" : "") + '>Удалить</button>'
      + "</td></tr>";
  });
  body.innerHTML = html || '<tr><td colspan="6" class="admin-empty">Пользователи не найдены</td></tr>';
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function adminLog(msg, ok) {
  const el = document.getElementById("adminMsg");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "#a3c98f" : "#ff5f56";
  el.classList.remove("adminMsg-bump");
  void el.offsetWidth;
  el.classList.add("adminMsg-bump");
}

async function callAdmin(fn, args) {
  const { error } = await client().rpc(fn, args);
  return error;
}

async function adminAction(evt) {
  const admin = currentUser;
  if (!admin || !isAdminRole(admin.role || "user")) return;
  const adminIsOwner = (admin.role || "user") === "owner";
  const el = evt.target;
  const login = el.dataset.login;

  if (el.dataset.action) {
    if (admin.login === login) {
      adminLog("Нельзя управлять самим собой", false);
      return;
    }
    if (el.dataset.action === "ban" || el.dataset.action === "unban") {
      const banned = el.dataset.action === "ban";
      const err = await callAdmin("admin_set_ban", { target_login: login, do_ban: banned });
      adminLog(err ? ("Ошибка: " + err.message) : (banned ? "Пользователь забанен" : "Пользователь разбанен"), !err);
    } else if (el.dataset.action === "del") {
      const err = await callAdmin("admin_delete_user", { target_login: login });
      adminLog(err ? ("Ошибка: " + err.message) : "Пользователь удалён", !err);
    }
    renderAdmin(admin);
    return;
  }

  if (el.dataset.field === "role") {
    const newRole = el.value;
    if (admin.login === login) {
      adminLog("Нельзя менять собственную роль через панель", false);
      renderAdmin(admin);
      return;
    }
    if (newRole === "owner" && !adminIsOwner) {
      adminLog("Только овнер может выдавать роль овнер", false);
      renderAdmin(admin);
      return;
    }
    const err = await callAdmin("admin_set_role", { target_login: login, new_role: newRole });
    adminLog(err ? ("Ошибка: " + err.message) : "Роль обновлена", !err);
  } else if (el.dataset.field === "tier") {
    const err = await callAdmin("admin_set_tier", { target_login: login, new_tier: el.value });
    adminLog(err ? ("Ошибка: " + err.message) : "Подписка обновлена", !err);
  }
  renderAdmin(admin);
}

document.addEventListener("change", (e) => { if (e.target.closest && e.target.closest(".admin-role")) adminAction(e); });
document.addEventListener("click", (e) => {
  if (e.target.closest && e.target.closest(".admin-btn")) adminAction(e);
});

const adminSearchInput = document.getElementById("adminSearch");
if (adminSearchInput) {
  adminSearchInput.addEventListener("input", () => { if (currentUser) renderAdmin(currentUser); });
}

// ---- Подписка ----
function renderSubscription(user) {
  const isPaid = user.tier !== "free";
  const badge = document.querySelector("#subStatus .sub-status__badge");
  const text = document.querySelector("#subStatus .sub-status__text");
  if (!badge) return;
  badge.textContent = tierInfo(user.tier).name;
  badge.className = "sub-status__badge sub-status__badge--" + tierInfo(user.tier).cls;
  if (user.expiresAt === "lifetime") {
    text.textContent = "Подписка «" + tierInfo(user.tier).name + "» активна навсегда.";
  } else if (isPaid && user.expiresAt) {
    text.textContent = "Подписка «" + tierInfo(user.tier).name + "» активна до " + new Date(user.expiresAt).toLocaleDateString("ru-RU") + ".";
  } else {
    text.textContent = isPaid
      ? "У вас активная подписка «" + tierInfo(user.tier).name + "»."
      : "Ваш аккаунт не имеет активной подписки.";
  }
}

async function activateKey(user, key) {
  const { data, error } = await client().rpc("activate_key", { p_key: key });
  const errEl = document.getElementById("subError");
  if (error) {
    errEl.textContent = "Ошибка активации: " + (error.message || "повторите попытку");
    return;
  }
  if (data === "ERROR_INVALID") { errEl.textContent = "Неверный ключ."; return; }
  if (data === "ERROR_USED") { errEl.textContent = "Этот ключ уже использован."; return; }
  if (data === "ERROR_ALREADY_PAID") { errEl.textContent = "У вас уже есть активная подписка."; return; }
  if (data !== "OK") { errEl.textContent = "Ошибка активации ключа."; return; }
  document.getElementById("subKey").value = "";
  errEl.style.color = "#a3c98f";
  errEl.textContent = "Ключ активирован!";
  document.getElementById("subKey").disabled = true;
  document.getElementById("activateKey").disabled = true;
  renderSubscription({ ...user, tier: key.includes("PREMIUM") ? "quarter" : key.includes("BASIC") ? "month" : "demo" });
  fillUser();
}

document.getElementById("activateKey").addEventListener("click", async () => {
  const user = await requireAuth();
  if (!user) return;
  if (user.tier !== "free") {
    document.getElementById("subError").textContent = "У вас уже есть активная подписка.";
    return;
  }
  const key = document.getElementById("subKey").value.trim().toUpperCase();
  if (!key) {
    document.getElementById("subError").textContent = "Введите ключ.";
    return;
  }
  await activateKey(user, key);
});

document.querySelectorAll("[data-buy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const user = await requireAuth();
    if (!user) return;
    const msg = document.getElementById("buyMsg");
    if (user.tier !== "free") {
      msg.textContent = "У вас уже есть активная подписка.";
      msg.style.color = "#ff5f56";
      return;
    }
    const tier = btn.dataset.buy;
    msg.textContent = "Оплата проходит в Telegram-боте 🇹 Ожидайте...";
    msg.style.color = "#ffcf70";
    window.open("https://t.me/kitty2fa_bot?start=buy_" + tier, "_blank");
  });
});

document.getElementById("promoGetBtn").addEventListener("click", async () => {
  const user = await requireAuth();
  if (!user) return;
  const msg = document.getElementById("promoMsg");
  const authId = user.auth_id;
  const { data, error } = await client().rpc("get_or_create_promo", { p_auth: authId });
  if (error || !data) {
    msg.textContent = "Не получилось получить код. Попробуйте позже.";
    msg.style.color = "#ff5f56";
    return;
  }
  msg.textContent = "Мой промокод: " + data + ". Друг получит +2 дня, когда введёт его.";
  msg.style.color = "#a3c98f";
});

document.getElementById("promoApplyBtn").addEventListener("click", async () => {
  const user = await requireAuth();
  if (!user) return;
  const msg = document.getElementById("promoMsg");
  const code = document.getElementById("promoCode").value.trim().toUpperCase();
  if (!code) {
    msg.textContent = "Введите промокод.";
    msg.style.color = "#ff5f56";
    return;
  }
  const authId = user.auth_id;
  const { data, error } = await client().rpc("apply_promo_credit", { p_promo_code: code, p_buyer_auth: authId });
  if (error || !data) {
    msg.textContent = "Ошибка применения промокода.";
    msg.style.color = "#ff5f56";
    return;
  }
  if (data.message === "not_found") { msg.textContent = "Промокод не найден."; msg.style.color = "#ff5f56"; return; }
  if (data.message === "self") { msg.textContent = "Это твой собственный промокод."; msg.style.color = "#ff5f56"; return; }
  if (data.message === "owner_missing") { msg.textContent = "Владелец промокода не найден."; msg.style.color = "#ff5f56"; return; }
  if (data.message === "lifetime") { msg.textContent = "Промокод применён, но у владельца бессрочная подписка — бонус не начислен."; msg.style.color = "#a3c98f"; return; }
  if (data.message === "credited") {
    msg.textContent = "Промокод применён! Владелец получил +2 дня.";
    msg.style.color = "#a3c98f";
    renderSubscription(user);
    fillUser();
    return;
  }
  msg.textContent = "Невозможно применить промокод.";
  msg.style.color = "#ff5f56";
});

// Переключение вкладок
document.querySelectorAll(".cab__nav-link").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".cab__nav-link").forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
    const tab = link.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.getElementById("tab-" + tab).classList.add("active");
  });
});

// Выход
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await window.kittyAuth.signOut();
  window.location.href = "index.html";
});

// Запуск
fillUser();

// Шапка (если есть): при наличии сессии показываем «Мой кабинет»
(function () {
  const headerAuth = document.getElementById("headerAuth");
  if (headerAuth) {
    window.kittyAuth.getSession().then((s) => {
      if (s) headerAuth.innerHTML = '<a href="cabinet.html" class="btn btn--ghost btn--sm">Мой кабинет</a>';
    });
  }
})();
