const HOMEPAGE_SETTINGS_PATH = "/data/homepage.settings.json";
const SPLASH_TIMING_STORAGE_KEY = "konradSplashTimingSettings";
const SPLASH_IMAGE_URLS = [
  "/assets/splash/hero.png",
  "/assets/splash/DSC05857_copy-d0fe7bc7-2500.jpg",
  "/assets/splash/IMG_8893_DxO_copy-b2c0bb74-2500.jpg",
  "/assets/splash/IMG_0821-34f437b6-2500.jpg",
  "/assets/splash/IMG_0524-2_copy_Large_1-3544b26c-2500.jpg",
];
const SPLASH_IMAGE_TRANSITION_MODES = new Set(["fade", "wipeBlur", "cut", "off"]);
const SPLASH_REVEAL_FEELS = {
  smooth: { label: "Smooth ease", easeX1: 0.85, easeY1: 0, easeX2: 0.15, easeY2: 1 },
  slowStart: { label: "Slow start", easeX1: 0.92, easeY1: 0, easeX2: 0.2, easeY2: 1 },
  soft: { label: "Soft fade", easeX1: 0.42, easeY1: 0, easeX2: 0.2, easeY2: 1 },
  direct: { label: "Direct", easeX1: 0.25, easeY1: 0.1, easeX2: 0.25, easeY2: 1 },
};
const DEFAULT_SPLASH_TIMING_SETTINGS = {
  fadeDelay: 400,
  fadeDuration: 1600,
  imageRotationMode: "fade",
  imageHoldDuration: 5000,
  imageFadeDuration: 2000,
  revealFeel: "direct",
  easeX1: 0.25,
  easeY1: 0.1,
  easeX2: 0.25,
  easeY2: 1,
};

const clampNumber = (value, min, max, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
};

const normalizeSplashTimingSettings = (settings = {}) => {
  const revealFeel = Object.prototype.hasOwnProperty.call(SPLASH_REVEAL_FEELS, settings.revealFeel)
    ? settings.revealFeel
    : DEFAULT_SPLASH_TIMING_SETTINGS.revealFeel;
  const revealPreset = SPLASH_REVEAL_FEELS[revealFeel];

  return {
    fadeDelay: clampNumber(settings.fadeDelay, 0, 3000, DEFAULT_SPLASH_TIMING_SETTINGS.fadeDelay),
    fadeDuration: clampNumber(settings.fadeDuration, 100, 4000, DEFAULT_SPLASH_TIMING_SETTINGS.fadeDuration),
    imageRotationMode: SPLASH_IMAGE_TRANSITION_MODES.has(settings.imageRotationMode)
      ? settings.imageRotationMode
      : DEFAULT_SPLASH_TIMING_SETTINGS.imageRotationMode,
    imageHoldDuration: clampNumber(settings.imageHoldDuration, 500, 12000, DEFAULT_SPLASH_TIMING_SETTINGS.imageHoldDuration),
    imageFadeDuration: clampNumber(settings.imageFadeDuration, 100, 5000, DEFAULT_SPLASH_TIMING_SETTINGS.imageFadeDuration),
    revealFeel,
    easeX1: revealPreset.easeX1,
    easeY1: revealPreset.easeY1,
    easeX2: revealPreset.easeX2,
    easeY2: revealPreset.easeY2,
  };
};

const loadSplashTimingSettings = () => {
  try {
    const storedSettings = JSON.parse(window.localStorage.getItem(SPLASH_TIMING_STORAGE_KEY) || "{}");
    return normalizeSplashTimingSettings(storedSettings);
  } catch {
    return normalizeSplashTimingSettings();
  }
};

