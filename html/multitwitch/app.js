(() => {
  "use strict";

  /* ========================================================================
     Constants
     ======================================================================== */

  const $ = (selector) => document.querySelector(selector);

  const STORAGE_KEYS = {
    config: "mts-cfg",
    streams: "mts",
    selection: "mts-sel",
  };

  const LEGACY_SHEET_KEY = "mts-sheet";
  const SELECTION_COOKIE = "mts-sel";
  const USERNAME_PATTERN = /^[a-z0-9_]{3,25}$/;
  const DRAG_THRESHOLD = 8;
  const IDLE_DELAY = 5000;
  const TWITCH_GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
  const CHAT_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
  const CHAT_HISTORY_LIMIT = 150;

  const LAYOUTS = [
    ["auto", "Auto", "layout-dashboard"],
    ["grid", "Raster", "layout-grid"],
    ["focus", "Fokus", "layout-bottombar"],
    ["vertical", "Vertikal", "columns"],
    ["horizontal", "Horizontal", "layout-rows"],
  ];

  const QUALITY_OPTIONS = [
    ["source", "Quelle"],
    ["1080p", "1080p"],
    ["720p", "720p"],
    ["480p", "480p"],
    ["360p", "360p"],
  ];

  const OVERLAY_MODES = [
    ["always", "Immer"],
    ["hover", "Bei Hover"],
    ["off", "Aus"],
  ];

  const CHAT_PLACES = [
    ["floating", "Schwebend über dem Video"],
    ["sidebar", "Seitenleiste rechts"],
    ["dock", "Unten angedockt"],
    ["tile", "Auf der Stream-Kachel"],
  ];

  const CHAT_ANCHORS = [
    ["br", "Unten rechts"],
    ["bl", "Unten links"],
    ["tr", "Oben rechts"],
    ["tl", "Oben links"],
  ];

  const CHAT_GROUPS = [
    ["all", "Alle Streams in einem Chat"],
    ["main", "Nur der ausgewählte Stream"],
    ["per", "Jeder Stream hat einen eigenen Chat"],
    ["custom", "Eigene Gruppen (siehe Hinweis)"],
  ];

  const CHAT_STYLES = [
    ["compact", "Kompakt"],
    ["bubble", "Sprechblasen"],
    ["irc", "IRC / Monospace"],
  ];

  const CHAT_SIZES = [
    ["small", "Klein"],
    ["medium", "Mittel"],
    ["large", "Gross"],
  ];

  const PRESETS = {
    Twitch: { acc: "#9146ff", sel: "#bf94ff", bg: "#0e0e10" },
    Ice: { acc: "#2f9bff", sel: "#8fd0ff", bg: "#0b1016" },
    Ember: { acc: "#ff6a3d", sel: "#ffb08f", bg: "#120d0b" },
    Mono: { acc: "#8a8a93", sel: "#ffffff", bg: "#000000" },
  };

  const DEFAULT_CONFIG = {
    layout: "auto",
    audio: "key",
    quality: "source",
    rotateMain: true,
    ovName: "always",
    ovTitle: "always",
    ovMain: "always",
    ovDelay: "always",
    ovOffline: "always",
    ovAd: "always",
    mainWeight: 2,
    gap: 2,
    selWidth: 2,
    autoHide: false,
    mod: "Shift",
    colors: { ...PRESETS.Twitch },
    keys: {
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
      fs: "Enter",
      audio: "a",
      cycle: "l",
      main: "m",
      mute: "x",
      remove: "Delete",
      bar: "t",
      input: "/",
      settings: ",",
    },
    chatOn: false,
    chatPlace: "floating",
    chatAnchor: "br",
    chatGroup: "all",
    chatCustom: "",
    chatStyle: "compact",
    chatSize: "medium",
    chatEmotes: true,
    chatTimestamps: false,
  };

  const ACTIONS = [
    ["up", "Nach oben / vorheriger"],
    ["down", "Nach unten / nächster"],
    ["left", "Nach links / vorheriger"],
    ["right", "Nach rechts / nächster"],
    ["fs", "Vollbild"],
    ["audio", "Tonmodus wechseln"],
    ["cycle", "Nächstes Layout"],
    ["main", "Als Hauptstream setzen"],
    ["mute", "Alles stummschalten"],
    ["remove", "Stream entfernen"],
    ["bar", "Toolbar ein-/ausblenden"],
    ["input", "Username-Feld fokussieren"],
    ["settings", "Einstellungen öffnen"],
  ];

  const DIRECTIONS = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };

  /* ========================================================================
     DOM references
     ======================================================================== */

  const stage = $("#stage");
  const input = $("#in");
  const toastEl = $("#toast");
  const barEl = $("#bar");
  const dialog = $("#dlg");
  const suggestionBox = $("#sug");
  const emptyEl = $("#empty");
  const layoutBar = $("#layouts");
  const settingsBody = $("#sb");
  const chatsEl = $("#chats");
  const chatPane = $("#chatpane");

  /* ========================================================================
     State
     ======================================================================== */

  let cfg = loadConfig();
  const streams = [];

  let selectedName = null;
  let hoveredName = null;
  let mainName = null;
  let layout = cfg.layout;
  let audioMode = cfg.audio;
  let audioUnlocked = false;
  let globallyMuted = false;
  let rebindingAction = null;
  let dragState = null;
  let suppressHover = false;
  let focusHintShown = false;

  const parentDomain =
    new URLSearchParams(location.search).get("parent") ||
    location.hostname ||
    "localhost";

  /* ========================================================================
     Small helpers
     ======================================================================== */

  const streamByName = (name) => streams.find((stream) => stream.name === name);
  const normalizeKey = (key) => (key.length === 1 ? key.toLowerCase() : key);
  const isDragging = () => Boolean(dragState && dragState.active);

  let toastTimer;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 3500);
  }

  /* ========================================================================
     Configuration and persistence
     ======================================================================== */

  function loadConfig() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.config)) || {};
    } catch (error) {
      // Corrupt or unavailable storage: fall back to the defaults.
    }

    const merged = {
      ...DEFAULT_CONFIG,
      ...saved,
      colors: { ...DEFAULT_CONFIG.colors, ...saved.colors },
      keys: { ...DEFAULT_CONFIG.keys, ...saved.keys },
    };

    // Drop settings that no longer exist. The old overlay switches are
    // migrated to their per-element counterparts, and the former "Frei"
    // layout falls back to Auto.
    [
      "titles",
      "delay",
      "helixId",
      "helixToken",
      "sheetCols",
      "sheetRows",
    ].forEach((key) => delete merged[key]);

    if (saved.titles && !saved.ovTitle) merged.ovTitle = saved.titles;
    if (saved.delay === false && !saved.ovDelay) merged.ovDelay = "off";

    const oneOf = (value, options, fallback) =>
      options.some(([id]) => id === value) ? value : fallback;

    merged.ovName = oneOf(merged.ovName, OVERLAY_MODES, "always");
    merged.ovTitle = oneOf(merged.ovTitle, OVERLAY_MODES, "always");
    merged.ovMain = oneOf(merged.ovMain, OVERLAY_MODES, "always");
    merged.ovDelay = oneOf(merged.ovDelay, OVERLAY_MODES, "always");
    merged.ovOffline = oneOf(merged.ovOffline, OVERLAY_MODES, "always");
    merged.ovAd = oneOf(merged.ovAd, OVERLAY_MODES, "always");
    merged.chatPlace = oneOf(merged.chatPlace, CHAT_PLACES, "floating");
    merged.chatAnchor = oneOf(merged.chatAnchor, CHAT_ANCHORS, "br");
    merged.chatGroup = oneOf(merged.chatGroup, CHAT_GROUPS, "all");
    merged.chatStyle = oneOf(merged.chatStyle, CHAT_STYLES, "compact");
    merged.chatSize = oneOf(merged.chatSize, CHAT_SIZES, "medium");
    merged.chatOn = Boolean(merged.chatOn);
    merged.chatEmotes = merged.chatEmotes !== false;
    merged.chatTimestamps = Boolean(merged.chatTimestamps);

    // The selection outline is a CSS variable. Clamp stale or malformed
    // values so an old localStorage entry cannot collapse the stage.
    const selWidth = Number(merged.selWidth);
    merged.selWidth = Number.isFinite(selWidth)
      ? Math.min(8, Math.max(0, selWidth))
      : DEFAULT_CONFIG.selWidth;

    // Older versions had separate 2/3-column layouts. Fold them into the
    // regular grid so stale localStorage or share links cannot activate a
    // layout that no longer exists.
    if (!LAYOUTS.some(([id]) => id === merged.layout)) {
      merged.layout =
        saved.layout === "two" || saved.layout === "three" ? "grid" : "auto";
    }

    // The freeform layout is gone; purge its saved geometry as well.
    try {
      localStorage.removeItem(LEGACY_SHEET_KEY);
      localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(merged));
    } catch (error) {
      // Storage can be disabled.
    }

    return merged;
  }

  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(cfg));
    } catch (error) {
      // Storage can be disabled; the page still works for this session.
    }
  }

  function saveStreams() {
    try {
      localStorage.setItem(
        STORAGE_KEYS.streams,
        JSON.stringify(streams.map((stream) => stream.name)),
      );
    } catch (error) {
      // Ignore unavailable storage.
    }
  }

  function readSelectionCookie() {
    const match = document.cookie.match(/(?:^|;\s*)mts-sel=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function loadSelectedName() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.selection);
      if (stored) return stored;
    } catch (error) {
      // Fall through to the cookie.
    }
    return readSelectionCookie();
  }

  function saveSelectedName(name) {
    try {
      if (name) {
        localStorage.setItem(STORAGE_KEYS.selection, name);
      } else {
        localStorage.removeItem(STORAGE_KEYS.selection);
      }
    } catch (error) {
      // Ignore unavailable storage.
    }

    try {
      if (name) {
        document.cookie =
          `${SELECTION_COOKIE}=${encodeURIComponent(name)}; ` +
          "path=/; max-age=31536000; SameSite=Lax";
      } else {
        document.cookie = `${SELECTION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
      }
    } catch (error) {
      // Cookies may be disabled; localStorage already has the value.
    }
  }

  function applyConfig() {
    const rootStyle = document.documentElement.style;
    const colors = cfg.colors;

    rootStyle.setProperty("--acc", colors.acc);
    rootStyle.setProperty("--sel", colors.sel);
    rootStyle.setProperty("--app-bg", colors.bg);
    rootStyle.setProperty("--sel-width", `${cfg.selWidth}px`);

    document.body.dataset.ovName = cfg.ovName;
    document.body.dataset.ovTitle = cfg.ovTitle;
    document.body.dataset.ovMain = cfg.ovMain;
    document.body.dataset.ovDelay = cfg.ovDelay;
    document.body.dataset.ovOffline = cfg.ovOffline;
    document.body.dataset.ovAd = cfg.ovAd;
    document.body.dataset.chatPlace = cfg.chatPlace;
    document.body.dataset.chatStyle = cfg.chatStyle;
    document.body.dataset.chatSize = cfg.chatSize;
    document.body.classList.toggle("autohide", cfg.autoHide);
    document.body.dataset.layout = layout;

    placeTiles();
    updateAudio();
  }

  /* ========================================================================
     Layout
     ======================================================================== */

  const isMainLayout = () =>
    ["focus", "vertical", "horizontal"].includes(layout) && streams.length > 1;

  const isRotatingMain = () => isMainLayout() && cfg.rotateMain;

  function bestColumnCount(count, width, height) {
    let bestColumns = 1;
    let bestSize = 0;

    for (let columns = 1; columns <= count; columns += 1) {
      const size = Math.min(
        width / columns,
        (height / Math.ceil(count / columns)) * (16 / 9),
      );
      if (size > bestSize + 1e-6) {
        bestSize = size;
        bestColumns = columns;
      }
    }

    return bestColumns;
  }

  function buildGrid(count, width, height, columns) {
    const rows = Math.ceil(count / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const lastRowCount = count - columns * (rows - 1);

    return Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / columns);
      const inRow = row === rows - 1 ? lastRowCount : columns;
      return {
        x: (width - inRow * cellWidth) / 2 + (index % columns) * cellWidth,
        y: row * cellHeight,
        w: cellWidth,
        h: cellHeight,
      };
    });
  }

  function buildStrips(list, width, height, vertical) {
    const weights = list.map((stream) =>
      stream.name === mainName ? cfg.mainWeight : 1,
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let position = 0;

    return weights.map((weight) => {
      const start = position;
      position += weight;
      return vertical
        ? {
            x: (start / total) * width,
            y: 0,
            w: (weight / total) * width,
            h: height,
          }
        : {
            x: 0,
            y: (start / total) * height,
            w: width,
            h: (weight / total) * height,
          };
    });
  }

  // Focus is a big main player with a readable thumbnail rail underneath.
  // The rail keeps every other stream at a usable click target instead of
  // shrinking them into slivers when many streams are open.
  function buildFocus(list, width, height) {
    if (list.length < 2) return buildGrid(list.length, width, height, 1);

    const railFraction = Math.max(
      0.16,
      Math.min(0.32, 0.14 + cfg.mainWeight * 0.04),
    );
    const railHeight = height * railFraction;
    const mainHeight = height - railHeight;
    const mainIndex = Math.max(
      0,
      list.findIndex((stream) => stream.name === mainName),
    );
    const sideCount = list.length - 1;
    let sideIndex = 0;

    return list.map((stream, index) => {
      if (index === mainIndex) {
        return { x: 0, y: 0, w: width, h: mainHeight };
      }

      const slot = sideIndex;
      sideIndex += 1;
      return {
        x: (slot * width) / sideCount,
        y: mainHeight,
        w: width / sideCount,
        h: railHeight,
      };
    });
  }

  function computeRects(list, width, height) {
    if (layout === "vertical") return buildStrips(list, width, height, true);
    if (layout === "horizontal") return buildStrips(list, width, height, false);
    if (layout === "focus") return buildFocus(list, width, height);

    const columns =
      layout === "grid"
        ? Math.ceil(Math.sqrt(list.length))
        : bestColumnCount(list.length, width, height);
    return buildGrid(list.length, width, height, columns);
  }

  function placeTiles() {
    emptyEl.hidden = streams.length > 0;

    if (!streams.length) {
      updateAudio();
      return;
    }

    const contentHeight = Math.max(0, stage.clientHeight);
    const halfGap = cfg.gap / 2;

    if (
      ["focus", "vertical", "horizontal"].includes(layout) &&
      !streams.some((stream) => stream.name === mainName)
    ) {
      mainName = streams[0].name;
    }
    if (
      layout === "focus" &&
      streams.some((stream) => stream.name === selectedName)
    ) {
      mainName = selectedName;
    }

    const rects = new Map();
    const visibleRects = computeRects(
      streams,
      stage.clientWidth,
      contentHeight,
    );

    streams.forEach((stream, index) => rects.set(stream, visibleRects[index]));

    streams.forEach((stream) => {
      const rect = rects.get(stream) || { x: 0, y: 0, w: 0, h: 0 };
      stream.rect = rect;

      Object.assign(stream.el.style, {
        left: `${rect.x + halfGap}px`,
        top: `${rect.y + halfGap}px`,
        width: `${Math.max(0, rect.w - 2 * halfGap)}px`,
        height: `${Math.max(0, rect.h - 2 * halfGap)}px`,
      });
    });

    updateAudio();
  }

  new ResizeObserver(placeTiles).observe(stage);

  /* ========================================================================
     Video quality
     ======================================================================== */

  function setQuality(stream, value) {
    if (!value || !stream.player) return false;
    if (stream.currentQuality === value) return false;
    try {
      stream.player.setQuality(value);
      stream.currentQuality = value;
      return true;
    } catch (error) {
      return false;
    }
  }

  function applyQuality(stream, value = cfg.quality) {
    if (!stream || !stream.player) return false;
    return setQuality(stream, value);
  }

  function applyQualityToAll(value = cfg.quality) {
    streams.forEach((stream) => {
      if (!stream.player) return;
      try {
        stream.player.setQuality(value);
        stream.currentQuality = value;
      } catch (error) {
        // The player may still be booting.
      }
    });
  }

  /* ========================================================================
     Audio selection
     ======================================================================== */

  function audioTargetName() {
    if (globallyMuted) return null;
    return audioMode === "key" ? selectedName : hoveredName;
  }

  function updateAudio() {
    const target = audioTargetName();

    streams.forEach((stream) => {
      const isTarget = stream.name === target;
      stream.el.classList.toggle(
        "ismain",
        isMainLayout() && stream.name === mainName,
      );

      // Browsers reject unmuting before the first user gesture. Keep every
      // player muted until then so Twitch does not get stuck on its own
      // "click to unmute" overlay.
      const shouldBeAudible = isTarget && audioUnlocked && !stream.offline;
      stream.el.classList.toggle(
        "isaud",
        shouldBeAudible && stream.volume > 0,
      );
      if (stream.player) {
        try {
          stream.player.setMuted(!shouldBeAudible);
          if (shouldBeAudible) stream.player.setVolume(stream.volume);
        } catch (error) {
          // setMuted can throw while the iframe is still booting.
        }
      }
    });

    const keyboardMode = audioMode === "key";
    const mode = keyboardMode ? "Tastatur" : "Maus";
    $("#audio-label").textContent = mode;
    $("#audio-icon").className = `ti ti-${keyboardMode ? "keyboard" : "pointer"} icon`;
    $("#audio").title =
      `Tonmodus: ${mode}` +
      (globallyMuted ? " (stumm)" : "") +
      " – klicken zum Wechseln";
    $("#audio").setAttribute("aria-label", `Tonmodus: ${mode}. Wechseln`);
  }

  // Twitch can briefly remute a player after layout/visibility changes. Keep
  // the chosen audio stream synchronized, and guarantee playback never stays
  // paused (there is intentionally no play/pause control in the UI).
  function enforcePlaybackAndAudio() {
    streams.forEach((stream) => {
      if (!stream.player || !stream.ready || stream.offline) return;
      try {
        if (stream.player.isPaused()) stream.player.play();
      } catch (error) {
        // The player may still be booting.
      }
    });

    if (!audioUnlocked || globallyMuted) return;

    const target = streamByName(audioTargetName());
    if (!target || !target.player || !target.ready || target.offline) return;
    try {
      if (target.player.getMuted()) {
        target.player.setMuted(false);
        target.player.setVolume(target.volume);
      }
    } catch (error) {
      // Ignore transient iframe state.
    }
  }

  setInterval(enforcePlaybackAndAudio, 1500);

  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    updateAudio();
    verifyAudio();
  }

  // After the first gesture, confirm that the audible stream really unmuted.
  // Retry while the player starts up, then fall back to letting one click
  // reach Twitch's own "click to unmute" overlay.
  function verifyAudio(attempt = 0) {
    if (!audioUnlocked || globallyMuted) return;

    const target = streamByName(audioTargetName());
    if (!target || !target.player || !target.ready) {
      if (attempt < 12) setTimeout(() => verifyAudio(attempt + 1), 500);
      return;
    }

    try {
      if (!target.player.getMuted()) return;

      if (attempt < 8) {
        updateAudio();
        setTimeout(() => verifyAudio(attempt + 1), 400);
      } else {
        target.el.classList.add("pass");
        showToast(
          `Klicke einmal auf das Video, um ${target.name} hörbar zu machen`,
        );
      }
    } catch (error) {
      // The player may not expose its mute state yet.
    }
  }

  ["pointerdown", "keydown"].forEach((eventName) => {
    addEventListener(eventName, unlockAudio, { capture: true });
  });

  function toggleAudioMode() {
    audioMode = audioMode === "key" ? "hover" : "key";
    updateAudio();
  }

  function toggleGlobalMute() {
    globallyMuted = !globallyMuted;
    updateAudio();
  }

  /* ========================================================================
     Selection and navigation
     ======================================================================== */

  function selectStream(name) {
    if (!name || !streamByName(name)) return;

    selectedName = name;
    saveSelectedName(name);

    if ((layout === "focus" || isRotatingMain()) && mainName !== name) {
      mainName = name;
      placeTiles();
    }

    streams.forEach((stream) => {
      stream.el.classList.toggle("sel", stream.name === name);
    });
    updateAudio();

    if (cfg.chatOn && cfg.chatGroup === "main") renderChats();
  }

  function ensureSelection() {
    if (selectedName && streamByName(selectedName)) return;

    const remembered = loadSelectedName();
    const rememberedStream = remembered ? streamByName(remembered) : null;
    const next = rememberedStream || streams[0];

    if (next) {
      selectStream(next.name);
      return;
    }

    selectedName = null;
    saveSelectedName(null);
    updateAudio();
  }

  function neighbor(dx, dy) {
    const current = streamByName(selectedName);
    if (!current) return null;

    const from = current.rect;
    let best = null;
    let bestDistance = Infinity;

    for (const stream of streams) {
      if (stream === current) continue;

      const to = stream.rect;
      const centerX = to.x + to.w / 2 - (from.x + from.w / 2);
      const centerY = to.y + to.h / 2 - (from.y + from.h / 2);
      const along = dx ? centerX * dx : centerY * dy;
      const across = dx ? Math.abs(centerY) : Math.abs(centerX);

      if (along <= 1) continue;

      const distance = along + across * 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = stream;
      }
    }

    return best;
  }

  function navigate(dx, dy) {
    const current = streamByName(selectedName);
    if (!current) {
      const first = streams[0];
      if (first) selectStream(first.name);
      return;
    }

    let next;
    if (isRotatingMain()) {
      const visible = streams;
      const index = visible.indexOf(current);
      const step = dx + dy > 0 ? 1 : -1;
      next = visible[(index + step + visible.length) % visible.length];
    } else {
      next = neighbor(dx, dy);
    }

    if (!next) return;

    selectStream(next.name);
    if (document.fullscreenElement) {
      // Requesting fullscreen for the next tile while the old tile is still
      // fullscreen pushes it onto the browser's fullscreen stack. Exiting
      // first keeps exactly one fullscreen element, so Escape leaves
      // fullscreen instead of revealing the previous tile.
      const target = next.el;
      document
        .exitFullscreen()
        .then(() => target.requestFullscreen())
        .catch(() => {});
    }
  }

  function swapStreams(first, second) {
    const firstIndex = streams.indexOf(first);
    const secondIndex = streams.indexOf(second);
    [streams[firstIndex], streams[secondIndex]] = [
      streams[secondIndex],
      streams[firstIndex],
    ];
    placeTiles();
    saveStreams();
  }

  function reorder(dx, dy) {
    const current = streamByName(selectedName);
    if (!current) return;

    const next = isMainLayout()
      ? streams[streams.indexOf(current) + (dx + dy > 0 ? 1 : -1)]
      : neighbor(dx, dy);

    if (next) swapStreams(current, next);
  }

  function setMain(name, shouldSelect = true) {
    if (!name) return;

    if (
      (layout === "focus" || (shouldSelect && isRotatingMain())) &&
      selectedName !== name
    ) {
      selectStream(name);
      return;
    }

    mainName = name;
    placeTiles();
  }

  function toggleFullscreen(name) {
    const stream = streamByName(name);
    if (!stream) return;

    if (document.fullscreenElement === stream.el) {
      document.exitFullscreen();
    } else {
      stream.el
        .requestFullscreen()
        .catch(() => showToast("Vollbild wurde vom Browser blockiert."));
    }
  }

  function updateFullscreenButtons() {
    const current = document.fullscreenElement;
    streams.forEach((stream) => {
      const button = stream.el.querySelector('[data-a="fs"]');
      if (!button) return;
      const active = current === stream.el;
      const icon = button.querySelector(".icon");
      if (icon) {
        icon.className = `ti ${active ? "ti-minimize" : "ti-maximize"} icon`;
      }
      const label = active ? "Vollbild verlassen" : "Vollbild";
      button.title = label;
      button.setAttribute("aria-label", label);
    });
  }

  document.addEventListener("fullscreenchange", () => {
    // A fullscreen tile changes size without resizing the stage, so refresh
    // the tile geometry immediately and again once the transition has settled.
    placeTiles();
    updateFullscreenButtons();
    setTimeout(placeTiles, 100);
  });

  /* ========================================================================
     Stream tiles
     ======================================================================== */

  function paintRange(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const value = Number(input.value) || 0;
    const span = max - min;
    const progress = span > 0 ? ((value - min) / span) * 100 : 0;
    input.style.setProperty(
      "--range-progress",
      `${Math.min(100, Math.max(0, progress))}%`,
    );
  }

  function updateTileMute(stream) {
    const button = stream.el.querySelector('[data-c="mute"]');
    if (!button) return;
    const muted = stream.volume === 0;
    const icon = button.querySelector(".icon");
    if (icon) icon.className = `ti ${muted ? "ti-volume-off" : "ti-volume"} icon`;
    const label = muted ? "Ton einschalten" : "Stummschalten";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(muted));
  }

  function populateQualities(stream) {
    const select = stream.qualitySelect;
    if (
      !select ||
      !stream.player ||
      typeof stream.player.getQualities !== "function"
    ) {
      if (select) select.hidden = true;
      return;
    }

    const player = stream.player;
    let values;
    try {
      values = player.getQualities();
    } catch (error) {
      select.hidden = true;
      return;
    }

    Promise.resolve(values)
      .then((qualities) => {
        if (!streams.includes(stream) || stream.player !== player) return;
        if (!Array.isArray(qualities) || qualities.length === 0) {
          select.hidden = true;
          return;
        }

        const seen = new Set();
        const options = [];
        for (const quality of qualities) {
          const value =
            typeof quality === "string"
              ? quality
              : quality && (quality.group || quality.name || quality.quality);
          if (typeof value !== "string" || !value || seen.has(value)) continue;
          seen.add(value);
          const label =
            value === "chunked"
              ? "Quelle"
              : value === "auto"
                ? "Auto"
                : value;
          options.push({ value, label });
        }

        if (!options.length) {
          select.hidden = true;
          return;
        }

        select.replaceChildren();
        options.forEach((option) => {
          const node = document.createElement("option");
          node.value = option.value;
          node.textContent = option.label;
          select.appendChild(node);
        });

        let current = "";
        try {
          current =
            typeof player.getQuality === "function"
              ? String(player.getQuality())
              : "";
        } catch (error) {
          current = "";
        }
        if (options.some((option) => option.value === current)) {
          select.value = current;
        }

        select.hidden = false;
      })
      .catch(() => {
        select.hidden = true;
      });
  }

  function createStream(name) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.n = name;
    tile.innerHTML = `
      <div class="v" id="p-${name}"></div>
      <div class="off">
        <div class="off-card">
          <i class="ti ti-plug-off icon" aria-hidden="true"></i>
          <p><span class="off-name">${name}</span> ist offline</p>
          <a class="btn btn--sm" href="https://www.twitch.tv/${encodeURIComponent(name)}" target="_blank" rel="noopener noreferrer">
            <i class="ti ti-external-link icon" aria-hidden="true"></i><span>Kanal auf Twitch öffnen</span>
          </a>
        </div>
      </div>
      <div class="ad" role="status" aria-label="Werbung">
        <i class="ti ti-ad icon" aria-hidden="true"></i>
      </div>
      <div class="shield"></div>
      <div class="lab">
        <span class="lab-brand"><i class="ti ti-brand-twitch icon" aria-hidden="true"></i></span>
        <span class="lab-body">
          <b>${name}</b>
          <span class="lab-viewers" title="Zuschauer"><i class="ti ti-eye icon" aria-hidden="true"></i><span class="viewers-v">–</span></span>
        </span>
        <i class="pm">MAIN</i>
        <span class="t"></span>
      </div>
      <div class="delay" title="Verzögerung gegenüber dem Streamer" hidden>
        <i class="ti ti-clock icon" aria-hidden="true"></i><span class="pd-v">–</span>
      </div>
      <div class="tile-chrome">
        <div class="badges">
          <span class="badge badge-audio" title="Hörbarer Stream"><i class="ti ti-volume icon" aria-hidden="true"></i><span>Ton</span></span>
          <span class="badge badge-through" title="Klicks gehen an Twitch">Twitch-UI</span>
        </div>
        <div class="tile-actions">
          <button data-a="int" type="button" title="Klicks an Twitch weitergeben (Altersfreigabe, Werbung)" aria-label="Klicks an Twitch weitergeben"><i class="ti ti-pointer icon" aria-hidden="true"></i></button>
          <button data-a="main" type="button" title="Als Hauptstream setzen und Ton abspielen" aria-label="Als Hauptstream setzen"><i class="ti ti-layout-bottombar icon" aria-hidden="true"></i></button>
          <button data-a="tw" type="button" title="Auf Twitch öffnen" aria-label="Auf Twitch öffnen"><i class="ti ti-external-link icon" aria-hidden="true"></i></button>
          <button data-a="fs" type="button" title="Vollbild" aria-label="Vollbild"><i class="ti ti-maximize icon" aria-hidden="true"></i></button>
          <button data-a="rm" type="button" title="Entfernen" aria-label="Stream entfernen"><i class="ti ti-x icon" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="ctl">
        <button class="ctl-btn" data-c="mute" type="button" title="Stummschalten" aria-label="Stummschalten" aria-pressed="false"><i class="ti ti-volume icon" aria-hidden="true"></i></button>
        <input type="range" min="0" max="100" value="100" title="Lautstärke (0 = stumm)" aria-label="Lautstärke">
        <select class="ctl-quality" title="Qualität" aria-label="Qualität" hidden></select>
      </div>`;
    stage.appendChild(tile);

    const stream = {
      name,
      el: tile,
      player: null,
      ready: false,
      offline: false,
      adBreak: false,
      adHits: 0,
      adMisses: 0,
      volume: 1,
      lastVolume: 1,
      qualitySelect: tile.querySelector(".ctl-quality"),
      rect: { x: 0, y: 0, w: 1, h: 1 },
      currentQuality: null,
      readyAt: 0,
      lastTime: null,
      lastProgressAt: 0,
      pausedSince: 0,
      recoveryStage: 0,
      recoveryCount: 0,
      lastRecoveryAt: 0,
      playerVersion: 0,
      title: "",
      titleRequested: false,
      viewers: null,
    };
    streams.push(stream);

    const volumeInput = tile.querySelector("input");
    const muteButton = tile.querySelector('[data-c="mute"]');
    paintRange(volumeInput);
    updateTileMute(stream);

    // Put the controls to sleep after five seconds without pointer movement.
    // Keyboard focus always keeps them visible.
    let idleTimer = 0;
    const cancelIdle = () => {
      clearTimeout(idleTimer);
      tile.classList.remove("is-idle");
    };
    const armIdle = () => {
      clearTimeout(idleTimer);
      if (!tile.matches(":hover") || tile.contains(document.activeElement)) {
        return;
      }
      idleTimer = setTimeout(() => {
        if (tile.matches(":hover") && !tile.contains(document.activeElement)) {
          tile.classList.add("is-idle");
        }
      }, IDLE_DELAY);
    };
    const wakeTile = () => {
      tile.classList.remove("is-idle");
      armIdle();
    };

    tile.addEventListener("pointermove", wakeTile);
    tile.addEventListener("pointerenter", wakeTile);
    tile.addEventListener("pointerdown", wakeTile);
    tile.addEventListener("pointerleave", cancelIdle);
    tile.addEventListener("focusin", cancelIdle);
    tile.addEventListener("focusout", armIdle);

    tile.addEventListener("mouseenter", () => {
      if (isDragging() || suppressHover) return;
      hoveredName = name;
      updateAudio();
    });

    tile.addEventListener("mouseleave", () => {
      tile.classList.remove("pass");
      if (hoveredName === name && !isDragging() && !suppressHover) {
        hoveredName = null;
        updateAudio();
      }
    });

    // Selection is deferred until pointerup when the drag shield was pressed,
    // so starting a drag no longer changes the audible stream. Overlay
    // controls must not select first either: in Focus layouts that would
    // re-layout the tile before the button's click event is delivered.
    tile.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest(".shield")) return;
      if (event.target.closest(".tile-actions, .ctl")) return;
      selectStream(name);
    });

    tile.querySelector(".shield").addEventListener("dblclick", () => {
      toggleFullscreen(name);
    });

    tile.querySelector(".tile-actions").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-a]");
      if (!button) return;
      event.stopPropagation();

      const action = button.dataset.a;
      if (action === "rm") removeStream(name);
      else if (action === "fs") toggleFullscreen(name);
      else if (action === "main") setMain(name);
      else if (action === "tw") openOnTwitch(name);
      else if (action === "int") tile.classList.toggle("pass");
    });

    volumeInput.oninput = () => {
      paintRange(volumeInput);
      stream.volume = Number(volumeInput.value) / 100;
      if (stream.volume > 0) stream.lastVolume = stream.volume;
      updateTileMute(stream);
      updateAudio();
    };

    muteButton.onclick = () => {
      if (stream.volume > 0) {
        stream.lastVolume = stream.volume;
        stream.volume = 0;
      } else {
        stream.volume = stream.lastVolume || 1;
      }
      volumeInput.value = String(Math.round(stream.volume * 100));
      paintRange(volumeInput);
      updateTileMute(stream);
      updateAudio();
    };

    stream.qualitySelect.onchange = () => {
      const value = stream.qualitySelect.value;
      if (value) setQuality(stream, value);
    };

    mountPlayer(stream);

    if (!mainName) mainName = name;
  }

  function mountPlayer(stream) {
    const twitch = window.Twitch;
    const host = stream.el.querySelector(".v");
    if (!twitch || !twitch.Player) {
      return;
    }

    stream.ready = false;
    stream.currentQuality = null;
    stream.lastTime = null;
    stream.lastProgressAt = performance.now();
    stream.pausedSince = 0;
    stream.recoveryStage = 0;
    stream.readyAt = performance.now();
    stream.adBreak = false;
    stream.adHits = 0;
    stream.adMisses = 0;
    stream.el.classList.remove("isad");

    host.textContent = "";
    const version = ++stream.playerVersion;
    let player;
    try {
      player = new twitch.Player(host.id, {
        channel: stream.name,
        parent: [parentDomain],
        width: "100%",
        height: "100%",
        muted: true,
        autoplay: true,
        controls: false,
      });
    } catch (error) {
      return;
    }

    stream.player = player;
    const current = () =>
      stream.player === player && stream.playerVersion === version;

    const ready = () => {
      stream.ready = true;
      stream.readyAt = performance.now();
      setOffline(stream, false);
      applyQuality(stream, cfg.quality);
      populateQualities(stream);
      scheduleViewerRefresh();
      updateAudio();
      if (audioUnlocked) verifyAudio();
    };

    player.addEventListener(twitch.Player.READY, () => {
      if (!current()) return;
      ready();
    });

    // VIDEO_READY usually arrives just before READY and is the first moment a
    // quality change is accepted. Applying the configured quality here avoids
    // visibly starting on source and dropping a few seconds later.
    if (twitch.Player.VIDEO_READY) {
      player.addEventListener(twitch.Player.VIDEO_READY, () => {
        if (!current()) return;
        stream.ready = true;
        stream.readyAt = performance.now();
        applyQuality(stream, cfg.quality);
      });
    }

    if (twitch.Player.VIDEO_PLAY) {
      player.addEventListener(twitch.Player.VIDEO_PLAY, () => {
        if (!current()) return;
        stream.ready = true;
        stream.lastTime = null;
        stream.lastProgressAt = performance.now();
      });
    }

    player.addEventListener(twitch.Player.PAUSE, () => {
      if (!current()) return;
      // Playback is intentionally not user-controllable.
      try {
        player.play();
      } catch (error) {
        // The player may still be loading.
      }
    });

    player.addEventListener(twitch.Player.PLAYING, () => {
      if (!current()) return;
      // PLAYING is a useful second readiness signal: if READY was missed,
      // the selected player can still be unmuted as soon as it plays.
      stream.ready = true;
      stream.readyAt = performance.now();
      stream.lastTime = null;
      stream.lastProgressAt = performance.now();
      stream.pausedSince = 0;
      stream.recoveryStage = 0;
      setOffline(stream, false);
      applyQuality(stream, cfg.quality);
      updateAudio();
      if (audioUnlocked) verifyAudio();
      if (!stream.title && !stream.titleRequested) fetchTitle(stream);
    });

    player.addEventListener(twitch.Player.OFFLINE, () => {
      if (!current()) return;
      setOffline(stream, true);
      stream.lastTime = null;
    });

    player.addEventListener(twitch.Player.ONLINE, () => {
      if (!current()) return;
      setOffline(stream, false);
      applyQuality(stream, cfg.quality);
      scheduleViewerRefresh();
      fetchTitle(stream);
    });
  }

  function rebuildPlayer(stream) {
    if (!streams.includes(stream) || stream.offline) return;
    stream.player = null;
    stream.ready = false;
    stream.currentQuality = null;
    stream.lastTime = null;
    stream.el.classList.remove("isoff", "isad");
    mountPlayer(stream);
  }

  // Twitch occasionally leaves the embed on the "Preparing your stream"
  // preroll card with no video progress. The player API cannot reach inside
  // the cross-origin iframe, so detect a stalled timeline, nudge playback,
  // then remount the player as a last resort.
  function monitorPlayback() {
    if (document.hidden) return;
    const now = performance.now();

    streams.forEach((stream) => {
      if (!stream.player || stream.offline) return;
      // The player timeline freezes while an ad is playing. Do not mistake
      // that for a stalled stream and remount the player mid-ad.
      if (stream.adBreak) return;

      // A stream that never reaches READY can be stuck on the preroll card
      // before any playback event fires. Give Twitch a generous window, then
      // remount at most a few times instead of leaving the tile on the ad
      // spinner forever.
      if (!stream.ready) {
        const mountedFor = now - (stream.readyAt || now);
        if (
          mountedFor > 25000 &&
          (stream.recoveryCount || 0) < 3 &&
          now - (stream.lastRecoveryAt || 0) > 25000
        ) {
          stream.lastRecoveryAt = now;
          stream.recoveryCount = (stream.recoveryCount || 0) + 1;
          rebuildPlayer(stream);
        }
        return;
      }

      if (typeof stream.player.getCurrentTime !== "function") return;

      let time;
      let paused;
      let stats = null;
      try {
        time = stream.player.getCurrentTime();
        paused = stream.player.isPaused();
        stats = stream.player.getPlaybackStats
          ? stream.player.getPlaybackStats()
          : null;
      } catch (error) {
        return;
      }

      const validTime = typeof time === "number" && Number.isFinite(time);
      if (
        validTime &&
        (stream.lastTime == null || time > stream.lastTime + 0.05)
      ) {
        stream.lastTime = time;
        stream.lastProgressAt = now;
        stream.pausedSince = 0;
        stream.recoveryStage = 0;
        if (now - (stream.lastRecoveryAt || 0) > 120000) {
          stream.recoveryCount = 0;
        }
        return;
      }

      if (paused) {
        if (!stream.pausedSince) stream.pausedSince = now;
        try {
          stream.player.play();
        } catch (error) {
          // Keep waiting for the recovery threshold.
        }
      } else {
        stream.pausedSince = 0;
      }

      const noVideo =
        stats && /^0*x0*$/i.test(String(stats.videoResolution || ""));
      const activity = Math.max(
        stream.lastProgressAt || 0,
        stream.pausedSince || 0,
      );
      const stalledFor = now - activity;

      // Slow starts are normal; only recover after the player had a chance to
      // settle. When neither the clock nor the video resolution is available,
      // there is no reliable stall signal.
      if (now - (stream.readyAt || now) < 6000) return;
      if (!paused && !noVideo && stalledFor < 9000) return;
      if (stalledFor < 9000) return;
      if (now - (stream.lastRecoveryAt || 0) < 15000) return;

      stream.lastRecoveryAt = now;

      if ((stream.recoveryStage || 0) === 0) {
        stream.recoveryStage = 1;
        stream.lastProgressAt = now;
        stream.pausedSince = 0;
        try {
          // Switching away from a possibly stuck rendition sometimes lets the
          // preroll/ad state machine continue.
          applyQuality(stream, cfg.quality);
          stream.player.play();
        } catch (error) {
          // Fall through to the remount on the next pass.
        }
        setTimeout(() => {
          if (streams.includes(stream) && !stream.offline) {
            applyQuality(stream, cfg.quality);
          }
        }, 3500);
      } else if ((stream.recoveryCount || 0) < 3) {
        stream.recoveryStage = 0;
        stream.recoveryCount = (stream.recoveryCount || 0) + 1;
        rebuildPlayer(stream);
      } else {
        // Repeated remounts did not help. Leave the player alone instead of
        // restarting it forever; the recovery counter resets after two
        // minutes of real playback progress.
        stream.recoveryStage = 0;
      }
    });
  }

  setInterval(monitorPlayback, 2000);

  // The Twitch embed API has no ad event. During an ad it reports playback
  // "Playing" with a numeric duration of 0; regular live playback reports
  // duration null. Two consecutive hits/misses keep short state blips from
  // flashing the overlay.
  const AD_HIT_LIMIT = 2;
  const AD_MISS_LIMIT = 2;

  function setAdBreak(stream, active) {
    if (!stream || stream.adBreak === active) return;
    stream.adBreak = active;
    stream.adHits = 0;
    stream.adMisses = 0;
    stream.el.classList.toggle("isad", active);
  }

  function monitorAdBreaks() {
    if (document.hidden) return;

    streams.forEach((stream) => {
      if (!stream.player || !stream.ready || stream.offline) {
        setAdBreak(stream, false);
        return;
      }

      let state = null;
      try {
        state =
          typeof stream.player.getPlayerState === "function"
            ? stream.player.getPlayerState()
            : null;
      } catch (error) {
        state = null;
      }

      const activePlayback =
        state &&
        (state.playback === "Playing" || state.playback === "Buffering");
      const inAd =
        activePlayback &&
        typeof state.duration === "number" &&
        state.duration === 0 &&
        typeof state.currentTime === "number" &&
        state.currentTime > 0.5;

      if (inAd) {
        stream.adMisses = 0;
        stream.adHits += 1;
        if (!stream.adBreak && stream.adHits >= AD_HIT_LIMIT) {
          setAdBreak(stream, true);
        }
      } else {
        stream.adHits = 0;
        if (stream.adBreak) {
          stream.adMisses += 1;
          if (stream.adMisses >= AD_MISS_LIMIT) setAdBreak(stream, false);
        }
      }
    });
  }

  setInterval(monitorAdBreaks, 1000);

  function clearTitle(stream) {
    stream.title = "";
    const titleEl = stream.el.querySelector(".t");
    titleEl.textContent = "";
    titleEl.title = "";
  }

  function setOffline(stream, offline) {
    if (!stream || stream.offline === offline) {
      if (offline) clearTitle(stream);
      return;
    }

    stream.offline = offline;
    stream.el.classList.toggle("isoff", offline);

    const viewersEl = stream.el.querySelector(".lab-viewers");
    if (viewersEl) viewersEl.hidden = offline;
    if (offline) {
      const delayEl = stream.el.querySelector(".delay");
      if (delayEl) delayEl.hidden = true;
    }

    if (offline) {
      setAdBreak(stream, false);
      clearTitle(stream);
    }

    placeTiles();
    updateAudio();
  }

  async function fetchTitle(stream) {
    if (cfg.ovTitle === "off" || stream.offline) {
      clearTitle(stream);
      return;
    }

    stream.titleRequested = true;

    // decapi.me occasionally drops a request; one short retry keeps the
    // optional title from staying blank until the next five-minute refresh.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // Twitch's embed API does not expose the stream title. decapi.me is a
        // public helper that returns it as plain text.
        const response = await fetch(
          `https://decapi.me/twitch/title/${stream.name}`,
          { cache: "no-store" },
        );
        const title = (await response.text()).trim();

        if (
          title &&
          title.length < 200 &&
          !/^error/i.test(title) &&
          cfg.ovTitle !== "off" &&
          !stream.offline &&
          streamByName(stream.name)
        ) {
          stream.title = title;
          const titleEl = stream.el.querySelector(".t");
          titleEl.textContent = title;
          titleEl.title = title;
          return;
        }
      } catch (error) {
        // Retry once below; titles are optional.
      }

      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }

    // Allow a later PLAYING/ONLINE event to try again.
    stream.titleRequested = false;
  }

  setInterval(() => {
    streams.forEach((stream) => {
      if (!stream.offline) fetchTitle(stream);
    });
  }, 300000);

  // One batched GQL request keeps every visible viewer count current. The
  // embed API does not expose viewer counts, and a per-tile request would
  // multiply traffic for no benefit.
  let viewerRefreshTimer = 0;

  async function fetchViewerCounts() {
    const names = streams
      .filter((stream) => !stream.offline)
      .map((stream) => stream.name);
    if (!names.length) return;

    try {
      const data = await gql(
        `{users(logins:${JSON.stringify(names)}){login stream{viewersCount}}}`,
      );
      const users = (data && data.data && data.data.users) || [];
      const counts = new Map(
        users
          .filter(Boolean)
          .map((user) => [
            user.login,
            user.stream ? user.stream.viewersCount : null,
          ]),
      );

      streams.forEach((stream) => {
        if (!counts.has(stream.name)) return;
        const value = counts.get(stream.name);
        const countEl = stream.el.querySelector(".viewers-v");
        if (!countEl) return;
        if (typeof value === "number" && Number.isFinite(value)) {
          stream.viewers = value;
          countEl.textContent = formatViewers(value);
        } else {
          stream.viewers = null;
          countEl.textContent = "–";
        }
      });
    } catch (error) {
      // Viewer counts are optional; the stream itself keeps working.
    }
  }

  function scheduleViewerRefresh() {
    clearTimeout(viewerRefreshTimer);
    viewerRefreshTimer = setTimeout(fetchViewerCounts, 400);
  }

  setInterval(fetchViewerCounts, 60000);

  function removeStream(name) {
    const index = streams.findIndex((stream) => stream.name === name);
    if (index < 0) return;

    streams[index].el.remove();
    streams.splice(index, 1);

    if (hoveredName === name) hoveredName = null;
    if (mainName === name) {
      mainName = streams[0] ? streams[0].name : null;
    }

    if (selectedName === name) {
      selectedName = null;
      const next = streams[index] || streams[0] || null;
      if (next) selectStream(next.name);
    }

    placeTiles();
    saveStreams();
    syncChat();
    ensureSelection();
  }

  function openOnTwitch(name) {
    window.open(
      `https://www.twitch.tv/${encodeURIComponent(name)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function ensureVisibleSelection() {
    if (selectedName && streamByName(selectedName)) return;
    const next = streams[0];
    if (next) selectStream(next.name);
  }

  function addStreams(text) {
    const names = [
      ...new Set(
        text
          .toLowerCase()
          .split(/[\s,;]+/)
          .filter(Boolean)
          .map((part) =>
            part
              .replace(/^.*twitch\.tv\//, "")
              .split(/[/?#]/)[0]
              .replace(/^@/, ""),
          ),
      ),
    ];

    const invalid = [];
    names.forEach((name) => {
      if (!USERNAME_PATTERN.test(name)) {
        invalid.push(name);
        return;
      }
      if (!streamByName(name)) createStream(name);
    });

    if (invalid.length) {
      showToast(`Ungültiger Twitch-Username: ${invalid.join(", ")}`);
    }

    placeTiles();
    saveStreams();
    syncChat();
    ensureSelection();
  }

  function submitInput() {
    if (input.value.trim()) {
      addStreams(input.value);
      input.value = "";
    }
    hideSuggestions();
  }

  /* ========================================================================
     Stream search
     ======================================================================== */

  let suggestionItems = [];
  let suggestionIndex = -1;
  let searchTimer;
  let searchSequence = 0;

  const formatViewers = (count) =>
    count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);

  function hideSuggestions() {
    suggestionBox.hidden = true;
    suggestionItems = [];
    suggestionIndex = -1;
  }

  async function gql(query) {
    const response = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: { "Client-ID": TWITCH_GQL_CLIENT_ID },
      body: JSON.stringify({ query }),
    });
    return response.json();
  }

  const fromUser = (user) => ({
    login: user.login,
    name: user.displayName || user.login,
    live: Boolean(user.stream),
    info: user.stream ? formatViewers(user.stream.viewersCount || 0) : "",
  });

  async function searchChannels(query) {
    try {
      // Unofficial public web endpoint.
      const data = await gql(
        `{searchFor(userQuery:${JSON.stringify(query)},platform:"web",options:{targets:[{index:CHANNEL}]}){channels{edges{item{...on User{login displayName stream{viewersCount}}}}}}}`,
      );
      const channels =
        data.data && data.data.searchFor && data.data.searchFor.channels;
      const list =
        (channels &&
          (channels.edges
            ? channels.edges.map((edge) => edge.item)
            : channels.items)) ||
        [];
      const results = list.filter((user) => user && user.login).map(fromUser);

      if (results.length) return results;
    } catch (error) {
      // Try the exact-name lookup below.
    }

    try {
      // Last resort: exact-name lookup.
      const data = await gql(
        `{users(logins:[${JSON.stringify(query)}]){login displayName stream{viewersCount}}}`,
      );
      return ((data.data && data.data.users) || [])
        .filter(Boolean)
        .map(fromUser);
    } catch (error) {
      return [];
    }
  }

  async function runSearch(query) {
    const sequence = ++searchSequence;
    const results = await searchChannels(query);

    if (
      sequence !== searchSequence ||
      input.value.trim().toLowerCase() !== query
    ) {
      return;
    }

    const exact = results.find((result) => result.login === query) || {
      login: query,
      name: query,
    };
    renderSuggestions(
      [exact, ...results.filter((result) => result !== exact)].slice(0, 8),
    );
  }

  function renderSuggestions(items) {
    suggestionItems = items;
    suggestionIndex = -1;
    suggestionBox.textContent = "";

    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";

      const name = document.createElement("span");
      name.textContent = item.name;

      const meta = document.createElement("span");
      meta.className = "sm";
      if (streamByName(item.login)) {
        meta.textContent = "hinzugefügt";
      } else if (item.live) {
        meta.classList.add("live");
        meta.textContent = `● LIVE${item.info ? ` · ${item.info}` : ""}`;
      }

      button.append(name, meta);
      button.onmousedown = (event) => {
        event.preventDefault();
        pickSuggestion(item);
      };
      suggestionBox.appendChild(button);
    });

    suggestionBox.hidden = !items.length;
  }

  function markSuggestion() {
    [...suggestionBox.children].forEach((button, index) => {
      button.classList.toggle("hl", index === suggestionIndex);
    });
  }

  function pickSuggestion(item) {
    addStreams(item.login);
    input.value = "";
    hideSuggestions();
  }

  /* ========================================================================
     Delay readout
     ======================================================================== */

  setInterval(() => {
    const latencies = new Map();

    streams.forEach((stream) => {
      let value = null;
      if (
        stream.ready &&
        stream.player &&
        !stream.el.classList.contains("isoff")
      ) {
        try {
          const stats = stream.player.getPlaybackStats();
          const latency = stats.hlsLatencyBroadcaster;
          if (typeof latency === "number" && latency > 0) value = latency;
        } catch (error) {
          // Stats are unavailable while the stream is loading.
        }
      }
      latencies.set(stream, value);
    });

    const values = [...latencies.values()].filter((value) => value != null);
    const fastest = Math.min(...values);

    streams.forEach((stream) => {
      const value = latencies.get(stream);
      const delayEl = stream.el.querySelector(".delay");
      const delayValue = delayEl.querySelector(".pd-v");
      delayEl.hidden = value == null;
      if (value == null) return;
      delayValue.textContent = `${value.toFixed(1)}s`;
      delayEl.title =
        "Verzögerung gegenüber dem Streamer" +
        (values.length > 1
          ? ` · +${(value - fastest).toFixed(1)}s gegenüber dem schnellsten Stream`
          : "");
    });
  }, 2000);

  /* ========================================================================
     Drag and drop
     ======================================================================== */

  function hitTest(event) {
    const bounds = stage.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    return streams.find(
      (stream) =>
        x >= stream.rect.x &&
        x < stream.rect.x + stream.rect.w &&
        y >= stream.rect.y &&
        y < stream.rect.y + stream.rect.h,
    );
  }

  stage.addEventListener("pointerdown", (event) => {
    const shield = event.target.closest(".shield");
    if (!shield || event.button !== 0) return;

    const tile = shield.closest(".tile");
    const stream = tile && streamByName(tile.dataset.n);
    if (!stream) return;

    dragState = {
      stream,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target: null,
    };

    // Freeze hover audio as soon as a drag could start, not only after the
    // pointer has moved past the threshold. Otherwise a drag started near a
    // tile edge can cross into its neighbour while still below the threshold.
    suppressHover = true;
  });

  addEventListener("pointermove", (event) => {
    if (!dragState) {
      // Re-enable hover audio only after the pointer really moves again, so
      // tiles sliding under the cursor at the end of a drag do not steal audio.
      suppressHover = false;
      return;
    }
    if (document.fullscreenElement) return;

    if (
      !dragState.active &&
      Math.hypot(
        event.clientX - dragState.startX,
        event.clientY - dragState.startY,
      ) > DRAG_THRESHOLD
    ) {
      dragState.active = true;
      dragState.stream.el.classList.add("drag");
      document.body.classList.add("dragging");
    }

    if (!dragState.active) return;

    dragState.target = hitTest(event);
    streams.forEach((stream) => {
      stream.el.classList.toggle(
        "drop",
        stream === dragState.target && stream !== dragState.stream,
      );
    });
  });

  addEventListener("pointerup", () => {
    if (!dragState) return;

    const { stream, target, active } = dragState;
    dragState = null;
    document.body.classList.remove("dragging");
    streams.forEach((tileStream) => {
      tileStream.el.classList.remove("drag", "drop");
    });

    // A plain click on the video area selects it; a completed drag does not.
    if (!active) {
      selectStream(stream.name);
      return;
    }

    suppressHover = true;

    if (!target || target === stream) return;

    if (isMainLayout() && target.name === mainName) {
      // Do not promote by dragging: it would change the main view without
      // moving the audio, which is the confusing part of the old Focus flow.
      showToast("Klicke auf einen Stream, um ihn als Hauptstream zu setzen");
      return;
    }

    swapStreams(stream, target);
  });

  addEventListener("pointercancel", () => {
    if (dragState) {
      dragState = null;
      document.body.classList.remove("dragging");
      streams.forEach((stream) => {
        stream.el.classList.remove("drag", "drop");
      });
      placeTiles();
    }
  });

  /* ========================================================================
     Chat reader (development feature)
     ======================================================================== */

  const chat = {
    socket: null,
    status: "off",
    nick: `justinfan${10000 + Math.floor(Math.random() * 899999)}`,
    joined: new Set(),
    reconnectTimer: null,
    reconnectAttempt: 0,
    history: new Map(),
    seen: new Map(),
    globalEmotes: new Map(),
    channelEmotes: new Map(),
    emoteRequests: new Map(),
    globalEmoteRequest: null,
    twitchIds: new Map(),
    groups: [],
    panels: [],
  };

  function chatGroupList() {
    const names = streams.map((stream) => stream.name);
    if (!names.length) return [];

    if (cfg.chatGroup === "main") {
      const name =
        (selectedName && names.includes(selectedName) ? selectedName : null) ||
        (mainName && names.includes(mainName) ? mainName : null) ||
        names[0];
      return [{ key: "main", label: `#${name}`, channels: [name] }];
    }

    if (cfg.chatGroup === "per") {
      return names.map((name) => ({
        key: `per:${name}`,
        label: `#${name}`,
        channels: [name],
      }));
    }

    if (cfg.chatGroup === "custom") {
      const valid = new Set(names);
      const claimed = new Set();
      const groups = [];

      cfg.chatCustom
        .split(/\||\n/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part, index) => {
          let label = "";
          let namesPart = part;
          const colon = part.indexOf(":");
          if (colon > 0) {
            label = part.slice(0, colon).trim();
            namesPart = part.slice(colon + 1);
          }

          const channels = [
            ...new Set(
              (namesPart.toLowerCase().match(/[a-z0-9_]+/g) || []).filter(
                (name) => valid.has(name) && !claimed.has(name),
              ),
            ),
          ];
          if (!channels.length) return;

          channels.forEach((name) => claimed.add(name));
          groups.push({
            key: `custom:${index}`,
            label: label || channels.map((name) => `#${name}`).join(" + "),
            channels,
          });
        });

      const rest = names.filter((name) => !claimed.has(name));
      if (groups.length && rest.length) {
        groups.push({
          key: "custom:rest",
          label: "Übrige",
          channels: rest,
        });
      }

      if (groups.length) return groups;
    }

    return [
      {
        key: "all",
        label:
          names.length === 1 ? `#${names[0]}` : `Alle Streams (${names.length})`,
        channels: names,
      },
    ];
  }

  function chatStatusText() {
    if (!cfg.chatOn) return "Aus";
    if (!streams.length) return "Keine Streams";
    if (chat.status === "connected") return "Verbunden";
    if (chat.status === "connecting") return "Verbinde…";
    if (chat.status === "reconnecting") return "Neu verbinden…";
    return "Offline";
  }

  function updateChatStatus() {
    chat.panels.forEach((panel) => {
      panel.panel.dataset.state = chat.status;
      panel.statusEl.textContent = chatStatusText();
    });
  }

  function updateChatCount(panel) {
    panel.countEl.textContent = String(panel.feed.childElementCount);
  }

  function trimChatFeed(panel) {
    while (panel.feed.childElementCount > CHAT_HISTORY_LIMIT) {
      panel.feed.firstElementChild.remove();
    }
    updateChatCount(panel);
  }

  function safeChatColor(color) {
    return /^#[0-9a-f]{6}$/i.test(color || "") ? color : null;
  }

  function generatedChatColor(login) {
    let hash = 0;
    for (let index = 0; index < login.length; index += 1) {
      hash = (hash * 31 + login.charCodeAt(index)) % 360;
    }
    return `hsl(${hash} 72% 72%)`;
  }

  function parseTwitchEmoteRanges(tag) {
    const ranges = [];
    (tag || "").split("/").forEach((part) => {
      const colon = part.indexOf(":");
      if (colon < 0) return;
      const id = part.slice(0, colon);
      part
        .slice(colon + 1)
        .split(",")
        .forEach((range) => {
          const [start, end] = range.split("-").map(Number);
          if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
            ranges.push({ start, end, id });
          }
        });
    });
    return ranges.sort((first, second) => first.start - second.start);
  }

  function sevenTvFileUrl(emote) {
    const host = emote && emote.data && emote.data.host;
    if (!host || !host.url) return null;
    const files = host.files || [];
    const file =
      files.find((entry) => entry.name === "2x.webp") ||
      files.find((entry) => entry.name === "1x.webp") ||
      files.find((entry) => /\.webp$/i.test(entry.name || "")) ||
      files[0];
    return file ? `https:${host.url}/${file.name}` : null;
  }

  function collectSevenTvEmotes(emotes, target) {
    (emotes || []).forEach((emote) => {
      const url = sevenTvFileUrl(emote);
      if (emote && emote.name && url) target.set(emote.name, url);
    });
    return target;
  }

  function chatEmoteMap(login) {
    const map = new Map();
    if (!cfg.chatEmotes) return map;
    chat.globalEmotes.forEach((url, name) => map.set(name, url));
    const channel = chat.channelEmotes.get(login);
    if (channel) channel.forEach((url, name) => map.set(name, url));
    return map;
  }

  function ensureGlobalEmotes() {
    if (!cfg.chatEmotes || chat.globalEmoteRequest) return;
    chat.globalEmoteRequest = fetch(
      "https://7tv.io/v3/emote-sets/global",
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return;
        chat.globalEmotes = collectSevenTvEmotes(
          data.emotes,
          new Map(),
        );
        if (chat.globalEmotes.size) renderChats();
      })
      .catch(() => {
        chat.globalEmoteRequest = null;
      });
  }

  function ensureChannelEmotes(login) {
    if (
      !cfg.chatEmotes ||
      chat.channelEmotes.has(login) ||
      chat.emoteRequests.has(login)
    ) {
      return;
    }

    const request = (async () => {
      const map = new Map();
      try {
        let id = chat.twitchIds.get(login);
        if (!id) {
          const data = await gql(
            `{users(logins:[${JSON.stringify(login)}]){id login}}`,
          );
          const user =
            (data.data && data.data.users && data.data.users[0]) || null;
          id = user && user.id;
          if (id) chat.twitchIds.set(login, id);
        }
        if (!id) return map;

        const response = await fetch(
          `https://7tv.io/v3/users/twitch/${encodeURIComponent(id)}`,
        );
        if (!response.ok) return map;
        const data = await response.json();
        collectSevenTvEmotes(
          data.emote_set && data.emote_set.emotes,
          map,
        );
      } catch (error) {
        // 7TV is optional; the chat falls back to plain text.
      }
      return map;
    })();

    chat.emoteRequests.set(login, request);

    request.then((map) => {
      chat.emoteRequests.delete(login);
      chat.channelEmotes.set(login, map);
      if (map.size) renderChats();
    });
  }

  function appendSevenTvText(fragment, text, emoteMap) {
    text.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        fragment.append(part);
        return;
      }

      const url = emoteMap.get(part);
      if (!url) {
        fragment.append(part);
        return;
      }

      const image = document.createElement("img");
      image.className = "emote";
      image.src = url;
      image.alt = part;
      image.loading = "lazy";
      fragment.append(image);
    });
  }

  function renderChatMessageBody(message) {
    const fragment = document.createDocumentFragment();
    const emoteMap = chatEmoteMap(message.channel);
    let text = message.text || "";
    if (text.startsWith("\u0001ACTION ") && text.endsWith("\u0001")) {
      text = text.slice(8, -1);
    }

    const ranges = parseTwitchEmoteRanges(message.emotes);
    let position = 0;
    ranges.forEach((range) => {
      if (range.start < position || range.start >= text.length) return;
      const end = Math.min(range.end + 1, text.length);
      appendSevenTvText(fragment, text.slice(position, range.start), emoteMap);

      const emoteText = text.slice(range.start, end);
      if (/^[0-9]+$/.test(range.id)) {
        const image = document.createElement("img");
        image.className = "emote";
        image.src = `https://static-cdn.jtvnw.net/emoticons/v2/${range.id}/default/dark/1.0`;
        image.alt = emoteText;
        image.loading = "lazy";
        fragment.append(image);
      } else {
        fragment.append(emoteText);
      }
      position = end;
    });

    appendSevenTvText(fragment, text.slice(position), emoteMap);
    return fragment;
  }

  function buildChatMessage(message) {
    const row = document.createElement("div");
    row.className = "chat-msg";
    row.dataset.id = message.id || "";
    row.dataset.login = message.login;

    if (cfg.chatTimestamps) {
      const time = document.createElement("span");
      time.className = "chat-time";
      time.textContent = new Date(message.ts).toLocaleTimeString("de-CH", {
        hour: "2-digit",
        minute: "2-digit",
      });
      row.append(time);
    }

    const name = document.createElement("span");
    name.className = "chat-name";
    name.textContent = message.display;
    name.style.color =
      safeChatColor(message.color) || generatedChatColor(message.login);

    const body = document.createElement("span");
    body.className = "chat-text";
    body.append(renderChatMessageBody(message));

    row.append(name, body);
    return row;
  }

  function buildChatPanel(group, tile = false) {
    const panel = document.createElement("section");
    panel.className = tile ? "chat chat--tile" : "chat";
    panel.dataset.group = group.key;
    panel.dataset.state = chat.status;

    const head = document.createElement("header");
    head.className = "chat-head";

    const dot = document.createElement("span");
    dot.className = "chat-dot";
    dot.setAttribute("aria-hidden", "true");

    const title = document.createElement("span");
    title.className = "chat-title";
    title.textContent = group.label;
    title.title = group.channels.map((name) => `#${name}`).join(", ");

    const statusEl = document.createElement("span");
    statusEl.className = "chat-status";
    statusEl.textContent = chatStatusText();

    const countEl = document.createElement("span");
    countEl.className = "chat-count";
    countEl.textContent = "0";

    head.append(dot, title, statusEl, countEl);

    const feed = document.createElement("div");
    feed.className = "chat-feed";
    feed.setAttribute("role", "log");
    feed.setAttribute("aria-live", "off");
    feed.setAttribute("aria-label", `Twitch-Chat ${group.label}`);

    const messages = group.channels
      .flatMap((name) => chat.history.get(name) || [])
      .sort((first, second) => first.ts - second.ts);
    messages.forEach((message) => feed.append(buildChatMessage(message)));

    panel.append(head, feed);
    const ref = { group, panel, feed, statusEl, countEl };
    chat.panels.push(ref);
    updateChatCount(ref);

    requestAnimationFrame(() => {
      feed.scrollTop = feed.scrollHeight;
    });

    return panel;
  }

  function renderChats() {
    document
      .querySelectorAll(".tile .chat--tile")
      .forEach((panel) => panel.remove());
    chatsEl.textContent = "";
    chatPane.textContent = "";
    chat.panels = [];
    chat.groups = chatGroupList();

    if (!cfg.chatOn || !chat.groups.length) {
      chatsEl.hidden = true;
      chatPane.hidden = true;
      return;
    }

    const place = cfg.chatPlace;
    chatsEl.className = `chats chats--${place}`;
    chatsEl.dataset.anchor = cfg.chatAnchor;

    if (place === "sidebar") {
      chatsEl.hidden = true;
      chatPane.hidden = false;
      chat.groups.forEach((group) => {
        chatPane.append(buildChatPanel(group));
      });
    } else if (place === "tile") {
      chatsEl.hidden = true;
      chatPane.hidden = true;
      chat.groups.forEach((group) => {
        const stream = streamByName(group.channels[0]);
        if (stream) stream.el.append(buildChatPanel(group, true));
      });
    } else {
      chatsEl.hidden = false;
      chatPane.hidden = true;
      chat.groups.forEach((group) => {
        chatsEl.append(buildChatPanel(group));
      });
    }

    updateChatStatus();
  }

  function addChatMessage(channel, login, tags, text) {
    if (!streamByName(channel)) return;
    const id = tags.id || "";
    const seen = chat.seen.get(channel) || new Set();
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    chat.seen.set(channel, seen);

    const message = {
      id,
      channel,
      login,
      display: tags["display-name"] || login,
      color: tags.color || "",
      emotes: tags.emotes || "",
      ts: Number(tags["tmi-sent-ts"]) || Date.now(),
      text,
    };

    const history = chat.history.get(channel) || [];
    history.push(message);
    while (history.length > CHAT_HISTORY_LIMIT) {
      const removed = history.shift();
      if (removed && removed.id) seen.delete(removed.id);
    }
    chat.history.set(channel, history);

    chat.panels.forEach((panel) => {
      if (!panel.group.channels.includes(channel)) return;
      const nearBottom =
        panel.feed.scrollHeight -
          panel.feed.scrollTop -
          panel.feed.clientHeight <
        60;
      panel.feed.append(buildChatMessage(message));
      trimChatFeed(panel);
      if (nearBottom) panel.feed.scrollTop = panel.feed.scrollHeight;
    });
  }

  function removeChatMessage(login, id) {
    const history = chat.history.get(login);
    if (history) {
      const index = history.findIndex((message) => message.id === id);
      if (index >= 0) history.splice(index, 1);
    }

    chat.panels.forEach((panel) => {
      if (!panel.group.channels.includes(login)) return;
      panel.feed
        .querySelectorAll(`.chat-msg[data-id="${CSS.escape(id)}"]`)
        .forEach((element) => element.remove());
      updateChatCount(panel);
    });
  }

  function clearChannelChat(login) {
    chat.history.delete(login);
    renderChats();
  }

  function parseIrcLine(line) {
    const tags = Object.create(null);
    let rest = line;

    if (rest.startsWith("@")) {
      const space = rest.indexOf(" ");
      if (space < 0) return null;
      rest
        .slice(1, space)
        .split(";")
        .forEach((pair) => {
          const equals = pair.indexOf("=");
          if (equals > 0) {
            tags[pair.slice(0, equals)] = pair
              .slice(equals + 1)
              .replace(/\\s/g, " ")
              .replace(/\\:/g, ";")
              .replace(/\\r/g, "\r")
              .replace(/\\n/g, "\n")
              .replace(/\\\\/g, "\\");
          }
        });
      rest = rest.slice(space + 1);
    }

    let prefix = "";
    if (rest.startsWith(":")) {
      const space = rest.indexOf(" ");
      if (space < 0) return null;
      prefix = rest.slice(1, space);
      rest = rest.slice(space + 1);
    }

    let command = rest;
    let params = "";
    const space = rest.indexOf(" ");
    if (space >= 0) {
      command = rest.slice(0, space);
      params = rest.slice(space + 1);
    }

    let message = null;
    if (params.startsWith(":")) {
      message = params.slice(1);
      params = "";
    } else {
      const separator = params.indexOf(" :");
      if (separator >= 0) {
        message = params.slice(separator + 2);
        params = params.slice(0, separator);
      }
    }

    return { tags, prefix, command, params, message };
  }

  function ircChannel(params) {
    if (!params || !params.startsWith("#")) return "";
    const space = params.indexOf(" ");
    const channel = space < 0 ? params : params.slice(0, space);
    return channel.slice(1).toLowerCase();
  }

  function handleChatLine(line) {
    const parsed = parseIrcLine(line);
    if (!parsed) return;
    const { tags, prefix, command, params, message } = parsed;

    if (command === "PING") {
      if (chat.socket) {
        chat.socket.send(`PONG :${message || "tmi.twitch.tv"}`);
      }
      return;
    }

    if (command === "001") {
      chat.status = "connected";
      chat.reconnectAttempt = 0;
      syncChatJoins(true);
      updateChatStatus();
      return;
    }

    if (command === "RECONNECT") {
      if (chat.socket) chat.socket.close();
      return;
    }

    if (command === "PRIVMSG") {
      const channel = ircChannel(params);
      const login = (prefix || "").split("!")[0].toLowerCase();
      if (channel && login && message != null) {
        addChatMessage(channel, login, tags, message);
      }
      return;
    }

    if (command === "CLEARMSG") {
      const login = ircChannel(params) || (prefix || "").split("!")[0];
      if (tags["target-msg-id"] && login) {
        removeChatMessage(login.toLowerCase(), tags["target-msg-id"]);
      }
      return;
    }

    if (command === "CLEARCHAT") {
      const login = ircChannel(params);
      if (login && !tags["target-user-id"]) clearChannelChat(login);
    }
  }

  function handleChatData(data) {
    String(data)
      .split("\r\n")
      .filter(Boolean)
      .forEach(handleChatLine);
  }

  function scheduleChatReconnect() {
    if (chat.reconnectTimer || !cfg.chatOn || !streams.length) return;
    chat.status = "reconnecting";
    updateChatStatus();
    const delay = Math.min(
      30000,
      2000 * 2 ** Math.min(chat.reconnectAttempt, 4),
    );
    chat.reconnectAttempt += 1;
    chat.reconnectTimer = setTimeout(() => {
      chat.reconnectTimer = null;
      if (cfg.chatOn && streams.length) connectChat();
    }, delay);
  }

  function connectChat() {
    if (!cfg.chatOn || !streams.length) return;
    if (chat.socket) return;

    chat.status = "connecting";
    updateChatStatus();

    let socket;
    try {
      socket = new WebSocket(CHAT_IRC_URL);
    } catch (error) {
      scheduleChatReconnect();
      return;
    }
    chat.socket = socket;

    socket.onopen = () => {
      if (chat.socket !== socket) return;
      socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      socket.send("PASS SCHMOOPIIE");
      socket.send(`NICK ${chat.nick}`);
    };

    socket.onmessage = (event) => {
      if (chat.socket !== socket) return;
      handleChatData(event.data);
    };

    socket.onerror = () => {
      // The close handler performs the actual reconnect.
    };

    socket.onclose = () => {
      if (chat.socket !== socket) return;
      chat.socket = null;
      chat.joined.clear();
      chat.status = "off";
      updateChatStatus();
      if (cfg.chatOn && streams.length) scheduleChatReconnect();
    };
  }

  function syncChatJoins(force = false) {
    const socket = chat.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (chat.status !== "connected") return;

    const wanted = new Set(streams.map((stream) => stream.name));
    [...chat.joined].forEach((name) => {
      if (!wanted.has(name)) {
        socket.send(`PART #${name}`);
        chat.joined.delete(name);
      }
    });
    wanted.forEach((name) => {
      if (force && chat.joined.has(name)) return;
      if (!chat.joined.has(name)) {
        socket.send(`JOIN #${name}`);
        chat.joined.add(name);
      }
    });
  }

  function stopChat() {
    if (chat.reconnectTimer) {
      clearTimeout(chat.reconnectTimer);
      chat.reconnectTimer = null;
    }
    const socket = chat.socket;
    chat.socket = null;
    chat.joined.clear();
    if (socket) {
      try {
        socket.close();
      } catch (error) {
        // Already closed.
      }
    }
    chat.status = "off";
  }

  function syncChat() {
    if (!cfg.chatOn || !streams.length) {
      stopChat();
      renderChats();
      return;
    }

    connectChat();
    syncChatJoins();
    if (cfg.chatEmotes) {
      ensureGlobalEmotes();
      streams.forEach((stream) => ensureChannelEmotes(stream.name));
    }
    renderChats();
  }

  function applyChat() {
    syncChat();
  }

  /* ========================================================================
     Toolbar
     ======================================================================== */

  LAYOUTS.forEach(([id, label, icon], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--ghost btn--sm btn--icon";
    button.dataset.l = id;
    button.title = `${label}-Layout (${index + 1})`;
    button.setAttribute("aria-label", `${label}-Layout`);
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<i class="ti ti-${icon} icon" aria-hidden="true"></i>`;
    button.onclick = () => setLayout(id);
    layoutBar.appendChild(button);
  });

  function setLayout(id) {
    layout = id;
    document.body.dataset.layout = id;
    layoutBar.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.l === id));
    });

    if (isRotatingMain() && selectedName) mainName = selectedName;
    if (id === "focus" && selectedName) mainName = selectedName;

    placeTiles();

    if (id === "focus" && !focusHintShown && streams.length > 1) {
      focusHintShown = true;
      showToast(
        "Fokus: Klicke auf einen Stream, um ihn zu schauen; ziehe Miniaturen zum Sortieren",
      );
    }
  }

  function toggleBar() {
    document.body.classList.toggle("nobar");
  }

  function buildShareUrl() {
    const params = new URLSearchParams();
    params.set("s", streams.map((stream) => stream.name).join(","));
    params.set("l", layout);

    if (mainName) params.set("m", mainName);

    const parent = new URLSearchParams(location.search).get("parent");
    if (parent) params.set("parent", parent);

    return `${location.origin}${location.pathname}?${params.toString()}`;
  }

  async function copyShareLink() {
    const url = buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link kopiert (Streams + Layout)");
      return;
    } catch (error) {
      // Clipboard access can be blocked on plain http. Use the legacy path.
    }

    try {
      const helper = document.createElement("textarea");
      helper.value = url;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
      showToast("Link kopiert (Streams + Layout)");
    } catch (error) {
      showToast(url);
    }
  }

  $("#add").onclick = submitInput;
  $("#audio").onclick = toggleAudioMode;
  $("#hide").onclick = toggleBar;
  $("#tab").onclick = toggleBar;
  $("#share").onclick = copyShareLink;
  $("#clear").onclick = () => {
    [...streams].forEach((stream) => removeStream(stream.name));
  };
  $("#cog").onclick = () => openSettings();

  input.addEventListener("keydown", (event) => {
    if (!suggestionBox.hidden && suggestionItems.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        suggestionIndex =
          event.key === "ArrowDown"
            ? (suggestionIndex + 1) % suggestionItems.length
            : suggestionIndex <= 0
              ? suggestionItems.length - 1
              : suggestionIndex - 1;
        markSuggestion();
        return;
      }

      if (event.key === "Enter" && suggestionIndex >= 0) {
        event.preventDefault();
        pickSuggestion(suggestionItems[suggestionIndex]);
        return;
      }

      if (event.key === "Escape") {
        hideSuggestions();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitInput();
    }
  });

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    clearTimeout(searchTimer);

    // A single name with no spaces or delimiters behaves like a search box.
    if (!/^[a-z0-9_]{2,25}$/.test(query)) {
      searchSequence += 1;
      hideSuggestions();
      return;
    }

    renderSuggestions([{ login: query, name: query }]);
    searchTimer = setTimeout(() => runSearch(query), 250);
  });

  input.addEventListener("blur", () => {
    setTimeout(hideSuggestions, 150);
  });

  input.addEventListener("paste", () => {
    setTimeout(() => {
      if (/\n/.test(input.value)) submitInput();
    });
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".bar button");
    if (button) button.blur();
  });

  addEventListener("mousemove", (event) => {
    if (!cfg.autoHide) return;
    barEl.classList.toggle(
      "peek",
      event.clientY < (barEl.classList.contains("peek") ? 56 : 6),
    );
  });

  /* ========================================================================
     Keyboard shortcuts
     ======================================================================== */

  const KEY_ACTIONS = {
    up: () => navigate(0, -1),
    down: () => navigate(0, 1),
    left: () => navigate(-1, 0),
    right: () => navigate(1, 0),
    fs: () => toggleFullscreen(selectedName),
    audio: toggleAudioMode,
    cycle: () =>
      setLayout(
        LAYOUTS[
          (LAYOUTS.findIndex((entry) => entry[0] === layout) + 1) %
            LAYOUTS.length
        ][0],
      ),
    main: () => selectedName && setMain(selectedName),
    mute: toggleGlobalMute,
    remove: () => selectedName && removeStream(selectedName),
    bar: toggleBar,
    input: () => input.focus(),
    settings: () => openSettings(),
  };

  addEventListener("keydown", (event) => {
    if (
      rebindingAction ||
      dialog.open ||
      event.metaKey ||
      event.target.matches("input,textarea,select")
    ) {
      return;
    }

    if (
      (event.ctrlKey && cfg.mod !== "Ctrl") ||
      (event.altKey && cfg.mod !== "Alt")
    ) {
      return;
    }

    const hasModifier = {
      Shift: event.shiftKey,
      Alt: event.altKey,
      Ctrl: event.ctrlKey,
    }[cfg.mod];
    const key = normalizeKey(event.key);
    const actionEntry = ACTIONS.find(
      ([actionName]) => cfg.keys[actionName] === key,
    );
    const action = actionEntry ? actionEntry[0] : null;

    if (hasModifier) {
      if (DIRECTIONS[action]) {
        reorder(...DIRECTIONS[action]);
        event.preventDefault();
      }
      return;
    }

    if (action) KEY_ACTIONS[action]();
    else if (key.length === 1 && key >= "1" && key <= "9") {
      const targetLayout = LAYOUTS[Number(key) - 1];
      if (targetLayout) setLayout(targetLayout[0]);
      else return;
    } else if (key === "Escape" && document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      return;
    }

    event.preventDefault();
  });

  // Clicking into a Twitch iframe (only possible in "pass clicks" mode) steals
  // focus. Take it back and select the tile that was clicked.
  addEventListener("blur", () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active.tagName === "IFRAME") {
        const tile = active.closest(".tile");
        unlockAudio();
        if (tile) selectStream(tile.dataset.n);
        setTimeout(() => active.blur(), 150);
      }
    }, 0);
  });

  /* ========================================================================
     Settings
     ======================================================================== */

  const FIELDS = [
    ["Standard"],
    ["layout", "Startlayout", "sel", LAYOUTS],
    [
      "audio",
      "Start-Tonmodus",
      "sel",
      [
        ["key", "Tastaturauswahl"],
        ["hover", "Mauszeiger"],
      ],
    ],
    [
      "rotateMain",
      "Pfeiltasten wechseln den Hauptstream (Fokus, Vertikal, Horizontal)",
      "chk",
    ],
    ["mainWeight", "Grösse des Hauptstreams", "rng", [1, 4, 0.1]],
    ["gap", "Abstand zwischen Streams (px)", "rng", [0, 12, 1]],
    ["Video"],
    ["quality", "Stream-Qualität für alle Streams", "sel", QUALITY_OPTIONS],
    ["Oberfläche"],
    ["ovName", "Streamer-Name", "sel", OVERLAY_MODES],
    ["ovTitle", "Stream-Titel", "sel", OVERLAY_MODES],
    ["ovMain", "MAIN-Kennzeichnung", "sel", OVERLAY_MODES],
    ["ovDelay", "Verzögerung zum Streamer", "sel", OVERLAY_MODES],
    ["ovOffline", "Offline-Hinweis", "sel", OVERLAY_MODES],
    ["ovAd", "Werbung-Hinweis", "sel", OVERLAY_MODES],
    ["selWidth", "Stärke des Auswahlrahmens (px, 0 = aus)", "rng", [0, 8, 1]],
    [
      "autoHide",
      "Toolbar automatisch ausblenden (Maus an den oberen Rand)",
      "chk",
    ],
    ["Chat (Entwicklung: Twitch + 7TV)"],
    ["chatOn", "Stream-Chat lesen (7TV-Emotes, experimentell)", "chk"],
    ["chatPlace", "Platzierung", "sel", CHAT_PLACES, () => cfg.chatOn],
    [
      "chatAnchor",
      "Schwebend: Ecke",
      "sel",
      CHAT_ANCHORS,
      () => cfg.chatOn && cfg.chatPlace === "floating",
    ],
    ["chatGroup", "Gruppierung", "sel", CHAT_GROUPS, () => cfg.chatOn],
    [
      "chatCustom",
      "Eigene Gruppen (Label: a+b | c)",
      "text",
      null,
      () => cfg.chatOn && cfg.chatGroup === "custom",
    ],
    ["chatStyle", "Chat-Stil", "sel", CHAT_STYLES, () => cfg.chatOn],
    ["chatSize", "Chat-Grösse", "sel", CHAT_SIZES, () => cfg.chatOn],
    ["chatEmotes", "7TV-Emotes anzeigen", "chk", null, () => cfg.chatOn],
    ["chatTimestamps", "Zeitstempel anzeigen", "chk", null, () => cfg.chatOn],
    ["Tastatur"],
    [
      "mod",
      "Verschieben mit (+ Pfeiltasten)",
      "sel",
      [
        ["Shift", "Shift"],
        ["Alt", "Alt"],
        ["Ctrl", "Ctrl"],
      ],
    ],
    ["Farben"],
    [
      "preset",
      "Farbprofil",
      "sel",
      [["", "Auswählen…"], ...Object.keys(PRESETS).map((name) => [name, name])],
    ],
    ["colors.acc", "Akzent", "col"],
    ["colors.sel", "Auswahlrahmen", "col"],
    ["colors.bg", "Video-Hintergrund", "col"],
  ];

  const getPath = (path) =>
    path.split(".").reduce((object, key) => object[key], cfg);

  function setPath(path, value) {
    const parts = path.split(".");
    const last = parts.pop();
    const target = parts.reduce((object, key) => object[key], cfg);
    target[last] = value;
  }

  function openSettings() {
    renderSettings();
    dialog.showModal();
  }

  function renderSettings() {
    settingsBody.textContent = "";

    FIELDS.forEach((field) => {
      if (field.length === 1) {
        const heading = document.createElement("h3");
        heading.textContent = field[0];
        settingsBody.appendChild(heading);
        return;
      }

      const [key, label, type, options, when] = field;
      if (when && !when()) return;

      const row = document.createElement("label");
      row.className = "setting-row";

      const text = document.createElement("span");
      text.textContent = label;
      row.appendChild(text);

      let fieldInput;
      if (type === "sel") {
        fieldInput = document.createElement("select");
        options.forEach(([value, name]) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = name;
          fieldInput.appendChild(option);
        });
        fieldInput.value = key === "preset" ? "" : getPath(key);
      } else {
        fieldInput = document.createElement("input");
        if (type === "chk") {
          fieldInput.type = "checkbox";
          fieldInput.checked = getPath(key);
        } else if (type === "rng") {
          fieldInput.type = "range";
          [fieldInput.min, fieldInput.max, fieldInput.step] = options;
          fieldInput.value = getPath(key);
        } else if (type === "text") {
          fieldInput.type = "text";
          fieldInput.value = getPath(key);
          fieldInput.autocomplete = "off";
          fieldInput.spellcheck = false;
        } else {
          fieldInput.type = "color";
          fieldInput.value = getPath(key);
        }
      }

      const handleChange = () => {
        if (type === "rng") paintRange(fieldInput);
        if (key === "preset") {
          if (fieldInput.value) {
            cfg.colors = { ...PRESETS[fieldInput.value] };
            renderSettings();
          }
        } else {
          setPath(
            key,
            type === "chk"
              ? fieldInput.checked
              : type === "rng"
                ? Number(fieldInput.value)
                : fieldInput.value,
          );
        }

        saveConfig();

        if (key === "layout") setLayout(cfg.layout);
        if (key === "audio") audioMode = cfg.audio;
        if (key === "ovTitle") {
          streams.forEach((stream) => {
            if (stream.offline || cfg.ovTitle === "off") clearTitle(stream);
            else fetchTitle(stream);
          });
        }
        if (key === "quality") applyQualityToAll(cfg.quality);

        applyConfig();

        if (key.startsWith("chat")) {
          applyChat();
          if (
            ["chatOn", "chatGroup", "chatPlace", "chatAnchor"].includes(key)
          ) {
            renderSettings();
          }
        }
      };
      fieldInput.onchange = fieldInput.oninput = handleChange;
      if (type === "rng") paintRange(fieldInput);

      row.appendChild(fieldInput);
      settingsBody.appendChild(row);
    });

    if (cfg.chatOn) {
      const chatNote = document.createElement("p");
      chatNote.className = "small";
      chatNote.style.marginTop = "0.75rem";
      chatNote.textContent =
        "Chat-Gruppen: Mit «|» trennen und mit «+» Streams bündeln. " +
        "Ein optionales Label steht vor dem Doppelpunkt, z. B. " +
        "«Valorant: xqc+tarik | Solo: pgl». Nicht genannte Streams " +
        "erscheinen in einer eigenen «Übrige»-Gruppe. " +
        "Der Chat wird anonym gelesen; 7TV-Emotes werden nachgeladen.";
      settingsBody.appendChild(chatNote);
    }

    const keyboardHeading = document.createElement("h3");
    keyboardHeading.textContent =
      "Tastenkürzel (klicken, dann Taste drücken; Esc bricht ab)";
    settingsBody.appendChild(keyboardHeading);

    const keyboardGrid = document.createElement("div");
    keyboardGrid.className = "keys";
    keyboardGrid.id = "kg";
    settingsBody.appendChild(keyboardGrid);
    renderKeyBindings();

    const note = document.createElement("p");
    note.className = "small";
    note.style.marginTop = "1rem";
    note.textContent =
      `${cfg.mod} + Pfeiltasten verschiebt den ausgewählten Stream. Die Zifferntasten 1–${LAYOUTS.length} ` +
      "wählen ein Layout. In «Fokus» macht ein Klick auf einen Stream ihn zum Hauptstream und hörbar. " +
      "Kacheln lassen sich per Ziehen neu anordnen.";
    settingsBody.appendChild(note);

    const actions = document.createElement("div");
    actions.className = "dialog-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "btn btn--sm";
    copyButton.textContent = "Link kopieren";
    copyButton.onclick = copyShareLink;

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "btn btn--danger btn--sm";
    clearButton.textContent = "Alle Streams entfernen";
    clearButton.onclick = () => {
      [...streams].forEach((stream) => removeStream(stream.name));
      showToast("Alle Streams entfernt");
    };

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "btn btn--danger btn--sm";
    resetButton.textContent = "Auf Standard zurücksetzen";
    resetButton.onclick = () => {
      cfg = structuredClone(DEFAULT_CONFIG);
      saveConfig();
      layout = cfg.layout;
      audioMode = cfg.audio;
      setLayout(layout);
      applyConfig();
      applyChat();
      applyQualityToAll(cfg.quality);
      renderSettings();
    };

    actions.append(copyButton, clearButton, resetButton);
    settingsBody.appendChild(actions);
  }

  function renderKeyBindings() {
    const keyboardGrid = $("#kg");
    keyboardGrid.textContent = "";

    ACTIONS.forEach(([action, label]) => {
      const row = document.createElement("div");
      row.className = "setting-row";

      const text = document.createElement("span");
      text.textContent = label;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn--sm";
      const value = cfg.keys[action];
      button.textContent = value === " " ? "Leertaste" : value || "(keine)";

      button.onclick = () => {
        rebindingAction = action;
        button.textContent = "Taste drücken…";

        const handleKey = (event) => {
          event.preventDefault();
          event.stopPropagation();

          if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;

          removeEventListener("keydown", handleKey, true);
          rebindingAction = null;

          if (event.key !== "Escape") {
            const key = normalizeKey(event.key);
            for (const actionName in cfg.keys) {
              if (cfg.keys[actionName] === key) cfg.keys[actionName] = "";
            }
            cfg.keys[action] = key;
            saveConfig();
          }

          renderKeyBindings();
        };

        addEventListener("keydown", handleKey, true);
      };

      row.append(text, button);
      keyboardGrid.appendChild(row);
    });
  }

  $("#close").onclick = () => dialog.close();

  /* ========================================================================
     Start
     ======================================================================== */

  applyConfig();
  setLayout(layout);

  const params = new URLSearchParams(location.search);
  const sharedLayout = params.get("l");
  const sharedMain = params.get("m");

  if (sharedLayout && LAYOUTS.some(([id]) => id === sharedLayout)) {
    layout = sharedLayout;
  }

  let initial = params.get("s");
  if (!initial) {
    try {
      initial = (
        JSON.parse(localStorage.getItem(STORAGE_KEYS.streams)) || []
      ).join(",");
    } catch (error) {
      // Ignore corrupt stream storage.
    }
  }

  if (location.protocol === "file:") {
    showToast(
      "Twitch-Embeds benötigen http(s). Starte die Seite über localhost.",
    );
  } else if (!window.Twitch) {
    showToast(
      "Das Twitch-Player-Script konnte nicht geladen werden. Prüfe die Verbindung oder deinen Werbeblocker.",
    );
  }

  if (initial) addStreams(initial);

  setLayout(layout);

  if (sharedMain && streamByName(sharedMain)) {
    selectStream(sharedMain);
  }

  ensureSelection();
  applyChat();
  updateAudio();
})();
