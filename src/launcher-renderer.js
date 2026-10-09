// Quick Tools launcher UI. Keyboard first: type, arrows, Enter. It draws what main
// suggests and sends back only (query, index); main decides what that means.
// Everything is rendered with textContent / createElement, never innerHTML,
// because titles can carry text the user typed or copied.
//
// Every word shown here arrives from main already translated. Nothing below may
// decide anything by reading a title or a header: it keys on ids and flags.
(() => {
  const api = window.launcher;
  const Icons = window.LauncherIcons;
  const input = document.getElementById('q');
  const list = document.getElementById('list');
  const tip = document.getElementById('tip');
  const petCanvas = document.getElementById('pet');

  const REFRESH_MS = 1000;
  // The key that reveals the number shortcuts is called Option on a Mac.
  const MOD = api.platform === 'darwin' ? 'option' : 'alt';
  document.getElementById('modKey').textContent = MOD;
  // The page's own wording. The markup carries the English; main sends the user's
  // language with every open (onReset).
  const TEXT = {
    move: document.getElementById('lblMove'),
    run: document.getElementById('lblRun'),
    numbers: document.getElementById('lblNumbers'),
  };
  let emptyTip = tip.textContent;
  let tipSelected = '{hint}: {title}';

  let items = [];
  let rows = [];          // row elements, index-aligned with items (section headers excluded)
  let sel = 0;
  let seq = 0;            // drops out-of-order replies when typing fast
  let busy = false;       // one run at a time
  let refreshTimer = null;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const kbd = (text) => el('kbd', null, text);

  // A stable colour per site, so "Gmail" is always the same tile.
  function hue(s) {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }

  function tile(item) {
    const t = el('span', 'tile');
    if (item.checkbox) {
      t.classList.add('bare');
      t.appendChild(el('span', `check${item.checked ? ' on' : ''}`));
    } else if (item.iconData) {
      const img = el('img');
      img.src = item.iconData;   // a data: URL main built with app.getFileIcon
      img.alt = '';
      t.appendChild(img);
    } else if (item.icon === 'link' && item.kind === 'shortcut') {
      const letter = el('span', 'letter', (item.title.trim()[0] || '?').toUpperCase());
      letter.style.background = `hsl(${hue(item.subtitle)} 55% 46%)`;
      t.appendChild(letter);
    } else {
      t.appendChild(Icons.make(item.icon));
    }
    return t;
  }

  function end(item, i) {
    const box = el('span', 'end');
    if (item.hint) {
      const hint = el('span', 'hint');
      hint.append(kbd('↵'), document.createTextNode(item.hint));
      box.appendChild(hint);
    }
    if (i < 8) box.appendChild(el('span', 'num', null)).appendChild(kbd(`${MOD} ${i + 1}`));
    if (item.toggle) box.appendChild(el('span', `switch${item.checked ? ' on' : ''}`));
    return box;
  }

  function row(item, i) {
    const li = el('li', 'row' + (item.kind === 'todo' && item.checked ? ' done' : '') + (item.enabled ? '' : ' off'));
    li.id = `r${i}`;
    li.dataset.kind = item.kind;
    li.dataset.icon = item.icon;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === sel));
    if (item.toggle) li.setAttribute('aria-checked', String(!!item.checked));

    const txt = el('span', 'txt');
    const title = el('div', 't');
    // A help example: main says how much of it is the command, by length.
    if (item.lead > 0) {
      title.classList.add('ex');
      title.append(el('span', 'lead', item.title.slice(0, item.lead)), document.createTextNode(item.title.slice(item.lead)));
    } else title.textContent = item.title;
    txt.append(title, el('div', 's', item.subtitle));
    li.append(tile(item), txt, end(item, i));
    li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; paintSelection(); } });
    li.addEventListener('click', () => run(i));
    return li;
  }

  // A titled group of rows. ARIA wants a listbox to hold options or groups, so a
  // section is a role="group" labelled by its visible header.
  function section(id, label, groupItems, groupRows) {
    const g = el('li', 'grp');
    g.setAttribute('role', 'group');
    const head = el('div', 'sec');
    head.id = `sec-${id.replace(/\W+/g, '-')}`;
    head.appendChild(el('span', null, label || id));
    if (id === 'today') {
      const done = groupItems.filter((x) => x.checked).length;
      head.appendChild(el('span', null, `${done} / ${groupItems.length}`));
    }
    g.setAttribute('aria-labelledby', head.id);
    const inner = el('ul', 'grp-rows');
    inner.setAttribute('role', 'none');
    inner.append(...groupRows);
    g.append(head, inner);
    return g;
  }

  function paintSelection() {
    rows.forEach((li, i) => li.setAttribute('aria-selected', String(i === sel)));
    const cur = rows[sel];
    if (cur) { input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); }
    const item = items[sel];
    tip.textContent = input.value && item && item.hint
      ? tipSelected.replace('{hint}', () => item.hint).replace('{title}', () => item.title)
      : emptyTip;
  }

  function render(next) {
    items = Array.isArray(next) ? next : [];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    rows = items.map(row);
    const nodes = [];
    for (let i = 0; i < items.length;) {
      const name = items[i].section;
      if (!name) { nodes.push(rows[i]); i += 1; continue; }
      let j = i;
      while (j < items.length && items[j].section === name) j += 1;
      nodes.push(section(name, items[i].sectionLabel, items.slice(i, j), rows.slice(i, j)));
      i = j;
    }
    list.replaceChildren(...nodes);
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
      // A help row answers with a starter ("todo ") for you to finish.
      if (r && typeof r.fill === 'string') { input.value = r.fill; sel = 0; input.focus(); await refresh(); }
    } finally { busy = false; }
  }

  function move(delta) {
    if (!items.length) return;
    sel = (sel + delta + items.length) % items.length;
    paintSelection();
  }

  // The pet in the header wears whatever coat it wears on the desktop.
  function drawPet(pet) {
    const P = window.PixelcatPreview;
    if (!P || !pet) return;
    try {
      if (pet.species === 'dog') {
        if (typeof DOG_PATTERNS !== 'undefined' && DOG_PATTERNS[pet.coat]) P.drawDog(petCanvas, DOG_PATTERNS[pet.coat], DOG_PATTERN_BUILD[pet.coat]);
      } else if (pet.theme) {
        P.draw(petCanvas, pet.theme, pet.theme.build, pet.theme.tabby);
      } else if (P.PATTERNS[pet.coat]) {
        P.draw(petCanvas, P.PATTERNS[pet.coat], P.PATTERN_BUILD[pet.coat], P.TABBY[pet.coat]);
      }
    } catch (e) { /* a missing coat just leaves the header plain */ }
  }

  function applyStrings(lang, strings) {
    if (lang) document.documentElement.lang = lang;
    const s = strings && typeof strings === 'object' ? strings : {};
    const str = (k) => (typeof s[k] === 'string' && s[k] ? s[k] : null);
    if (str('placeholder')) input.placeholder = str('placeholder');
    if (str('listLabel')) list.setAttribute('aria-label', str('listLabel'));
    for (const [k, node] of Object.entries(TEXT)) if (str(k)) node.textContent = str(k);
    if (str('tip')) emptyTip = str('tip');
    if (str('tipSelected')) tipSelected = str('tipSelected');
  }

  input.addEventListener('input', () => { sel = 0; refresh(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') { document.body.classList.add('alt'); return; }
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey) || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); if (input.value) { input.value = ''; sel = 0; refresh(); } else api.hide(); }
    // e.code, not e.key: on a Mac, Option+1 types a symbol, so e.key is never "1".
    else if (e.altKey && /^Digit[1-8]$/.test(e.code)) { e.preventDefault(); run(Number(e.code.slice(5)) - 1); }
  });
  input.addEventListener('keyup', (e) => { if (e.key === 'Alt') document.body.classList.remove('alt'); });

  // Running timers count down while the empty-query view is open.
  function startRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { if (!input.value && items.some((x) => x.kind === 'timer')) refresh(); }, REFRESH_MS);
  }
  window.addEventListener('blur', () => { clearInterval(refreshTimer); document.body.classList.remove('alt'); });

  api.onReset((state) => {
    const s = state || {};
    document.body.classList.toggle('solid', !s.glass);
    document.body.classList.toggle('still', !!s.still);
    document.body.classList.remove('enter');
    void document.body.offsetWidth;   // restart the open animation
    document.body.classList.add('enter');
    drawPet(s.pet);
    applyStrings(s.lang, s.strings);
    input.value = '';
    sel = 0;
    input.focus();
    refresh();
    startRefresh();
  });
  refresh();
})();
