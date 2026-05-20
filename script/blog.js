const BLOG_SETTINGS_PATH = "data/blog.settings.json";

const normalizeSettingsPath = (value) => {
  if (typeof value !== "string") {
    return BLOG_SETTINGS_PATH;
  }
  const normalized = value.replace(/^\/+/, "").trim();
  return normalized === BLOG_SETTINGS_PATH ? normalized : BLOG_SETTINGS_PATH;
};

const normalizePost = (post, index = 0) => {
  const slug = typeof post?.slug === "string" && post.slug.trim() ? post.slug.trim() : `post-${index + 1}`;
  return {
    id: typeof post?.id === "string" && post.id.trim() ? post.id.trim() : slug,
    slug,
    title: typeof post?.title === "string" ? post.title : "Untitled post",
    date: typeof post?.date === "string" ? post.date : "",
    image: typeof post?.image === "string" ? post.image : "",
    imageEnabled: post?.imageEnabled === true,
    excerpt: typeof post?.excerpt === "string" ? post.excerpt : "",
    body: typeof post?.body === "string" ? post.body : "",
  };
};

const normalizeBlogState = (state = {}) => ({
  title: typeof state.title === "string" ? state.title : "Blog",
  intro: typeof state.intro === "string" ? state.intro : "",
  posts: Array.isArray(state.posts) ? state.posts.map(normalizePost) : [],
});

const serializeBlogState = (state) => normalizeBlogState(state);

const getPostUrl = (post) => `/blog/${post.slug}.html`;

const sortPosts = (posts) =>
  [...posts].sort((first, second) => {
    const firstTime = Date.parse(first.date);
    const secondTime = Date.parse(second.date);
    if (Number.isNaN(firstTime) && Number.isNaN(secondTime)) {
      return first.title.localeCompare(second.title);
    }
    if (Number.isNaN(firstTime)) {
      return 1;
    }
    if (Number.isNaN(secondTime)) {
      return -1;
    }
    return secondTime - firstTime;
  });

const readLocalDraft = (storageKey) => {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
};

const fetchJson = async (url) => {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  }
};

const setText = (element, value) => {
  if (element) {
    element.textContent = value || "";
  }
};

const createField = ({ label, value, multiline = false, onInput }) => {
  const field = document.createElement("label");
  field.className = "blog-edit-field";
  const labelText = document.createElement("span");
  labelText.textContent = label;
  const input = multiline ? document.createElement("textarea") : document.createElement("input");
  input.value = value || "";
  if (multiline) {
    input.rows = 7;
  }
  input.addEventListener("input", (event) => onInput(event.currentTarget.value));
  field.append(labelText, input);
  return field;
};

const createToggle = ({ label, checked, onInput }) => {
  const field = document.createElement("label");
  field.className = "blog-edit-field blog-edit-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", (event) => onInput(event.currentTarget.checked));
  const labelText = document.createElement("span");
  labelText.textContent = label;
  field.append(input, labelText);
  return field;
};

