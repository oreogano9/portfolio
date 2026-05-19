const HOMEPAGE_SETTINGS_PATH = "/data/homepage.settings.json";
const SPLASH_TIMING_STORAGE_KEY = "konradSplashTimingSettings";
const SPLASH_IMAGE_URLS = [
  "/assets/splash/hero.png",
  "/assets/splash/DSC05857_copy-d0fe7bc7-2500.jpg",
  "/assets/splash/IMG_8893_DxO_copy-b2c0bb74-2500.jpg",
  "/assets/splash/IMG_0821-34f437b6-2500.jpg",
  "/assets/splash/IMG_0524-2_copy_Large_1-3544b26c-2500.jpg",
];
const SPLASH_IMAGE_FOCAL_POINTS = {
  "/assets/splash/IMG_0524-2_copy_Large_1-3544b26c-2500.jpg": {
    mobile: "right center",
  },
};
const SPLASH_IMAGE_TRANSITION_MODES = new Set(["fade", "cut", "off"]);
const SPLASH_REVEAL_FEELS = {
  smooth: { label: "Smooth ease", easeX1: 0.85, easeY1: 0, easeX2: 0.15, easeY2: 1 },
  slowStart: { label: "Slow start", easeX1: 0.92, easeY1: 0, easeX2: 0.2, easeY2: 1 },
  soft: { label: "Soft fade", easeX1: 0.42, easeY1: 0, easeX2: 0.2, easeY2: 1 },
  direct: { label: "Direct", easeX1: 0.25, easeY1: 0.1, easeX2: 0.25, easeY2: 1 },
};
const SPLASH_TITLE_FONT_OPTIONS = {
  inter: { label: "Inter", css: '"Inter", sans-serif' },
  "moonbase-alpha": { label: "Moonbase Alpha", css: '"MoonbaseAlpha", sans-serif' },
  ledlight: { label: "LED Light", css: '"Ledlight", sans-serif' },
  saint: { label: "Saint", css: '"Saint", serif' },
  "young-serif": { label: "Young Serif", css: '"YoungSerif", serif' },
  clash: { label: "Clash Display", css: '"ClashDisplay", sans-serif' },
  "neue-haas": { label: "Neue Haas", css: '"NeueHaasDisplay", sans-serif' },
  manrope: { label: "Manrope", css: '"Manrope", sans-serif' },
  "space-grotesk": { label: "Space Grotesk", css: '"SpaceGrotesk", sans-serif' },
  "plus-jakarta-sans": { label: "Plus Jakarta Sans", css: '"PlusJakartaSans", sans-serif' },
  sora: { label: "Sora", css: '"Sora", sans-serif' },
  "instrument-serif": { label: "Instrument Serif", css: '"InstrumentSerif", serif' },
  "cormorant-garamond": { label: "Cormorant Garamond", css: '"CormorantGaramond", serif' },
  fraunces: { label: "Fraunces", css: '"Fraunces", serif' },
  newsreader: { label: "Newsreader", css: '"Newsreader", serif' },
  "libre-baskerville": { label: "Libre Baskerville", css: '"LibreBaskerville", serif' },
  syne: { label: "Syne", css: '"Syne", sans-serif' },
};
const DEFAULT_SPLASH_TIMING_SETTINGS = {
  fadeDelay: 400,
  fadeDuration: 1600,
  textFadeLead: 200,
  imageRotationMode: "fade",
  imageHoldDuration: 5000,
  imageFadeDuration: 2000,
  backgroundImageDarkness: 0,
  imagePunchScale: 0.99,
  titleFontFamily: "inter",
  titleLetterSpacing: 0.16,
  textPunchScale: 1.08,
  punchDuration: 1500,
  textGlassEnabled: true,
  textDifferenceBlendEnabled: false,
  differenceTextOpacity: 1,
  differenceBlendStrength: 1,
  differenceBlackWhiteStrength: 1,
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
    textFadeLead: clampNumber(settings.textFadeLead, 0, 2000, DEFAULT_SPLASH_TIMING_SETTINGS.textFadeLead),
    imageRotationMode: SPLASH_IMAGE_TRANSITION_MODES.has(settings.imageRotationMode)
      ? settings.imageRotationMode
      : DEFAULT_SPLASH_TIMING_SETTINGS.imageRotationMode,
    imageHoldDuration: clampNumber(settings.imageHoldDuration, 500, 12000, DEFAULT_SPLASH_TIMING_SETTINGS.imageHoldDuration),
    imageFadeDuration: clampNumber(settings.imageFadeDuration, 100, 5000, DEFAULT_SPLASH_TIMING_SETTINGS.imageFadeDuration),
    backgroundImageDarkness: clampNumber(settings.backgroundImageDarkness, 0, 0.85, DEFAULT_SPLASH_TIMING_SETTINGS.backgroundImageDarkness),
    imagePunchScale: clampNumber(settings.imagePunchScale, 0.85, 1.1, DEFAULT_SPLASH_TIMING_SETTINGS.imagePunchScale),
    titleFontFamily: Object.prototype.hasOwnProperty.call(SPLASH_TITLE_FONT_OPTIONS, settings.titleFontFamily)
      ? settings.titleFontFamily
      : DEFAULT_SPLASH_TIMING_SETTINGS.titleFontFamily,
    titleLetterSpacing: clampNumber(settings.titleLetterSpacing, 0, 0.5, DEFAULT_SPLASH_TIMING_SETTINGS.titleLetterSpacing),
    textPunchScale: clampNumber(settings.textPunchScale, 0.9, 1.3, DEFAULT_SPLASH_TIMING_SETTINGS.textPunchScale),
    punchDuration: clampNumber(settings.punchDuration, 100, 4000, DEFAULT_SPLASH_TIMING_SETTINGS.punchDuration),
    textGlassEnabled: settings.textGlassEnabled !== false,
    textDifferenceBlendEnabled: settings.textDifferenceBlendEnabled === true,
    differenceTextOpacity: clampNumber(settings.differenceTextOpacity, 0.05, 1, DEFAULT_SPLASH_TIMING_SETTINGS.differenceTextOpacity),
    differenceBlendStrength: clampNumber(settings.differenceBlendStrength, 0.05, 1, DEFAULT_SPLASH_TIMING_SETTINGS.differenceBlendStrength),
    differenceBlackWhiteStrength: clampNumber(settings.differenceBlackWhiteStrength, 0, 1, DEFAULT_SPLASH_TIMING_SETTINGS.differenceBlackWhiteStrength),
    revealFeel,
    easeX1: revealPreset.easeX1,
    easeY1: revealPreset.easeY1,
    easeX2: revealPreset.easeX2,
    easeY2: revealPreset.easeY2,
  };
};

