// DayLog: Review page. The only script here is "Copy summary": put the markdown the export
// would download onto the clipboard, ready to paste into Claude.
//
// Browsers only allow clipboard writes as a direct result of a tap/click, and some (Safari on
// iPhone) cancel that permission if the page waits for a network request first. So the summary
// is fetched in the background when the page loads, and the click copies text that's already here.
(() => {
  'use strict';

  const button = document.querySelector('[data-copy-summary]');
  const status = document.querySelector('[data-copy-status]');
  if (!button) return;

  let summary = null;
  const ready = fetch(button.dataset.copySummary)
    .then(res => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(text => (summary = text));
  ready.catch(() => { /* reported on click */ });

  /** Old-style copy via a hidden textarea: works on plain-http pages (e.g. your PC's IP over Wi-Fi). */
  function legacyCopy(text) {
    const area = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy failed');
  }

  async function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch { /* fall through to the legacy method */ }
    }
    legacyCopy(text);
  }

  button.addEventListener('click', async () => {
    try {
      // Normally already loaded; if not (slow connection), wait for it.
      const text = summary ?? (status.textContent = 'Preparing summary…', await ready);
      await copy(text);
      status.textContent = `Copied ${text.length.toLocaleString()} characters. Paste it into Claude.`;
    } catch {
      status.textContent = "Couldn't copy. Use “Summary (.md)” to download it instead.";
    }
  });
})();
