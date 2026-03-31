let revealObserver = null;

const getRevealObserver = () => {
  if (revealObserver) {
    return revealObserver;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.08,
      rootMargin: "0px 0px -6% 0px",
    }
  );

  return revealObserver;
};

export const observeReveals = (root = document) => {
  const observer = getRevealObserver();
  root.querySelectorAll(".reveal-up").forEach((element) => {
    if (!element.classList.contains("is-visible")) {
      observer.observe(element);
    }
  });
};

export const setupReveals = () => {
  observeReveals(document);
};

export const setupAlbumLinks = () => {
  const controls = document.querySelectorAll(".album-link");
  const cards = document.querySelectorAll(".album-card[data-category]");

  if (!controls.length) {
    return;
  }

  const availableFilters = new Set(["all"]);
  cards.forEach((card) => {
    (card.dataset.category || "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => availableFilters.add(value));
  });

  controls.forEach((control) => {
    const filter = control.dataset.filter || "all";
    control.hidden = !availableFilters.has(filter);
  });

  const applyFilter = (filter) => {
    const activeFilter = filter || "all";

    controls.forEach((control) => {
      control.classList.toggle("is-active", control.dataset.filter === activeFilter);
    });

    cards.forEach((card) => {
      const categories = (card.dataset.category || "")
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const matches = activeFilter === "all" || categories.includes(activeFilter);
      card.hidden = !matches;
    });
  };

  controls.forEach((control) => {
    control.addEventListener("click", () => {
      applyFilter(control.dataset.filter || "all");
    });
  });

  applyFilter("all");
};

export const setupMobileMenu = () => {
  const toggle = document.querySelector(".mobile-menu-toggle");
  const drawer = document.querySelector(".mobile-menu-drawer");
  const close = document.querySelector(".mobile-menu-close");

  if (!toggle || !drawer || !close) {
    return;
  }

  const setOpen = (open) => {
    drawer.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("has-mobile-menu", open);
  };

  toggle.addEventListener("click", () => {
    setOpen(!drawer.classList.contains("is-open"));
  });

  close.addEventListener("click", () => {
    setOpen(false);
  });

  drawer.addEventListener("click", (event) => {
    if (event.target === drawer || event.target.closest(".mobile-menu-panel a")) {
      setOpen(false);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer.classList.contains("is-open")) {
      setOpen(false);
    }
  });
};

export const setupParallax = () => {};

export const setupHomePage = () => {
  setupReveals();
  setupAlbumLinks();
  setupMobileMenu();
  setupParallax();
};
