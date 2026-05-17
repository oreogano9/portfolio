const setupSplash = () => {
  const body = document.body;
  if (!body.classList.contains("splash-page")) {
    return;
  }

  const target = body.dataset.splashTarget || "/index.html";
  const enterLink = document.querySelector("[data-splash-enter]");
  const splashSessionKey = "homepage-splash-seen";

  let hasEntered = false;
  let touchStartY = 0;

  const enter = () => {
    if (hasEntered) {
      return;
    }

    hasEntered = true;
    window.sessionStorage.setItem(splashSessionKey, "true");
    body.classList.add("is-leaving");
    window.setTimeout(() => {
      window.location.href = target;
    }, 220);
  };

  const maybeEnterFromWheel = (event) => {
    if (Math.abs(event.deltaY) < 8) {
      return;
    }

    event.preventDefault();
    enter();
  };

  const handleTouchStart = (event) => {
    touchStartY = event.touches[0]?.clientY || 0;
  };

  const handleTouchMove = (event) => {
    const currentY = event.touches[0]?.clientY || 0;
    if (touchStartY - currentY > 18) {
      enter();
    }
  };

  enterLink?.addEventListener("click", (event) => {
    event.preventDefault();
    enter();
  });

  window.addEventListener("wheel", maybeEnterFromWheel, { passive: false });
  window.addEventListener("touchstart", handleTouchStart, { passive: true });
  window.addEventListener("touchmove", handleTouchMove, { passive: true });

  body.classList.add("is-ready");
};

setupSplash();