const saveSplashTimingSettings = (settings) => {
  try {
    window.localStorage.setItem(SPLASH_TIMING_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
};

const applySplashTimingSettings = (settings) => {
  const root = document.documentElement;
  root.style.setProperty("--splash-fade-duration", `${Math.round(settings.fadeDuration)}ms`);
  root.style.setProperty("--splash-image-fade-duration", `${Math.round(settings.imageFadeDuration)}ms`);
  root.style.setProperty("--splash-ease-x1", settings.easeX1.toFixed(3));
  root.style.setProperty("--splash-ease-y1", settings.easeY1.toFixed(3));
  root.style.setProperty("--splash-ease-x2", settings.easeX2.toFixed(3));
  root.style.setProperty("--splash-ease-y2", settings.easeY2.toFixed(3));
};

const getCubicPoint = (time, x1, y1, x2, y2) => {
  const inverse = 1 - time;
  const x = (3 * inverse * inverse * time * x1) + (3 * inverse * time * time * x2) + (time * time * time);
  const y = (3 * inverse * inverse * time * y1) + (3 * inverse * time * time * y2) + (time * time * time);
  return { x, y };
};

const getSplashCurvePath = (settings) => {
  const points = [];
  for (let index = 0; index <= 36; index += 1) {
    const point = getCubicPoint(index / 36, settings.easeX1, settings.easeY1, settings.easeX2, settings.easeY2);
    points.push(`${Math.round(point.x * 160)},${Math.round(160 - (point.y * 160))}`);
  }
  return points.join(" ");
};

const getRandomSplashImageIndex = () => Math.floor(Math.random() * SPLASH_IMAGE_URLS.length);

const preloadSplashImage = (url) => {
  const image = new Image();
  image.src = url;
};

const getSecondsLabel = (milliseconds) => {
  const seconds = milliseconds / 1000;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
};

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

const setupSplashTimingEditor = ({ body, settings, onChange, signal }) => {
  const panel = document.createElement("aside");
  panel.className = "splash-timing-panel";
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <div class="splash-timing-panel__header">
      <strong>Splash settings</strong>
      <button type="button" data-splash-timing-close aria-label="Close timing panel">Close</button>
    </div>
    <div class="splash-timing-section-title">Enter transition</div>
    <svg class="splash-timing-curve" viewBox="0 0 160 160" aria-hidden="true">
      <line x1="0" y1="160" x2="160" y2="160"></line>
      <line x1="0" y1="0" x2="0" y2="160"></line>
      <polyline data-splash-timing-curve points=""></polyline>
      <circle data-splash-timing-p1 r="4"></circle>
      <circle data-splash-timing-p2 r="4"></circle>
    </svg>
    <label class="splash-timing-field">
      <span>Pause after click <output data-output-for="fadeDelay"></output></span>
      <input data-splash-timing-input="fadeDelay" type="range" min="0" max="3000" step="50">
    </label>
    <label class="splash-timing-field">
      <span>Main page fade <output data-output-for="fadeDuration"></output></span>
      <input data-splash-timing-input="fadeDuration" type="range" min="100" max="4000" step="50">
    </label>
    <label class="splash-timing-field">
      <span>Fade feel</span>
      <select class="splash-timing-select" data-splash-timing-select="revealFeel">
        <option value="smooth">Smooth ease</option>
        <option value="slowStart">Slow start</option>
        <option value="soft">Soft fade</option>
        <option value="direct">Direct</option>
      </select>
    </label>
    <div class="splash-timing-section-title">Image rotation</div>
    <label class="splash-timing-field">
      <span>Image behavior</span>
      <select class="splash-timing-select" data-splash-timing-select="imageRotationMode">
        <option value="fade">Fade cycle</option>
        <option value="wipeBlur">Wipe blur cycle</option>
        <option value="cut">Instant cycle</option>
        <option value="off">Random image only</option>
      </select>
    </label>
    <label class="splash-timing-field">
      <span>Time per image <output data-output-for="imageHoldDuration"></output></span>
      <input data-splash-timing-input="imageHoldDuration" type="range" min="500" max="12000" step="100">
    </label>
    <label class="splash-timing-field">
      <span>Image fade length <output data-output-for="imageFadeDuration"></output></span>
      <input data-splash-timing-input="imageFadeDuration" type="range" min="100" max="5000" step="100">
    </label>
    <button class="splash-timing-reset" type="button" data-splash-timing-reset>Reset settings</button>
  `;
  document.body.appendChild(panel);

  const curve = panel.querySelector("[data-splash-timing-curve]");
  const point1 = panel.querySelector("[data-splash-timing-p1]");
  const point2 = panel.querySelector("[data-splash-timing-p2]");
  const inputs = Array.from(panel.querySelectorAll("[data-splash-timing-input], [data-splash-timing-number]"));
  const selects = Array.from(panel.querySelectorAll("[data-splash-timing-select]"));
  const outputs = Array.from(panel.querySelectorAll("[data-output-for]"));

  const render = () => {
    inputs.forEach((input) => {
      const key = input.dataset.splashTimingInput || input.dataset.splashTimingNumber;
      input.value = String(settings[key]);
    });
    selects.forEach((select) => {
      const key = select.dataset.splashTimingSelect;
      select.value = String(settings[key]);
    });
    outputs.forEach((output) => {
      const key = output.dataset.outputFor;
      const isTime = key === "fadeDelay" || key === "fadeDuration" || key === "imageHoldDuration" || key === "imageFadeDuration";
      output.textContent = isTime ? getSecondsLabel(settings[key]) : settings[key];
    });
    curve?.setAttribute("points", getSplashCurvePath(settings));
    point1?.setAttribute("cx", String(settings.easeX1 * 160));
    point1?.setAttribute("cy", String(160 - (settings.easeY1 * 160)));
    point2?.setAttribute("cx", String(settings.easeX2 * 160));
    point2?.setAttribute("cy", String(160 - (settings.easeY2 * 160)));
  };

  const updateSetting = (key, value) => {
    const preset = key === "revealFeel" ? SPLASH_REVEAL_FEELS[value] : null;
    const nextSettings = normalizeSplashTimingSettings({ ...settings, [key]: value, ...preset });
    Object.assign(settings, nextSettings);
    onChange(settings);
    saveSplashTimingSettings(settings);
    render();
  };

  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.splashTimingInput || input.dataset.splashTimingNumber;
      updateSetting(key, Number(input.value));
    }, { signal });
  });

  selects.forEach((select) => {
    select.addEventListener("change", () => {
      const key = select.dataset.splashTimingSelect;
      updateSetting(key, select.value);
    }, { signal });
  });

  panel.querySelector("[data-splash-timing-close]")?.addEventListener("click", () => {
    body.classList.remove("is-splash-timing-editing");
    panel.setAttribute("aria-hidden", "true");
  }, { signal });

  panel.querySelector("[data-splash-timing-reset]")?.addEventListener("click", () => {
    Object.assign(settings, normalizeSplashTimingSettings());
    onChange(settings);
    saveSplashTimingSettings(settings);
    render();
  }, { signal });

  render();
  return panel;
};

const setupSplashImageRotation = ({ settings, onImageChange, signal }) => {
  const layers = Array.from(document.querySelectorAll("[data-splash-backdrop-layer]"));
  if (layers.length < 2 || !SPLASH_IMAGE_URLS.length) {
    return;
  }

  const shell = document.querySelector("[data-splash-shell]");
  let activeLayerIndex = 0;
  let activeImageIndex = getRandomSplashImageIndex();
  let timerId = 0;
  let transitionTimerId = 0;
  let currentSettings = settings;

  const setLayerImage = (layer, url) => {
    layer.style.backgroundImage = `url("${url}")`;
  };

  const clearWipeState = () => {
    shell?.classList.remove("is-wipe-blur-transition");
    layers.forEach((layer) => {
      layer.classList.remove("is-wipe-in", "is-wipe-out");
      layer.style.removeProperty("clip-path");
      layer.style.removeProperty("filter");
      layer.style.removeProperty("opacity");
    });
  };

  const scheduleNext = () => {
    window.clearTimeout(timerId);
    timerId = 0;

    if (currentSettings.imageRotationMode === "off" || SPLASH_IMAGE_URLS.length < 2) {
      return;
    }

    timerId = window.setTimeout(showNextImage, currentSettings.imageHoldDuration);
  };

  const showImage = (imageIndex, { direction = 1, immediate = false } = {}) => {
    const imageUrl = SPLASH_IMAGE_URLS[imageIndex];
    const previousLayer = layers[activeLayerIndex];
    const nextLayerIndex = activeLayerIndex === 0 ? 1 : 0;
    const nextLayer = layers[nextLayerIndex];

    if (imageIndex === activeImageIndex && !immediate) {
      return;
    }

    window.clearTimeout(transitionTimerId);
    clearWipeState();
    preloadSplashImage(SPLASH_IMAGE_URLS[(imageIndex + 1) % SPLASH_IMAGE_URLS.length]);
    setLayerImage(nextLayer, imageUrl);

    if (immediate || currentSettings.imageRotationMode === "cut") {
      previousLayer.classList.remove("is-active");
      nextLayer.classList.add("is-active");
    } else if (currentSettings.imageRotationMode === "wipeBlur") {
      const startsFromLeft = direction > 0;
      const startClip = startsFromLeft ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)";
      const endClip = startsFromLeft ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";

      shell?.classList.add("is-wipe-blur-transition");
      previousLayer.classList.add("is-wipe-out");
      nextLayer.classList.add("is-wipe-in");
      nextLayer.style.clipPath = startClip;
      nextLayer.style.filter = "blur(18px)";
      nextLayer.style.opacity = "1";
      previousLayer.style.clipPath = "inset(0 0 0 0)";
      previousLayer.style.filter = "blur(0)";
      previousLayer.style.opacity = "1";

      window.requestAnimationFrame(() => {
        previousLayer.classList.remove("is-active");
        nextLayer.classList.add("is-active");
        nextLayer.style.clipPath = "inset(0 0 0 0)";
        nextLayer.style.filter = "blur(0)";
        previousLayer.style.clipPath = endClip;
        previousLayer.style.filter = "blur(18px)";
      });

      transitionTimerId = window.setTimeout(clearWipeState, currentSettings.imageFadeDuration + 80);
    } else {
      window.requestAnimationFrame(() => {
        previousLayer.classList.remove("is-active");
        nextLayer.classList.add("is-active");
      });
    }

    activeLayerIndex = nextLayerIndex;
    activeImageIndex = imageIndex;
    onImageChange?.(imageUrl);
  };

  function showNextImage() {
    showImage((activeImageIndex + 1) % SPLASH_IMAGE_URLS.length, { direction: 1 });
    scheduleNext();
  }

  const showPreviousImage = () => {
    window.clearTimeout(timerId);
    showImage((activeImageIndex - 1 + SPLASH_IMAGE_URLS.length) % SPLASH_IMAGE_URLS.length, { direction: -1 });
    scheduleNext();
  };

  const showManualNextImage = () => {
    window.clearTimeout(timerId);
    showImage((activeImageIndex + 1) % SPLASH_IMAGE_URLS.length, { direction: 1 });
    scheduleNext();
  };

  layers.forEach((layer) => layer.classList.remove("is-active"));
  setLayerImage(layers[activeLayerIndex], SPLASH_IMAGE_URLS[activeImageIndex]);
  layers[activeLayerIndex].classList.add("is-active");
  onImageChange?.(SPLASH_IMAGE_URLS[activeImageIndex]);
  preloadSplashImage(SPLASH_IMAGE_URLS[(activeImageIndex + 1) % SPLASH_IMAGE_URLS.length]);
  scheduleNext();

  signal.addEventListener("abort", () => {
    window.clearTimeout(timerId);
    window.clearTimeout(transitionTimerId);
    clearWipeState();
  }, { once: true });

  return {
    applySettings(nextSettings) {
      currentSettings = nextSettings;
      scheduleNext();
    },
    getCurrentImageUrl() {
      return SPLASH_IMAGE_URLS[activeImageIndex];
    },
    next: showManualNextImage,
    previous: showPreviousImage,
  };
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
  let imageUrl = "";

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

  const setImage = (nextImageUrl) => {
    if (!nextImageUrl || nextImageUrl === imageUrl) {
      return;
    }

    imageUrl = nextImageUrl;
    sourcePixels = null;
    outputPixels = null;
    image.src = nextImageUrl;
  };

  image.addEventListener("load", drawCoveredImage, { signal });
  setImage(SPLASH_IMAGE_URLS[0]);

  window.addEventListener("resize", resize, { signal });
  signal.addEventListener("abort", stop, { once: true });

  return { setImage, start };
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
  const uiListeners = new AbortController();
  const visualListeners = new AbortController();
  const timingSettings = loadSplashTimingSettings();

  applySplashTimingSettings(timingSettings);
  const splashRipple = setupSplashRippleInvert({ enterLink, signal: visualListeners.signal });
  const imageRotation = setupSplashImageRotation({
    settings: timingSettings,
    onImageChange: (imageUrl) => splashRipple?.setImage(imageUrl),
    signal: visualListeners.signal,
  });
  const handleTimingChange = (nextSettings) => {
    applySplashTimingSettings(nextSettings);
    imageRotation?.applySettings(nextSettings);
  };
  const timingPanel = setupSplashTimingEditor({
    body,
    settings: timingSettings,
    onChange: handleTimingChange,
    signal: uiListeners.signal,
  });

  const isSplashActive = () => body.classList.contains("has-active-splash");

  let hasEntered = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let didSwipeImage = false;

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
    visualListeners.abort();
    forceTop();
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname || "/");
    }
  };

  const revealInlineHome = ({ animate = false } = {}) => {
    uiListeners.abort();
    body.classList.remove("is-splash-timing-editing");
    timingPanel?.setAttribute("aria-hidden", "true");
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
    const fallbackTimer = window.setTimeout(finish, timingSettings.fadeDuration + 120);
    window.setTimeout(() => {
      if (body.classList.contains("has-entered-splash")) {
        document.documentElement.classList.remove("has-active-splash-root");
        document.documentElement.classList.add("has-unlocked-splash-root");
      }
    }, timingSettings.fadeDuration + 160);

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
      splashRipple?.start();
      body.classList.add("is-splash-clicking");
      window.setTimeout(() => {
        revealInlineHome({ animate: true });
      }, timingSettings.fadeDelay);
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

    if (didSwipeImage) {
      event.preventDefault();
      event.stopPropagation();
      didSwipeImage = false;
      return;
    }

    event.preventDefault();
    enter();
  };

  splashShell?.addEventListener("click", handleSplashClick, { signal: uiListeners.signal });
  enterLink?.addEventListener("click", handleSplashClick, { signal: uiListeners.signal });

  splashShell?.addEventListener("touchstart", (event) => {
    if (!isSplashActive() || event.touches.length !== 1) {
      return;
    }

    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    didSwipeImage = false;
  }, { passive: true, signal: uiListeners.signal });

  splashShell?.addEventListener("touchend", (event) => {
    if (!isSplashActive() || !event.changedTouches.length || hasEntered) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const isHorizontalSwipe = Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35;

    if (!isHorizontalSwipe) {
      return;
    }

    event.preventDefault();
    didSwipeImage = true;
    if (deltaX < 0) {
      imageRotation?.next();
    } else {
      imageRotation?.previous();
    }

    window.setTimeout(() => {
      didSwipeImage = false;
    }, 450);
  }, { signal: uiListeners.signal });

  window.addEventListener("keydown", (event) => {
    const isMacToggle = event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "e";
    if (!isMacToggle || !isSplashActive()) {
      return;
    }

    const target = event.target;
    const isTypingTarget =
      target instanceof HTMLElement &&
      (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");

    if (isTypingTarget) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const isOpen = body.classList.toggle("is-splash-timing-editing");
    timingPanel?.setAttribute("aria-hidden", String(!isOpen));
  }, { capture: true, signal: uiListeners.signal });

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