const downloadJson = (state) => {
  const blob = new Blob([`${JSON.stringify(serializeBlogState(state), null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "blog.settings.json";
  link.click();
  URL.revokeObjectURL(url);
};

const applyGlobalSiteSettings = async (body) => {
  let settings = null;
  let draftSettings = null;

  try {
    const response = await fetch("/data/homepage.settings.json", { cache: "no-store" });
    if (response.ok) {
      settings = await response.json();
    }
  } catch {
    settings = null;
  }

  try {
    draftSettings = JSON.parse(window.localStorage.getItem("homepage-editor:/") || "null");
  } catch {
    draftSettings = null;
  }

  const activeSettings = draftSettings || settings || {};
  const useDarkMode = activeSettings.darkMode === true;
  const backgroundNoiseEnabled = activeSettings.backgroundNoiseEnabled === true;
  const backgroundNoiseOpacity = Math.max(0, Math.min(0.35, Number(activeSettings.backgroundNoiseOpacity) || 0));
  const backgroundNoiseScale = Math.max(48, Math.min(360, Number(activeSettings.backgroundNoiseScale) || 140));
  const backgroundNoiseContrast = Math.max(0.25, Math.min(3, Number(activeSettings.backgroundNoiseContrast) || 1));
  document.documentElement.classList.toggle("is-site-dark-root", useDarkMode);
  body.classList.toggle("is-site-dark", useDarkMode);
  body.style.setProperty("--background-noise-opacity", backgroundNoiseOpacity.toFixed(3));
  body.style.setProperty("--background-noise-size", `${Math.round(backgroundNoiseScale)}px`);
  body.style.setProperty("--background-noise-contrast", backgroundNoiseContrast.toFixed(2));
  body.classList.toggle("has-background-noise", backgroundNoiseEnabled && backgroundNoiseOpacity > 0);
};

const setupBlog = async () => {
  const body = document.body;
  if (!body.classList.contains("blog-page")) {
    return;
  }

  await applyGlobalSiteSettings(body);

  const settingsPath = normalizeSettingsPath(body.dataset.blogSettings);
  const storageKey = `blog-editor:${settingsPath}`;
  const savedDraft = readLocalDraft(storageKey);
  const fetchedState = normalizeBlogState(await fetchJson(`/${settingsPath}`));
  let state = normalizeBlogState(savedDraft?.meta?.dirty === true ? savedDraft : fetchedState);
  let saveState = {
    pending: false,
    message: "",
  };

  const postSlug = body.dataset.blogPost || "";
  const isPostPage = body.classList.contains("blog-post-page");
  const editorActions = Array.from(document.querySelectorAll("[data-blog-action]"));

  const saveDraft = () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...serializeBlogState(state),
        meta: {
          dirty: true,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  };

  const getCurrentPost = () => state.posts.find((post) => post.slug === postSlug) || state.posts[0] || null;

  const renderEditorActions = () => {
    editorActions.forEach((button) => {
      const action = button.dataset.blogAction;
      if (action === "edit") {
        button.textContent = state.editing ? "Done" : "Edit";
      }
      if (action === "preview") {
        button.textContent = state.previewing ? "Editing" : "Preview";
        button.setAttribute("aria-pressed", state.previewing ? "true" : "false");
      }
      if (action === "save") {
        button.textContent = saveState.pending ? "Saving..." : saveState.message || "Save";
        button.disabled = saveState.pending;
      }
    });
  };

  const renderIndex = () => {
    const title = document.querySelector(".blog-title");
    const intro = document.querySelector(".blog-intro");
    const list = document.querySelector(".blog-post-list");
    if (!title || !intro || !list) {
      return;
    }

    setText(title, state.title);
    setText(intro, state.intro);
    list.replaceChildren();

    sortPosts(state.posts).forEach((post, index) => {
      const article = document.createElement("article");
      article.className = "blog-card reveal-up";
      article.dataset.blogPostId = post.id;

      const number = document.createElement("span");
      number.className = "album-number";
      number.textContent = String(index + 1).padStart(2, "0");

      const link = document.createElement("a");
      link.className = "blog-card-link";
      link.href = getPostUrl(post);

      const copy = document.createElement("div");
      copy.className = "blog-card-copy";

      const heading = document.createElement("h2");
      heading.className = "blog-card-title";
      heading.textContent = post.title;

      const date = document.createElement("time");
      date.className = "blog-card-date";
      date.dateTime = post.date;
      date.textContent = post.date;

      const excerpt = document.createElement("p");
      excerpt.className = "blog-card-excerpt";
      excerpt.textContent = post.excerpt;

      copy.append(heading, date, excerpt);
      link.append(copy);
      article.append(number, link);

      if (post.imageEnabled && post.image) {
        const image = document.createElement("img");
        image.className = "blog-card-image";
        image.src = post.image;
        image.alt = "";
        article.append(image);
      }

      if (state.editing && !state.previewing) {
        const panel = document.createElement("div");
        panel.className = "blog-edit-panel";
        panel.append(
          createField({
            label: "Title",
            value: post.title,
            onInput: (value) => {
              post.title = value;
              saveDraft();
            },
          }),
          createField({
            label: "Date",
            value: post.date,
            onInput: (value) => {
              post.date = value;
              saveDraft();
            },
          }),
          createField({
            label: "Excerpt",
            value: post.excerpt,
            multiline: true,
            onInput: (value) => {
              post.excerpt = value;
              saveDraft();
            },
          }),
          createField({
            label: "Image URL",
            value: post.image,
            onInput: (value) => {
              post.image = value;
              saveDraft();
            },
          }),
          createToggle({
            label: "Show image",
            checked: post.imageEnabled,
            onInput: (value) => {
              post.imageEnabled = value;
              saveDraft();
              render();
            },
          })
        );
        article.append(panel);
      }

      list.append(article);
    });

    if (state.editing && !state.previewing) {
      const panel = document.createElement("div");
      panel.className = "blog-edit-panel blog-page-edit-panel";
      panel.append(
        createField({
          label: "Blog title",
          value: state.title,
          onInput: (value) => {
            state.title = value;
            saveDraft();
          },
        }),
        createField({
          label: "Intro",
          value: state.intro,
          multiline: true,
          onInput: (value) => {
            state.intro = value;
            saveDraft();
          },
        })
      );
      list.prepend(panel);
    }
  };

  const renderPost = () => {
    const post = getCurrentPost();
    const title = document.querySelector(".blog-post-title");
    const date = document.querySelector(".blog-post-date");
    const excerpt = document.querySelector(".blog-post-excerpt");
    const media = document.querySelector(".blog-post-media");
    const image = document.querySelector(".blog-post-image");
    const bodyElement = document.querySelector(".blog-post-body");

    if (!post || !title || !date || !excerpt || !media || !image || !bodyElement) {
      return;
    }

    document.title = `${post.title} - Konrad Parada Photos`;
    setText(title, post.title);
    setText(date, post.date);
    date.setAttribute("datetime", post.date);
    setText(excerpt, post.excerpt);
    media.hidden = !(post.imageEnabled && post.image);
    image.src = post.image || "";
    bodyElement.replaceChildren(
      ...post.body.split(/\n{2,}/).map((paragraph) => {
        const element = document.createElement("p");
        element.textContent = paragraph.trim();
        return element;
      })
    );

    const previousPanel = document.querySelector(".blog-post-edit-panel");
    previousPanel?.remove();
    if (state.editing && !state.previewing) {
      const panel = document.createElement("div");
      panel.className = "blog-edit-panel blog-post-edit-panel";
      panel.append(
        createField({
          label: "Title",
          value: post.title,
          onInput: (value) => {
            post.title = value;
            saveDraft();
          },
        }),
        createField({
          label: "Date",
          value: post.date,
          onInput: (value) => {
            post.date = value;
            saveDraft();
          },
        }),
        createField({
          label: "Excerpt",
          value: post.excerpt,
          multiline: true,
          onInput: (value) => {
            post.excerpt = value;
            saveDraft();
          },
        }),
        createField({
          label: "Image URL",
          value: post.image,
          onInput: (value) => {
            post.image = value;
            saveDraft();
          },
        }),
        createToggle({
          label: "Show image",
          checked: post.imageEnabled,
          onInput: (value) => {
            post.imageEnabled = value;
            saveDraft();
            render();
          },
        }),
        createField({
          label: "Body",
          value: post.body,
          multiline: true,
          onInput: (value) => {
            post.body = value;
            saveDraft();
          },
        })
      );
      bodyElement.after(panel);
    }
  };

  const render = () => {
    body.classList.toggle("is-blog-editing", state.editing === true);
    body.classList.toggle("is-previewing", state.previewing === true);
    if (isPostPage) {
      renderPost();
    } else {
      renderIndex();
    }
    renderEditorActions();
  };

  const saveToGitHub = async () => {
    if (saveState.pending) {
      return;
    }

    saveState = {
      pending: true,
      message: "",
    };
    render();

    try {
      const payload = serializeBlogState(state);
      const response = await fetch("/api/save-blog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: "blog",
          settingsPath,
          settings: payload,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Save failed");
      }
      state = {
        ...normalizeBlogState(result.blogSettings || payload),
        editing: state.editing,
        previewing: state.previewing,
      };
      window.localStorage.removeItem(storageKey);
      saveState = {
        pending: false,
        message: "Saved",
      };
    } catch (error) {
      saveState = {
        pending: false,
        message: error instanceof Error ? error.message : "Save failed",
      };
    }
    render();
  };

  editorActions.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.blogAction;
      if (action === "edit") {
        state.editing = !state.editing;
        state.previewing = false;
        render();
      }
      if (action === "preview") {
        state.previewing = !state.previewing;
        render();
      }
      if (action === "save") {
        saveToGitHub();
      }
      if (action === "export") {
        downloadJson(state);
      }
    });
  });

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "e") {
      event.preventDefault();
      state.editing = !state.editing;
      state.previewing = false;
      render();
    }
  });

  state = {
    ...state,
    editing: false,
    previewing: false,
  };
  render();
  body.classList.add("is-ready");
};

setupBlog();
