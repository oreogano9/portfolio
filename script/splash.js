const HOMEPAGE_SETTINGS_PATH = "/data/homepage.settings.json";

const normalizeHomepageSettingsPath = (value) => {
  if (typeof value !== "string") {
    return HOMEPAGE_SETTINGS_PATH;
  }

  const normalized = value.replace(/^\/+/, "").replace(/^\.\//, "").trim();
  return normalized ? `/${normalized}` : HOMEPAGE_SETTINGS_PATH;
};

const shouldSkipSplash = async (body) => {
  const settingsPath = normalizeHomepageSettingsPath(body.dataset.homepageSettings);
  const params = new URLSearchParams(window.location.search);

  if (params.has("home")) {
    return true;
  }

  try {
    const response = await fetch(settingsPath, { cache: "no-store" });
    if (!response.ok) {
      return false;
    }

    const settings = await response.json();
    if (settings?.showSplashOnEnter === true) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

const appendPrefetchHint = (href, as) => {
  if (!href) {
    return;
  }

  const url = new URL(href, window.location.href).href;
  const exists = Array.from(document.head.querySelectorAll('link[rel="prefetch"]')).some((link) => link.href === url);
  if (exists) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = href;
  if (as) {
    link.as = as;
  }
  document.head.appendChild(link);
};

const warmHomepageAssets = async (body) => {
  const settingsPath = normalizeHomepageSettingsPath(body.dataset.homepageSettings);

  appendPrefetchHint("/styles.css", "style");
  appendPrefetchHint("/script/main.js", "script");
  appendPrefetchHint("/script/home.js", "script");

  try {
    await Promise.allSettled([
      fetch("/styles.css", { cache: "force-cache" }),
      fetch(settingsPath, { cache: "force-cache" }),
    ]);
  } catch {
    return;
  }
};

const setupSplashRippleInvert = ({ enterLink, signal }) => {
  const canvas = document.querySelector("[data-splash-ripple-invert]");
  if (!(canvas instanceof HTMLCanvasElement) || !enterLink) {
    return;
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });
  const sourceCanvas = document.createElement("canvas");
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const image = new Image();

  let frameId = 0;
  let isActive = false;
  let sourcePixels = null;
  let outputPixels = null;
  let width = 0;
  let height = 0;
  let startedAt = 0;

  const rippleBursts = [
    { x: 0.5, y: 0.5, delay: 0, duration: 1360, scale: 0.68, width: 0.3, strength: 2 },
  ];

  const stop = () => {
    isActive = false;
    document.body.classList.remove("is-splash-ripple-active");
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
  };

  const drawCoveredImage = () => {
    if (!image.complete || !image.naturalWidth || !sourceContext) {
      return;
    }

    const imageRatio = image.naturalWidth / image.naturalHeight;
    const canvasRatio = width / height;
    const drawHeight = imageRatio > canvasRatio ? height : width / imageRatio;
    const drawWidth = imageRatio > canvasRatio ? height * imageRatio : width;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;

    sourceContext.clearRect(0, 0, width, height);
    sourceContext.drawImage(image, x, y, drawWidth, drawHeight);
    sourcePixels = sourceContext.getImageData(0, 0, width, height);
    outputPixels = sourceContext.createImageData(width, height);
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const targetWidth = Math.min(420, Math.max(240, Math.round(rect.width / 2)));
    const targetHeight = Math.max(240, Math.round(targetWidth * (rect.height / rect.width)));

    if (targetWidth === width && targetHeight === height) {
      return;
    }

    width = targetWidth;
    height = targetHeight;
    canvas.width = width;
    canvas.height = height;
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    drawCoveredImage();
  };

  const render = (time) => {
    if (!isActive || !context || !sourcePixels || !outputPixels) {
      return;
    }

    const source = sourcePixels.data;
    const output = outputPixels.data;
    const elapsed = time - startedAt;
    const maxDistance = Math.sqrt((width * width) + (height * height));
    const activeBursts = rippleBursts
      .map((burst) => ({ ...burst, progress: (elapsed - burst.delay) / burst.duration }))
      .filter((burst) => burst.progress > 0 && burst.progress < 1);

    if (!activeBursts.length && elapsed > 2580) {
      stop();
      return;
    }

    for (let index = 0; index < output.length; index += 4) {
      const pixel = index / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      let alpha = 0;

      for (const burst of activeBursts) {
        const centerX = width * burst.x;
        const centerY = height * burst.y;
        const easedProgress = 1 - ((1 - burst.progress) * (1 - burst.progress));
        const radius = easedProgress * maxDistance * burst.scale;
        const ringWidth = Math.max(8, Math.min(width, height) * burst.width);
        const distance = Math.hypot(x - centerX, y - centerY);
        const ring = Math.max(0, 1 - (Math.abs(distance - radius) / ringWidth));
        const wake = distance < radius ? Math.max(0, 1 - ((radius - distance) / (ringWidth * 3.4))) * 0.18 : 0;
        const fade = 1 - Math.max(0, (burst.progress - 0.72) / 0.28);
        alpha = Math.max(alpha, (ring + wake) * burst.strength * fade);
      }

      output[index] = 255 - source[index];
      output[index + 1] = 255 - source[index + 1];
      output[index + 2] = 255 - source[index + 2];
      output[index + 3] = Math.round(Math.min(1, alpha) * 235);
    }

    context.putImageData(outputPixels, 0, 0);
    frameId = window.requestAnimationFrame(render);
  };

  const start = () => {
    if (isActive) {
      return;
    }

    resize();
    if (!sourcePixels) {
      return;
    }

    isActive = true;
    startedAt = performance.now();
    document.body.classList.add("is-splash-ripple-active");
    frameId = window.requestAnimationFrame(render);
  };

  image.addEventListener("load", drawCoveredImage, { signal });
  image.src = "/assets/splash/hero.png";

  window.addEventListener("resize", resize, { signal });
  signal.addEventListener("abort", stop, { once: true });

  return start;
};

const setupSplash = () => {
  const body = document.body;
  if (!body.classList.contains("splash-page")) {
    return;
  }

  const isInlineHome = body.classList.contains("home-page");
  const target = body.dataset.splashTarget || "/?home=1";
  const enterLink = document.querySelector("[data-splash-enter]");
  const splashShell = document.querySelector("[data-splash-shell]");
  const activeListeners = new AbortController();

  const startSplashRipple = setupSplashRippleInvert({ enterLink, signal: activeListeners.signal });

  const isSplashActive = () => body.classList.contains("has-active-splash");

  let hasEntered = false;

  const forceTop = () => {
    try {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch {
      // Some embedded browser runtimes expose these as read-only.
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };

  const finishInlineHomeReveal = () => {
    document.documentElement.classList.remove("has-active-splash-root");
    document.documentElement.classList.add("has-unlocked-splash-root");
    body.classList.remove("has-active-splash", "has-entering-splash");
    body.classList.add("has-entered-splash");
    splashShell?.setAttribute("aria-hidden", "true");
    forceTop();
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname || "/");
    }
  };

  const revealInlineHome = ({ animate = false } = {}) => {
    activeListeners.abort();
    forceTop();

    if (!animate || !splashShell) {
      finishInlineHomeReveal();
      return;
    }

    let isFinished = false;
    const finish = () => {
      if (isFinished) {
        return;
      }

      isFinished = true;
      window.clearTimeout(fallbackTimer);
      splashShell.removeEventListener("transitionend", handleTransitionEnd);
      finishInlineHomeReveal();
    };

    const handleTransitionEnd = (event) => {
      if (event.target === splashShell && event.propertyName === "opacity") {
        finish();
      }
    };

    splashShell.addEventListener("transitionend", handleTransitionEnd);
    const fallbackTimer = window.setTimeout(finish, 720);
    window.setTimeout(() => {
      if (body.classList.contains("has-entered-splash")) {
        document.documentElement.classList.remove("has-active-splash-root");
        document.documentElement.classList.add("has-unlocked-splash-root");
      }
    }, 760);

    window.requestAnimationFrame(() => {
      forceTop();
      body.classList.add("has-entering-splash");
    });
  };

  const enter = () => {
    if (hasEntered) {
      return;
    }

    hasEntered = true;
    if (isInlineHome) {
      startSplashRipple?.();
      body.classList.add("is-splash-clicking");
      window.setTimeout(() => {
        revealInlineHome({ animate: true });
      }, 500);
      return;
    }

    body.classList.add("is-leaving");
    window.setTimeout(() => {
      window.location.href = target;
    }, 220);
  };

  const handleSplashClick = (event) => {
    if (!isSplashActive()) {
      return;
    }

    event.preventDefault();
    enter();
  };

  splashShell?.addEventListener("click", handleSplashClick, { signal: activeListeners.signal });
  enterLink?.addEventListener("click", handleSplashClick, { signal: activeListeners.signal });

  document.documentElement.classList.remove("has-unlocked-splash-root");
  document.documentElement.classList.add("has-active-splash-root");
  body.classList.add("has-active-splash");
  body.classList.add("is-ready");
  forceTop();

  return revealInlineHome;
};

const bootstrapSplash = async () => {
  const body = document.body;
  if (!body.classList.contains("splash-page")) {
    return;
  }

  const revealInlineHome = setupSplash();

  if (await shouldSkipSplash(body)) {
    revealInlineHome?.();
    body.classList.add("is-ready");
    return;
  }

  warmHomepageAssets(body);
};

bootstrapSplash();
