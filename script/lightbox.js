export const setupLightbox = () => {
  const lightbox = document.querySelector("#lightbox");
  const lightboxImage = lightbox?.querySelector(".lightbox-image");
  const closeButton = lightbox?.querySelector(".lightbox-close");
  const grid = document.querySelector(".album-detail-grid");

  if (!lightbox || !lightboxImage || !closeButton || !grid) {
    return;
  }

  const gesture = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    rotation: 0,
    pinchDistance: 0,
    pinchCenterX: 0,
    pinchCenterY: 0,
    panStartX: 0,
    panStartY: 0,
    panBaseX: 0,
    panBaseY: 0,
  };

  const applyImageTransform = () => {
    lightboxImage.style.transform = `translate(${gesture.translateX}px, ${gesture.translateY}px) scale(${gesture.scale}) rotate(${gesture.rotation}deg)`;
    lightboxImage.style.cursor = gesture.scale > 1 ? "grab" : "";
  };

  const resetImageTransform = () => {
    gesture.scale = 1;
    gesture.translateX = 0;
    gesture.translateY = 0;
    gesture.rotation = 0;
    gesture.pinchDistance = 0;
    gesture.pinchCenterX = 0;
    gesture.pinchCenterY = 0;
    gesture.panStartX = 0;
    gesture.panStartY = 0;
    gesture.panBaseX = 0;
    gesture.panBaseY = 0;
    applyImageTransform();
  };

  const getTouchDistance = (touches) => {
    const [first, second] = touches;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  };

  const getTouchMidpoint = (touches) => {
    const [first, second] = touches;
    return {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
  };

  const close = () => {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImage.setAttribute("src", "");
    lightboxImage.setAttribute("alt", "");
    lightboxImage.classList.remove("is-rotated-mobile");
    document.body.style.overflow = "";
    resetImageTransform();
  };

  const shouldOpenRotatedMobile = (image) => {
    if (!(image instanceof HTMLImageElement) || !document.body.classList.contains("is-mobile-layout")) {
      return false;
    }

    if (image.closest(".editable-photo.mobile-rotate-candidate")) {
      return true;
    }

    if (image.classList.contains("album-hero-image") && image.closest(".album-hero-media.mobile-rotate-hero")) {
      return true;
    }

    return false;
  };

  const openLightbox = (image) => {
    const shouldRotateMobile = shouldOpenRotatedMobile(image);
    lightboxImage.setAttribute("src", image.dataset.fullSrc || image.getAttribute("src") || "");
    lightboxImage.setAttribute("alt", image.getAttribute("alt") || "");
    lightboxImage.classList.toggle("is-rotated-mobile", Boolean(shouldRotateMobile));
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    resetImageTransform();
    if (shouldRotateMobile) {
      gesture.rotation = 90;
      applyImageTransform();
    }
  };

  grid.addEventListener("click", (event) => {
    const image = event.target.closest("img");
    const insideControls = event.target.closest(".photo-controls, .spacer-control");

    if (!image || insideControls) {
      return;
    }

    openLightbox(image);
  });

  document.querySelector(".album-hero-intro")?.addEventListener("click", (event) => {
    const image = event.target.closest(".album-hero-image");
    if (!image) {
      return;
    }

    openLightbox(image);
  });

  closeButton.addEventListener("click", close);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      close();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox.classList.contains("is-open")) {
      close();
    }
  });

  lightboxImage.addEventListener(
    "touchstart",
    (event) => {
      if (!lightbox.classList.contains("is-open")) {
        return;
      }

      if (event.touches.length === 2) {
        event.preventDefault();
        gesture.pinchDistance = getTouchDistance(event.touches);
        const midpoint = getTouchMidpoint(event.touches);
        gesture.pinchCenterX = midpoint.x;
        gesture.pinchCenterY = midpoint.y;
      } else if (event.touches.length === 1 && gesture.scale > 1) {
        gesture.panStartX = event.touches[0].clientX;
        gesture.panStartY = event.touches[0].clientY;
        gesture.panBaseX = gesture.translateX;
        gesture.panBaseY = gesture.translateY;
      }
    },
    { passive: false }
  );

  lightboxImage.addEventListener(
    "touchmove",
    (event) => {
      if (!lightbox.classList.contains("is-open")) {
        return;
      }

      if (event.touches.length === 2) {
        event.preventDefault();
        const distance = getTouchDistance(event.touches);
        const midpoint = getTouchMidpoint(event.touches);
        if (!gesture.pinchDistance) {
          gesture.pinchDistance = distance;
          gesture.pinchCenterX = midpoint.x;
          gesture.pinchCenterY = midpoint.y;
        }

        const previousScale = gesture.scale;
        const nextScale = Math.min(4, Math.max(1, previousScale * (distance / gesture.pinchDistance)));
        const rect = lightboxImage.getBoundingClientRect();
        const rectCenterX = rect.left + rect.width / 2;
        const rectCenterY = rect.top + rect.height / 2;
        const midpointDeltaX = midpoint.x - gesture.pinchCenterX;
        const midpointDeltaY = midpoint.y - gesture.pinchCenterY;

        gesture.translateX += midpointDeltaX;
        gesture.translateY += midpointDeltaY;

        if (previousScale > 0 && nextScale !== previousScale) {
          const offsetX = midpoint.x - rectCenterX - gesture.translateX;
          const offsetY = midpoint.y - rectCenterY - gesture.translateY;
          const scaleRatio = nextScale / previousScale;
          gesture.translateX += (1 - scaleRatio) * offsetX;
          gesture.translateY += (1 - scaleRatio) * offsetY;
        }

        gesture.scale = nextScale;
        gesture.pinchDistance = distance;
        gesture.pinchCenterX = midpoint.x;
        gesture.pinchCenterY = midpoint.y;

        if (gesture.scale <= 1) {
          gesture.translateX = 0;
          gesture.translateY = 0;
        }
        applyImageTransform();
      } else if (event.touches.length === 1 && gesture.scale > 1) {
        event.preventDefault();
        const touch = event.touches[0];
        gesture.translateX = gesture.panBaseX + (touch.clientX - gesture.panStartX);
        gesture.translateY = gesture.panBaseY + (touch.clientY - gesture.panStartY);
        applyImageTransform();
      }
    },
    { passive: false }
  );

  lightboxImage.addEventListener("touchend", (event) => {
    if (gesture.scale <= 1) {
      resetImageTransform();
      return;
    }

    if (event.touches.length === 1) {
      gesture.pinchDistance = 0;
      gesture.pinchCenterX = 0;
      gesture.pinchCenterY = 0;
      gesture.panStartX = event.touches[0].clientX;
      gesture.panStartY = event.touches[0].clientY;
      gesture.panBaseX = gesture.translateX;
      gesture.panBaseY = gesture.translateY;
      return;
    }

    if (event.touches.length === 2) {
      gesture.pinchDistance = getTouchDistance(event.touches);
      const midpoint = getTouchMidpoint(event.touches);
      gesture.pinchCenterX = midpoint.x;
      gesture.pinchCenterY = midpoint.y;
      return;
    }

    gesture.pinchDistance = 0;
    gesture.pinchCenterX = 0;
    gesture.pinchCenterY = 0;
  });

  lightboxImage.addEventListener("touchcancel", () => {
    if (gesture.scale <= 1) {
      resetImageTransform();
      return;
    }

    gesture.pinchDistance = 0;
    gesture.pinchCenterX = 0;
    gesture.pinchCenterY = 0;
  });
};
