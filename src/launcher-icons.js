// Line icons for the Quick Tools launcher. Hand-drawn on a 24px grid as plain
// shape data and built with createElementNS, so there is no icon library, no
// external file, no innerHTML, and nothing the page's CSP has to allow.
//
// Every id used by src/tools/commands.js must exist here (tests/launcher-wiring
// checks it). Add a shape list to add an icon.
(() => {
  const P = (d) => ['path', { d }];
  const C = (cx, cy, r) => ['circle', { cx, cy, r }];
  const R = (x, y, width, height, rx = 2) => ['rect', { x, y, width, height, rx }];

  const SHAPES = {
    search: [C(11, 11, 7), P('M16.5 16.5L21 21')],
    lock: [R(5, 11, 14, 10), P('M8 11V7a4 4 0 0 1 8 0v4'), P('M12 15v2')],
    snip: [C(6, 6, 3), C(6, 18, 3), P('M20 4L8.1 15.9'), P('M14.5 14.5L20 20'), P('M8.1 8.1L12 12')],
    awake: [P('M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z'), P('M17 11h1.5a2.5 2.5 0 0 1 0 5H17'), P('M8 3v3'), P('M12 3v3')],
    notes: [R(5, 3, 14, 18), P('M9 8h6'), P('M9 12h6'), P('M9 16h3')],
    note: [P('M4 20h4L19 9l-4-4L4 16z'), P('M13.5 6.5l4 4')],
    clipboard: [R(6, 4, 12, 17), R(9, 2, 6, 4, 1), P('M9 12h6'), P('M9 16h4')],
    break: [C(7, 9, 1.6), C(10.5, 5.5, 1.6), C(14.5, 5.5, 1.6), C(18, 9, 1.6), P('M12 11c-3 0-5.5 3-5.5 5.5 0 2 1.6 3 3 3 1 0 1.6-.6 2.5-.6s1.5.6 2.5.6c1.4 0 3-1 3-3C17.5 14 15 11 12 11z')],
    settings: [C(12, 12, 3), C(12, 12, 7), P('M12 2v3'), P('M12 19v3'), P('M2 12h3'), P('M19 12h3'), P('M4.9 4.9L7 7'), P('M17 17l2.1 2.1'), P('M4.9 19.1L7 17'), P('M17 7l2.1-2.1')],
    calc: [R(5, 3, 14, 18), R(8, 6, 8, 4, 1), P('M8.5 14h.01'), P('M12 14h.01'), P('M15.5 14h.01'), P('M8.5 17.5h.01'), P('M12 17.5h.01'), P('M15.5 17.5h.01')],
    convert: [P('M4 8h15'), P('M15 4l4 4-4 4'), P('M20 16H5'), P('M9 12l-4 4 4 4')],
    todo: [R(4, 4, 16, 16, 4), P('M8.5 12.5l2.5 2.5 4.5-5')],
    timer: [C(12, 13, 8), P('M12 9v4l2.5 2.5'), P('M9 2h6'), P('M12 2v3')],
    link: [C(12, 12, 9), P('M3 12h18'), P('M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18')],
    mail: [R(3, 5, 18, 14), P('M3 7.5l9 6 9-6')],
    folder: [P('M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z')],
    file: [P('M6 3h8l5 5v13H6z'), P('M14 3v5h5')],
    app: [R(4, 4, 7, 7), R(13, 4, 7, 7), R(4, 13, 7, 7), R(13, 13, 7, 7)],
    text: [P('M5 7V5h14v2'), P('M12 5v14'), P('M9 19h6')],
    snippet: [P('M6 3h12v18l-6-4-6 4z'), P('M9.5 8h5'), P('M9.5 11.5h3')],
    info: [C(12, 12, 9), P('M12 11v5'), P('M12 8h.01')],
  };

  const NS = 'http://www.w3.org/2000/svg';
  function make(id) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of SHAPES[id] || SHAPES.info) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      svg.appendChild(el);
    }
    return svg;
  }

  window.LauncherIcons = { make, ids: Object.keys(SHAPES) };
})();
