// ============================================================
// Kitty Client — подключение к Supabase
// Читает настройки из config.js. Ничего менять не надо.
// ============================================================

(function () {
  var cfg = (window.KITTY_CONFIG || {});
  var URL = cfg.SUPABASE_URL;
  var ANON = cfg.SUPABASE_ANON;

  window.supabaseClient = null;

  function init() {
    if (window.supabaseClient) return;
    if (!window.supabase) {
      console.error("Supabase JS не загружен. Проверь CDN script в HTML.");
      return;
    }
    window.supabaseClient = window.supabase.createClient(URL, ANON);
    return window.supabaseClient;
  }

  window.kittySupabase = { init: init };
  init();
})();
