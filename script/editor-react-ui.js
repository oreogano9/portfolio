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

const createIconButton = ({ className, text, ariaLabel, disabled = false, onClick }) => {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = text;
  button.setAttribute("aria-label", ariaLabel);
  button.disabled = disabled;
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

const createSelectField = ({ label, ariaLabel, value, options, onChange, compact = true }) => {
  const field = document.createElement("label");
  field.className = compact ? "home-edit-field home-edit-field-compact" : "home-edit-field";

  const labelText = document.createElement("span");
  labelText.textContent = label;

  const select = createSelect({
    className: "home-edit-select",
    ariaLabel,
    value,
    options,
    onChange,
  });

  field.append(labelText, select);
  return field;
};

const createAlbumStepper = ({ label, value, min, max, step, onChange, unit = "" }) => {
  const field = document.createElement("div");
  field.className = "header-edit-stepper";

  const labelText = document.createElement("span");
  labelText.className = "header-edit-stepper-label";
  labelText.textContent = label;

  const controls = document.createElement("div");
  controls.className = "header-edit-stepper-controls";

  const decrement = createIconButton({
    className: "header-edit-stepper-button",
    text: "−",
    ariaLabel: `Decrease ${label}`,
    onClick: () => onChange(Math.max(min, Number((value - step).toFixed(2)))),
  });

  const valueText = document.createElement("span");
  valueText.className = "header-edit-stepper-value";
  valueText.textContent = `${value >= 0 ? "+" : ""}${value.toFixed(1)}${unit}`;

  const increment = createIconButton({
    className: "header-edit-stepper-button",
    text: "+",
    ariaLabel: `Increase ${label}`,
    onClick: () => onChange(Math.min(max, Number((value + step).toFixed(2)))),
  });

  controls.append(decrement, valueText, increment);
  field.append(labelText, controls);
  return field;
};

const createSwitchField = ({ label, checked, onChange }) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `header-edit-switch${checked ? " is-active" : ""}`;
  button.setAttribute("aria-pressed", checked ? "true" : "false");
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => onChange(!checked));

  const text = document.createElement("span");
  text.className = "header-edit-switch-label";
  text.textContent = label;

  const track = document.createElement("span");
  track.className = "header-edit-switch-track";
  const thumb = document.createElement("span");
  thumb.className = "header-edit-switch-thumb";
  track.appendChild(thumb);

  button.append(text, track);
  return button;
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
      createSelectField({
        label: "Body Text",
        ariaLabel: "Body text font family",
        value: quoteState.fontFamily,
        options: [
          { value: "inter", label: "Inter" },
          { value: "saint", label: "Saint" },
          { value: "young-serif", label: "Young Serif" },
          { value: "clash", label: "Clash Display" },
          { value: "neue-haas", label: "Neue Haas" },
          { value: "manrope", label: "Manrope" },
          { value: "space-grotesk", label: "Space Grotesk" },
          { value: "plus-jakarta-sans", label: "Plus Jakarta Sans" },
          { value: "sora", label: "Sora" },
          { value: "instrument-serif", label: "Instrument Serif" },
          { value: "cormorant-garamond", label: "Cormorant Garamond" },
          { value: "fraunces", label: "Fraunces" },
          { value: "newsreader", label: "Newsreader" },
          { value: "libre-baskerville", label: "Libre Baskerville" },
          { value: "syne", label: "Syne" },
        ],
        onChange: actions.setFontFamily,
      }),
      createSelectField({
        label: "Titles And Quotes",
        ariaLabel: "Titles and quotes font family",
        value: quoteState.displayFontFamily,
        options: [
          { value: "inter", label: "Inter" },
          { value: "saint", label: "Saint" },
          { value: "young-serif", label: "Young Serif" },
          { value: "clash", label: "Clash Display" },
          { value: "neue-haas", label: "Neue Haas" },
          { value: "manrope", label: "Manrope" },
          { value: "space-grotesk", label: "Space Grotesk" },
          { value: "plus-jakarta-sans", label: "Plus Jakarta Sans" },
          { value: "sora", label: "Sora" },
          { value: "instrument-serif", label: "Instrument Serif" },
          { value: "cormorant-garamond", label: "Cormorant Garamond" },
          { value: "fraunces", label: "Fraunces" },
          { value: "newsreader", label: "Newsreader" },
          { value: "libre-baskerville", label: "Libre Baskerville" },
          { value: "syne", label: "Syne" },
        ],
        onChange: actions.setDisplayFontFamily,
      }),
      createSelectField({
        label: "Navigation, Labels, Buttons",
        ariaLabel: "Navigation, labels, and buttons font family",
        value: quoteState.uiFontFamily,
        options: [
          { value: "inter", label: "Inter" },
          { value: "saint", label: "Saint" },
          { value: "young-serif", label: "Young Serif" },
          { value: "clash", label: "Clash Display" },
          { value: "neue-haas", label: "Neue Haas" },
          { value: "manrope", label: "Manrope" },
          { value: "space-grotesk", label: "Space Grotesk" },
          { value: "plus-jakarta-sans", label: "Plus Jakarta Sans" },
          { value: "sora", label: "Sora" },
          { value: "instrument-serif", label: "Instrument Serif" },
          { value: "cormorant-garamond", label: "Cormorant Garamond" },
          { value: "fraunces", label: "Fraunces" },
          { value: "newsreader", label: "Newsreader" },
          { value: "libre-baskerville", label: "Libre Baskerville" },
          { value: "syne", label: "Syne" },
        ],
        onChange: actions.setUiFontFamily,
      }),
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
    const defaultTitleScale = 0.6;
    const defaultTopSpacer = 7;
    const titleScaleDelta = Number((titleScale - defaultTitleScale).toFixed(1));
    const topSpacerDelta = Number((topSpacer - defaultTopSpacer).toFixed(1));
    const numericRow = document.createElement("div");
    numericRow.className = "header-edit-row header-edit-row-numeric";
    const selectRow = document.createElement("div");
    selectRow.className = "header-edit-row header-edit-row-select";
    const toggleRow = document.createElement("div");
    toggleRow.className = "header-edit-row header-edit-row-toggle";

    numericRow.append(
      createAlbumStepper({
        label: "Title",
        value: titleScaleDelta,
        min: 0,
        max: 1.2,
        step: 0.1,
        onChange: (delta) => onTitleScaleChange((defaultTitleScale + delta).toFixed(2)),
      }),
      createAlbumStepper({
        label: "Top",
        value: topSpacerDelta,
        min: -7,
        max: 33,
        step: 0.1,
        onChange: (delta) => onTopSpacerChange((defaultTopSpacer + delta).toFixed(2)),
        unit: "rem",
      })
    );

    selectRow.append(
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
      })
    );

    toggleRow.append(
      createSwitchField({
        label: "Hero",
        checked: introMode === "hero",
        onChange: (checked) => onIntroModeChange(checked ? "hero" : "default"),
      }),
      createSwitchField({
        label: "Arrow",
        checked: showArrow,
        onChange: (checked) => onShowArrowChange(String(checked)),
      }),
      createSwitchField({
        label: "Rotate",
        checked: mobileRotateClockwise,
        onChange: (checked) => onMobileRotateChange(String(checked)),
      }),
      createSwitchField({
        label: "Deleted",
        checked: showDeleted,
        onChange: onToggleDeleted,
      })
    );

    container.append(numericRow, selectRow, toggleRow);
  },
  destroy() {
    clearElement(container);
  },
});