const loadSplashTimingSettings = (savedSettings = {}) => {
  try {
    const storedSettings = JSON.parse(window.localStorage.getItem(SPLASH_TIMING_STORAGE_KEY) || "{}");
    return normalizeSplashTimingSettings({ ...savedSettings, ...storedSettings });
  } catch {
    return normalizeSplashTimingSettings(savedSettings);
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
  const titleFadeDuration = Math.max(100, Math.round(settings.fadeDelay + settings.fadeDuration - settings.textFadeLead));
  root.style.setProperty("--splash-fade-duration", `${Math.round(settings.fadeDuration)}ms`);
  root.style.setProperty("--splash-title-fade-duration", `${titleFadeDuration}ms`);
  root.style.setProperty("--splash-background-brightness", (1 - settings.backgroundImageDarkness).toFixed(3));
  root.style.setProperty("--splash-image-fade-duration", `${Math.round(settings.imageFadeDuration)}ms`);
  root.style.setProperty("--splash-image-punch-scale", settings.imagePunchScale.toFixed(3));
  root.style.setProperty("--splash-title-font-family", SPLASH_TITLE_FONT_OPTIONS[settings.titleFontFamily].css);
  root.style.setProperty("--splash-title-letter-spacing", `${settings.titleLetterSpacing.toFixed(3)}em`);
  root.style.setProperty("--splash-text-punch-scale", settings.textPunchScale.toFixed(3));
  root.style.setProperty("--splash-punch-duration", `${Math.round(settings.punchDuration)}ms`);
  root.style.setProperty("--splash-difference-text-opacity", settings.differenceTextOpacity.toFixed(3));
  root.style.setProperty("--splash-difference-blend-strength", settings.differenceBlendStrength.toFixed(3));
  root.style.setProperty("--splash-difference-bw-strength", settings.differenceBlackWhiteStrength.toFixed(3));
  root.style.setProperty("--splash-ease-x1", settings.easeX1.toFixed(3));
  root.style.setProperty("--splash-ease-y1", settings.easeY1.toFixed(3));
  root.style.setProperty("--splash-ease-x2", settings.easeX2.toFixed(3));
  root.style.setProperty("--splash-ease-y2", settings.easeY2.toFixed(3));
  document.body?.classList.toggle("has-splash-glass-text", settings.textGlassEnabled);
  document.body?.classList.toggle("has-splash-difference-text", settings.textDifferenceBlendEnabled);
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

const getInitialSplashImageIndex = () => {
  const earlyIndex = Number(window.__KONRAD_SPLASH_INITIAL_IMAGE_INDEX__);
  if (Number.isInteger(earlyIndex) && earlyIndex >= 0 && earlyIndex < SPLASH_IMAGE_URLS.length) {
    return earlyIndex;
  }

  return getRandomSplashImageIndex();
};

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

const fetchHomepageSettings = async (body, { cache = "no-store" } = {}) => {
  const settingsPath = normalizeHomepageSettingsPath(body.dataset.homepageSettings);

  try {
    const response = await fetch(settingsPath, { cache });
    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
};

const shouldSkipSplash = (settings) => {
  const params = new URLSearchParams(window.location.search);

  if (params.has("home")) {
    return true;
  }

  if (!settings || settings.showSplashOnEnter === true) {
    return false;
  }

  return true;
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

const setupSplashTimingEditor = ({ body, settings, onChange, onSave, signal }) => {
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
      <span>Text fade early by <output data-output-for="textFadeLead"></output></span>
      <input data-splash-timing-input="textFadeLead" type="range" min="0" max="2000" step="50">
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
    <div class="splash-timing-section-title">Punch in</div>
    <label class="splash-timing-field">
      <span>Image punch <output data-output-for="imagePunchScale"></output></span>
      <input data-splash-timing-input="imagePunchScale" type="range" min="0.85" max="1.1" step="0.005">
    </label>
    <label class="splash-timing-field">
      <span>Background darkness <output data-output-for="backgroundImageDarkness"></output></span>
      <input data-splash-timing-input="backgroundImageDarkness" type="range" min="0" max="0.85" step="0.01">
    </label>
    <label class="splash-timing-field">
      <span>Text punch <output data-output-for="textPunchScale"></output></span>
      <input data-splash-timing-input="textPunchScale" type="range" min="0.9" max="1.3" step="0.005">
    </label>
    <label class="splash-timing-field">
      <span>Splash font</span>
      <select class="splash-timing-select" data-splash-timing-select="titleFontFamily">
        ${Object.entries(SPLASH_TITLE_FONT_OPTIONS).map(([value, option]) => `<option value="${value}">${option.label}</option>`).join("")}
      </select>
    </label>
    <label class="splash-timing-field">
      <span>Letter spacing <output data-output-for="titleLetterSpacing"></output></span>
      <input data-splash-timing-input="titleLetterSpacing" type="range" min="0" max="0.5" step="0.005">
    </label>
    <label class="splash-timing-field">
      <span>Punch duration <output data-output-for="punchDuration"></output></span>
      <input data-splash-timing-input="punchDuration" type="range" min="100" max="4000" step="50">
    </label>
    <label class="splash-timing-field">
      <span>Glass text</span>
      <select class="splash-timing-select" data-splash-timing-select="textGlassEnabled">
        <option value="true">On</option>
        <option value="false">Off</option>
      </select>
    </label>
    <label class="splash-timing-field">
      <span>Difference blend</span>
      <select class="splash-timing-select" data-splash-timing-select="textDifferenceBlendEnabled">
        <option value="false">Off</option>
        <option value="true">On</option>
      </select>
    </label>
    <label class="splash-timing-field">
      <span>Difference text opacity <output data-output-for="differenceTextOpacity"></output></span>
      <input data-splash-timing-input="differenceTextOpacity" type="range" min="0.05" max="1" step="0.01">
    </label>
    <label class="splash-timing-field">
      <span>Difference strength <output data-output-for="differenceBlendStrength"></output></span>
      <input data-splash-timing-input="differenceBlendStrength" type="range" min="0.05" max="1" step="0.01">
    </label>
    <label class="splash-timing-field">
      <span>B&W strength <output data-output-for="differenceBlackWhiteStrength"></output></span>
      <input data-splash-timing-input="differenceBlackWhiteStrength" type="range" min="0" max="1" step="0.01">
    </label>
    <div class="splash-timing-section-title">Image rotation</div>
    <label class="splash-timing-field">
      <span>Image behavior</span>
      <select class="splash-timing-select" data-splash-timing-select="imageRotationMode">
        <option value="fade">Fade cycle</option>
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
    <div class="splash-timing-actions">
      <button class="splash-timing-copy" type="button" data-splash-timing-copy>Copy settings</button>
      <button class="splash-timing-save" type="button" data-splash-timing-save>Save to site</button>
      <button class="splash-timing-reset" type="button" data-splash-timing-reset>Reset settings</button>
    </div>
  `;
  document.body.appendChild(panel);

  const curve = panel.querySelector("[data-splash-timing-curve]");
  const point1 = panel.querySelector("[data-splash-timing-p1]");
  const point2 = panel.querySelector("[data-splash-timing-p2]");
  const inputs = Array.from(panel.querySelectorAll("[data-splash-timing-input], [data-splash-timing-number]"));
  const selects = Array.from(panel.querySelectorAll("[data-splash-timing-select]"));
  const outputs = Array.from(panel.querySelectorAll("[data-output-for]"));
  const saveButton = panel.querySelector("[data-splash-timing-save]");

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
      const isTime = key === "fadeDelay" || key === "fadeDuration" || key === "textFadeLead" || key === "imageHoldDuration" || key === "imageFadeDuration" || key === "punchDuration";
      const isPercent = key === "imagePunchScale" || key === "textPunchScale" || key === "backgroundImageDarkness" || key === "differenceTextOpacity" || key === "differenceBlendStrength" || key === "differenceBlackWhiteStrength";
      const isEm = key === "titleLetterSpacing";
      output.textContent = isTime ? getSecondsLabel(settings[key]) : isPercent ? `${Math.round(settings[key] * 100)}%` : isEm ? `${settings[key].toFixed(3)}em` : settings[key];
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
      const isBoolean = key === "textGlassEnabled" || key === "textDifferenceBlendEnabled";
      updateSetting(key, isBoolean ? select.value === "true" : select.value);
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

  panel.querySelector("[data-splash-timing-copy]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const settingsText = JSON.stringify(normalizeSplashTimingSettings(settings), null, 2);

    try {
      await navigator.clipboard.writeText(settingsText);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Copy failed";
    }

    window.setTimeout(() => {
      if (button.isConnected) {
        button.textContent = "Copy settings";
      }
    }, 1200);
  }, { signal });

  saveButton?.addEventListener("click", async () => {
    if (!onSave) {
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
      await onSave(normalizeSplashTimingSettings(settings));
      saveButton.textContent = "Saved";
    } catch (error) {
      saveButton.textContent = error instanceof Error ? error.message : "Save failed";
    }

    window.setTimeout(() => {
      if (saveButton.isConnected) {
        saveButton.disabled = false;
        saveButton.textContent = "Save to site";
      }
    }, 1800);
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
  let activeImageIndex = getInitialSplashImageIndex();
  let timerId = 0;
  let transitionTimerId = 0;
  let currentSettings = settings;

  const setLayerImage = (layer, url) => {
    const focalPoint = SPLASH_IMAGE_FOCAL_POINTS[url] || {};
    layer.style.backgroundImage = `url("${url}")`;
    layer.style.setProperty("--splash-image-position", focalPoint.default || "center center");
    layer.style.setProperty("--splash-image-position-mobile", focalPoint.mobile || focalPoint.default || "center center");
  };

  const clearWipeState = () => {
    shell?.classList.remove("is-wipe-forward", "is-wipe-backward");
    layers.forEach((layer) => {
      layer.classList.remove("is-wipe-in", "is-wipe-out");
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

const saveSplashSettingsToGitHub = async (body, splashSettings, fallbackHomepageSettings = null) => {
  const settingsPath = normalizeHomepageSettingsPath(body.dataset.homepageSettings).replace(/^\//, "");
  const homepageSettings = fallbackHomepageSettings || await fetchHomepageSettings(body);

  if (!homepageSettings || typeof homepageSettings !== "object") {
    throw new Error("Settings unavailable");
  }

  const response = await fetch("/api/save-homepage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      documentId: "homepage",
      settingsPath,
      settings: {
        ...homepageSettings,
        splashSettings: normalizeSplashTimingSettings(splashSettings),
      },
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Save failed");
  }

  saveSplashTimingSettings(splashSettings);
};

const setupSplash = (homepageSettings = null) => {
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
  const timingSettings = loadSplashTimingSettings(homepageSettings?.splashSettings);

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
    onSave: (nextSettings) => saveSplashSettingsToGitHub(body, nextSettings, homepageSettings),
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

  const unlockInlineHomeScroll = () => {
    document.documentElement.classList.remove("has-active-splash-root");
    document.documentElement.classList.add("has-unlocked-splash-root");
    body.classList.add("has-splash-scroll-unlocked");
  };

  const finishInlineHomeReveal = ({ keepSplashRuntime = false, preserveScroll = false } = {}) => {
    unlockInlineHomeScroll();
    body.classList.remove("has-active-splash", "has-entering-splash");
    body.classList.add("has-entered-splash");
    splashShell?.setAttribute("aria-hidden", "true");
    if (!keepSplashRuntime) {
      visualListeners.abort();
    }
    if (!preserveScroll) {
      forceTop();
    }
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname || "/");
    }
  };

  const restoreSplashForDebug = () => {
    hasEntered = false;
    document.documentElement.classList.remove("has-unlocked-splash-root");
    document.documentElement.classList.add("has-active-splash-root");
    body.classList.remove("has-entered-splash", "has-entering-splash", "has-splash-scroll-unlocked", "is-splash-clicking");
    body.classList.add("has-active-splash", "is-splash-timing-editing");
    splashShell?.setAttribute("aria-hidden", "false");
    timingPanel?.setAttribute("aria-hidden", "false");
    forceTop();
  };

  const revealInlineHome = ({ animate = false, debugReturnToSplash = false, preserveScroll = false } = {}) => {
    if (!debugReturnToSplash) {
      uiListeners.abort();
      body.classList.remove("is-splash-timing-editing");
      timingPanel?.setAttribute("aria-hidden", "true");
    }
    if (!preserveScroll) {
      forceTop();
    }

    if (!animate || !splashShell) {
      finishInlineHomeReveal({ keepSplashRuntime: debugReturnToSplash, preserveScroll });
      if (debugReturnToSplash) {
        window.setTimeout(restoreSplashForDebug, 1000);
      }
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
      finishInlineHomeReveal({ keepSplashRuntime: debugReturnToSplash, preserveScroll });
      if (debugReturnToSplash) {
        window.setTimeout(restoreSplashForDebug, 1000);
      }
    };

    const handleTransitionEnd = (event) => {
      if (event.target === splashShell && event.propertyName === "opacity") {
        finish();
      }
    };

    splashShell.addEventListener("transitionend", handleTransitionEnd);
    const fallbackTimer = window.setTimeout(finish, timingSettings.fadeDuration + 120);
    window.setTimeout(() => {
      if (!debugReturnToSplash && body.classList.contains("has-entered-splash")) {
        document.documentElement.classList.remove("has-active-splash-root");
        document.documentElement.classList.add("has-unlocked-splash-root");
      }
    }, timingSettings.fadeDuration + 160);

    window.requestAnimationFrame(() => {
      if (!preserveScroll) {
        forceTop();
      }
      body.classList.add("has-entering-splash");
    });
  };

  const enter = () => {
    if (hasEntered) {
      return;
    }

    hasEntered = true;
    if (isInlineHome) {
      const debugReturnToSplash = body.classList.contains("is-splash-timing-editing");
      splashRipple?.start();
      unlockInlineHomeScroll();
      body.classList.add("is-splash-clicking");
      window.setTimeout(() => {
        revealInlineHome({ animate: true, debugReturnToSplash, preserveScroll: true });
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

  const homepageSettings = await fetchHomepageSettings(body);
  const revealInlineHome = setupSplash(homepageSettings);

  if (shouldSkipSplash(homepageSettings)) {
    revealInlineHome?.();
    body.classList.add("is-ready");
    return;
  }

  warmHomepageAssets(body);
};

bootstrapSplash();
