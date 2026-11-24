/* ==========================================================================
   jtobler.net — theme toggle
   Applies an explicit light/dark theme from localStorage before the page is
   painted, otherwise follows the operating system. Every page includes this
   script synchronously in <head>; toggle buttons opt in with data-theme-toggle.
   ========================================================================== */

(() => {
  "use strict";

  const STORAGE_KEY = "jt-theme";
  const root = document.documentElement;
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const readStored = () => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (error) {
      return null;
    }
  };

  let stored = readStored();

  const effectiveTheme = () => stored || (darkQuery.matches ? "dark" : "light");

  const syncButtons = () => {
    const dark = effectiveTheme() === "dark";
    const label = dark ? "Helles Design einschalten" : "Dunkles Design einschalten";

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    });
  };

  const applyTheme = () => {
    if (stored) root.dataset.theme = stored;
    else delete root.dataset.theme;
    syncButtons();
  };

  // Set the attribute immediately so the first paint uses the saved theme.
  if (stored) root.dataset.theme = stored;

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-toggle]");
    if (!button) return;

    stored = effectiveTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, stored);
    } catch (error) {
      /* Storage can be unavailable (private mode); the toggle still works. */
    }
    applyTheme();
  });

  const handleSystemChange = () => {
    if (!stored) syncButtons();
  };

  if (typeof darkQuery.addEventListener === "function") {
    darkQuery.addEventListener("change", handleSystemChange);
  } else if (typeof darkQuery.addListener === "function") {
    darkQuery.addListener(handleSystemChange);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncButtons);
  } else {
    syncButtons();
  }
})();
