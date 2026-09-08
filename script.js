// Scroll reveal
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

// Раскрываем карточки (features/pricing/community) с поэтапной задержкой
document.querySelectorAll(".features, .pricing, .community__cards").forEach((grid) => {
  const children = grid.children;
  // чередуем направление появления для эффектности
  Array.from(children).forEach((child, i) => {
    child.classList.add("reveal");
    const dirs = ["", "up", "", "left", "", "right"];
    if (dirs[i]) child.dataset.dir = dirs[i];
    observer.observe(child);
  });
});

// Плавное появление заголовков секций
const titleObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        titleObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);
document.querySelectorAll(".section__title, .section__subtitle").forEach((el) => {
  titleObserver.observe(el);
});

document.querySelectorAll(".download__inner, .hero__stats").forEach((el) => {
  el.classList.add("reveal");
  observer.observe(el);
});

// Header blur on scroll
const header = document.querySelector(".header");
let ticking = false;

window.addEventListener("scroll", () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      if (window.scrollY > 40) {
        header.style.background = "rgba(13, 11, 10, 0.92)";
      } else {
        header.style.background = "rgba(13, 11, 10, 0.75)";
      }
      ticking = false;
    });
    ticking = true;
  }
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    if (id === "#") return;
    const target = document.querySelector(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

// Header auth state: show "My cabinet" if logged in
(function updateHeaderAuth() {
  const current = localStorage.getItem("kc_current");
  const headerAuth = document.getElementById("headerAuth");
  if (headerAuth && current) {
    headerAuth.innerHTML = '<a href="cabinet.html" class="btn btn--accent btn--sm">Мой кабинет</a>';
  }
})();

// Counter animation for stats
function animateValue(el, start, end, duration, suffix) {
  let startTime = null;
  const step = (timestamp) => {
    if (!startTime) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(start + (end - start) * eased) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const statsObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const values = entry.target.querySelectorAll(".stat__value");
        values.forEach((v) => {
          const text = v.textContent.trim();
          if (text === "1.21.1" || text === "Fabric" || text === "100%") return;
          const match = text.match(/^([\d.,]+)(.*)$/);
          if (match) {
            const num = parseFloat(match[1].replace(",", "."));
            const suffix = match[2];
            animateValue(v, 0, num, 1200, suffix);
          }
        });
        statsObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.5 }
);

const heroStats = document.querySelector(".hero__stats");
if (heroStats) statsObserver.observe(heroStats);