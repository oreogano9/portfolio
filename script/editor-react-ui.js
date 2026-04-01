const clearElement = (element) => {
  if (element instanceof HTMLElement) {
    element.replaceChildren();
  }
};

const createNumberField = ({ label, min, max, step, value, onChange, compact = false }) => {
  const field = document.createElement("label");
  field.className = compact ? "home-edit-field home-edit-field-compact" : "home-edit-field";

  const labelText = document.createElement("span");
  labelText.textContent = label;

  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("change", (event) => {
    onChange(event.currentTarget.value);
  });
  input.addEventListener("input", (event) => {
    onChange(event.currentTarget.value);
  });

  field.append(labelText, input);
  return field;
};

const createButton = ({ className, text, type = "button", disabled = false, pressed, onClick }) => {
  const button = document.createElement("button");
  button.className = className;
  button.type = type;
  button.textContent = text;
  button.disabled = disabled;
  if (typeof pressed === "boolean") {
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
  }
  button.addEventListener("click", onClick);
  return button;
};

const createSelect = ({ className, ariaLabel, value, options, onChange }) => {
  const select = document.createElement("select");
  select.className = className;
  select.setAttribute("aria-label", ariaLabel);

  options.forEach(({ value: optionValue, label }) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.appendChild(option);
  });

  select.value = String(value);
  select.addEventListener("change", (event) => {
    onChange(event.currentTarget.value);
  });
  return select;
};

export const mountHomeReactEditorUi = ({ toolbarContainer, quoteContainer, cardsContainer }) => ({
  render({ editing, saveState, quoteState, actions }) {
    clearElement(toolbarContainer);
    clearElement(quoteContainer);
    clearElement(cardsContainer);

    toolbarContainer.append(
      createButton({
        className: "preview-toggle",
        text: editing ? "Done" : "Edit",
        onClick: actions.toggleEdit,
      }),
      createButton({
        className: "preview-toggle",
        text: saveState.pending ? "Saving..." : saveState.message || "Save",
        disabled: saveState.pending,
        onClick: actions.saveToGitHub,
      })
    );

    quoteContainer.append(
      createNumberField({
        label: "Quote Size",
        min: 0.5,
        max: 1.6,
        step: 0.05,
        value: quoteState.mastheadScale,
        onChange: actions.setMastheadScale,
        compact: true,
      }),
      createNumberField({
        label: "Top Space",
        min: 0,
        max: 20,
        step: 0.25,
        value: quoteState.mastheadTopSpace,
        onChange: actions.setMastheadTopSpace,
        compact: true,
      }),
      createNumberField({
        label: "Under Attribution",
        min: 0,
        max: 12,
        step: 0.25,
        value: quoteState.quoteBottomSpace,
        onChange: actions.setQuoteBottomSpace,
        compact: true,
      })
    );
  },
  destroy() {
    clearElement(toolbarContainer);
    clearElement(quoteContainer);
    clearElement(cardsContainer);
  },
});

export const mountAlbumReactHeaderUi = ({ container }) => ({
  render({
    titleScale,
    topSpacer,
    spacing,
    effect,
    introMode,
    showArrow,
    mobileRotateClockwise,
    showDeleted,
    onTitleScaleChange,
    onTopSpacerChange,
    onSpacingChange,
    onEffectChange,
    onIntroModeChange,
    onShowArrowChange,
    onMobileRotateChange,
    onToggleDeleted,
  }) {
    clearElement(container);

    const titleInput = document.createElement("input");
    titleInput.className = "header-edit-input header-edit-number";
    titleInput.type = "number";
    titleInput.min = "0.6";
    titleInput.max = "1.8";
    titleInput.step = "0.05";
    titleInput.placeholder = "Title Size";
    titleInput.setAttribute("aria-label", "Album title size multiplier");
    titleInput.value = String(titleScale);
    titleInput.addEventListener("input", (event) => onTitleScaleChange(event.currentTarget.value));
    titleInput.addEventListener("change", (event) => onTitleScaleChange(event.currentTarget.value));

    const topSpacerInput = document.createElement("input");
    topSpacerInput.className = "header-edit-input header-edit-number";
    topSpacerInput.type = "number";
    topSpacerInput.min = "0";
    topSpacerInput.max = "40";
    topSpacerInput.step = "0.25";
    topSpacerInput.placeholder = "Top Space (rem)";
    topSpacerInput.setAttribute("aria-label", "Top spacer height in rem");
    topSpacerInput.value = String(topSpacer);
    topSpacerInput.addEventListener("input", (event) => onTopSpacerChange(event.currentTarget.value));
    topSpacerInput.addEventListener("change", (event) => onTopSpacerChange(event.currentTarget.value));

    container.append(
      titleInput,
      topSpacerInput,
      createSelect({
        className: "header-edit-select",
        ariaLabel: "Space between photos",
        value: spacing,
        options: [
          { value: "tight", label: "Tight spacing" },
          { value: "default", label: "Default spacing" },
          { value: "airy", label: "Airy spacing" },
        ],
        onChange: onSpacingChange,
      }),
      createSelect({
        className: "header-edit-select",
        ariaLabel: "Album effect",
        value: effect,
        options: [
          { value: "none", label: "No Effect" },
          { value: "focus", label: "Focus" },
          { value: "monochrome", label: "Monochrome" },
          { value: "lift", label: "Lift" },
          { value: "blur", label: "Blur" },
          { value: "glow", label: "Glow" },
          { value: "tilt", label: "Tilt" },
        ],
        onChange: onEffectChange,
      }),
      createSelect({
        className: "header-edit-select",
        ariaLabel: "Album intro mode",
        value: introMode,
        options: [
          { value: "default", label: "Default Intro" },
          { value: "hero", label: "Hero Intro" },
        ],
        onChange: onIntroModeChange,
      }),
      createSelect({
        className: "header-edit-select",
        ariaLabel: "Show hero arrow",
        value: showArrow ? "true" : "false",
        options: [
          { value: "true", label: "Arrow On" },
          { value: "false", label: "Arrow Off" },
        ],
        onChange: onShowArrowChange,
      }),
      createSelect({
        className: "header-edit-select",
        ariaLabel: "Experimental mobile clockwise rotate",
        value: mobileRotateClockwise ? "true" : "false",
        options: [
          { value: "false", label: "Mobile Rotate Off" },
          { value: "true", label: "Mobile Rotate On" },
        ],
        onChange: onMobileRotateChange,
      }),
      createButton({
        className: `header-edit-toggle${showDeleted ? " is-active" : ""}`,
        text: showDeleted ? "Hide Deleted" : "Show Deleted",
        pressed: showDeleted,
        onClick: onToggleDeleted,
      })
    );
  },
  destroy() {
    clearElement(container);
  },
});
