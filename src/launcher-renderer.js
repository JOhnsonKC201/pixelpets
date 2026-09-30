// Quick Tools launcher UI. Keyboard first: type, arrows, Enter. It draws what main
// suggests and sends back only (query, index); main decides what that means.
// Everything is rendered with textContent, never innerHTML, because titles can
// carry text the user typed or copied.
(() => {
  const api = window.launcher;
  const input = document.getElementById('q');
  const list = document.getElementById('list');

  const TAGS = {
    calc: 'CALC', convert: 'UNIT', search: 'WEB', note: 'NOTE', todo: 'TODO',
    timer: 'TIME', shortcut: 'OPEN', clip: 'CLIP', system: 'DO', info: '?',
  };
  const REFRESH_MS = 1000;

  let items = [];
  let sel = 0;
  let seq = 0;          // drops out-of-order replies when typing fast
  let busy = false;     // one run at a time
  let refreshTimer = null;

  function row(item, i) {
    const li = document.createElement('li');
    li.className = 'row' + (item.checked && item.kind === 'todo' ? ' done' : '') + (item.enabled ? '' : ' off');
    li.id = `r${i}`;
    li.dataset.kind = item.kind;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === sel));

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = item.kind === 'todo' ? (item.checked ? '✓ DONE' : 'TODO') : (TAGS[item.kind] || '');
    const txt = document.createElement('span');
    txt.className = 'txt';
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = item.title;
    const s = document.createElement('div');
    s.className = 's';
    s.textContent = item.subtitle;
    txt.append(t, s);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = i < 8 ? `alt ${i + 1}` : '';

    li.append(tag, txt, n);
    li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; paintSelection(); } });
    li.addEventListener('click', () => run(i));
    return li;
  }

  function paintSelection() {
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === sel)));
    const cur = list.children[sel];
    if (cur) { input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); }
  }

  function render(next) {
    items = Array.isArray(next) ? next : [];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.replaceChildren(...items.map(row));
    paintSelection();
    requestAnimationFrame(() => api.resize(document.body.scrollHeight));
  }

  async function refresh() {
    const mine = ++seq;
    const next = await api.suggest(input.value);
    if (mine === seq) render(next);
  }

  async function run(i) {
    const item = items[i];
    if (busy || !item || !item.enabled) return;
    busy = true;
    try {
      const r = await api.run(input.value, i);
      if (r && r.list) render(r.list);
    } finally { busy = false; }
  }

  function move(delta) {
    if (!items.length) return;
    sel = (sel + delta + items.length) % items.length;
    paintSelection();
  }

  input.addEventListener('input', () => { sel = 0; refresh(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); if (input.value) { input.value = ''; sel = 0; refresh(); } else api.hide(); }
    // e.code, not e.key: on a Mac, Option+1 types a symbol, so e.key is never "1".
    else if (e.altKey && /^Digit[1-8]$/.test(e.code)) { e.preventDefault(); run(Number(e.code.slice(5)) - 1); }
  });

  // Running timers count down while the empty-query view is open.
  function startRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { if (!input.value && items.some((x) => x.kind === 'timer')) refresh(); }, REFRESH_MS);
  }
  window.addEventListener('blur', () => clearInterval(refreshTimer));

  api.onReset(() => {
    input.value = '';
    sel = 0;
    input.focus();
    refresh();
    startRefresh();
  });
  refresh();
})();
