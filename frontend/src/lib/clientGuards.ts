/**
 * Client-side deterrents against casual code inspection.
 *
 * IMPORTANT — this is a speed bump, not security. Everything the browser
 * runs can always be inspected with enough effort (dev tools, proxies,
 * "view-source" workarounds). Real protection is layered elsewhere:
 *  - the bundle is minified and ships NO source maps (vite default)
 *  - every secret stays server-side (see the Secrets section of the README)
 *  - chat data never leaves the server's RAM unredacted
 */

const DEVTOOLS_SHORTCUT_KEYS = ["i", "j", "c", "u", "s"];

export function installClientGuards() {
  // Right-click / long-press menu anywhere on the page
  window.addEventListener("contextmenu", (event) => event.preventDefault());

  // Common view-source / devtools shortcuts: F12, Ctrl/Cmd+Shift+I/J/C,
  // Ctrl/Cmd+U (view source), Ctrl/Cmd+S (save page).
  window.addEventListener(
    "keydown",
    (event) => {
      const key = event.key.toLowerCase();
      const meta = event.ctrlKey || event.metaKey;

      const blocked =
        event.key === "F12" ||
        (meta && event.shiftKey && DEVTOOLS_SHORTCUT_KEYS.includes(key)) ||
        (meta && !event.shiftKey && (key === "u" || key === "s"));

      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true }
  );
}
