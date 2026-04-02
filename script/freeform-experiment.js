const isMobileLayout = () => window.matchMedia("(max-width: 760px), (hover: none), (pointer: coarse)").matches;

const getPosition = (item, isMobile) => {
  const position = isMobile ? item.mobile || item.desktop : item.desktop || item.mobile;
  return position || { x: 0, y: 0, scale: 40, z: 1 };
};

const buildFreeformCard = (item, mobile) => {
  const position = getPosition(item, mobile);
  const anchor = document.createElement("a");
  anchor.className = "freeform-experiment-item";
  anchor.href = item.href;
  anchor.style.setProperty("--freeform-x", `${position.x}%`);
  anchor.style.setProperty("--freeform-y", `${position.y}%`);
  anchor.style.setProperty("--freeform-scale", `${position.scale}%`);
  anchor.style.setProperty("--freeform-z", String(position.z || 1));

  const image = document.createElement("img");
  image.className = "freeform-experiment-image";
  image.src = item.imageSrc;
  image.alt = item.title;
  image.loading = "eager";
  image.decoding = "async";

  const label = document.createElement("span");
  label.className = "freeform-experiment-label";
  label.textContent = item.title;

  anchor.append(image, label);
  return anchor;
};

const renderFreeformExperiment = (container, data) => {
  const mobile = isMobileLayout();
  const height = mobile ? Number(data.mobileHeightVh) || 180 : Number(data.desktopHeightVh) || 140;
  container.innerHTML = "";
  container.style.setProperty("--freeform-stage-height", `${height}vh`);
  data.items.forEach((item) => container.appendChild(buildFreeformCard(item, mobile)));
};

export const setupFreeformExperimentPage = async () => {
  const body = document.body;
  if (!body?.classList.contains("freeform-experiment-page")) {
    return;
  }

  const settingsUrl = body.dataset.freeformSettings;
  const stage = document.querySelector(".freeform-experiment-stage");
  if (!settingsUrl || !stage) {
    return;
  }

  try {
    const response = await fetch(settingsUrl, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const render = () => renderFreeformExperiment(stage, data);
    render();
    window.addEventListener("resize", render, { passive: true });
  } finally {
    body.classList.add("is-ready");
  }
};
