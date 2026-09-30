// Report window: shows the prepared text read-only and relays three buttons.
(() => {
  const api = window.report;
  const box = document.getElementById('body');

  async function load() {
    const r = await api.get();
    box.value = r ? r.body : 'Nothing to report.';
    document.getElementById('send').focus();
  }

  document.getElementById('send').addEventListener('click', () => api.send());
  document.getElementById('cancel').addEventListener('click', () => api.close());
  document.getElementById('folder').addEventListener('click', () => api.openFolder());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.close(); });
  api.onRefresh(load);
  load();
})();
