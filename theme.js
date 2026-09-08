(function () {
  var STORAGE_KEY = "kitty_theme";
  var root = document.documentElement;

  function getSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function savedTheme() {
    var t = getSavedTheme();
    return t === "light" || t === "dark" ? t : "dark";
  }

  function saveTheme(t) {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch (e) {}
  }

  function apply(t) {
    root.setAttribute("data-theme", t);
    document.querySelectorAll("#themeToggle").forEach(function (btn) {
      btn.classList.toggle("theme-toggle--on", t === "light");
    });
  }

  apply(savedTheme());

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("themeToggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      var icon = btn.querySelector(".theme-toggle__icon");
      if (icon) {
        icon.classList.remove("theme-toggle__icon--anim");
        void icon.offsetWidth;
        icon.classList.add("theme-toggle__icon--anim");
      }
      apply(next);
      saveTheme(next);
    });
  });
})();
