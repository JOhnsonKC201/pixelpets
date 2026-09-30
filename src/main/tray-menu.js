// The tray menu, as a plain template.
//
// Pure: takes what the menu shows and what its items do, returns the array
// Menu.buildFromTemplate() wants. main.js owns the Tray and rebuilds the menu
// whenever something it shows changes; tests/tray-menu.test.js clicks through
// it without Electron.
//
// Checkmarks read the config the menu was built from. Clicks read the config
// at click time through getCfg(), so a click always toggles the live value.

const MOODS = [
  ['cozy', 'Cozy café'], ['dreamy', 'Dreamy'], ['upbeat', 'Upbeat lounge'],
  ['focus', 'Deep focus'], ['rain', 'Rainy study'], ['sleepy', 'Sleepy night'],
];

// Preset play areas, as fractions of the display.
const PLAY_AREAS = [
  ['Bottom strip', { x: 0, y: 0.78, w: 1, h: 0.22 }],
  ['Top strip', { x: 0, y: 0, w: 1, h: 0.25 }],
  ['Left third', { x: 0, y: 0, w: 0.34, h: 1 }],
  ['Right third', { x: 0.66, y: 0, w: 0.34, h: 1 }],
  ['Bottom-right', { x: 0.6, y: 0.55, w: 0.4, h: 0.45 }],
];

// Settings that default to ON are stored only when turned off.
const onUnlessOff = (key) => (c) => !(c && c[key] === false);
const onIfSet = (key) => (c) => !!(c && c[key]);

/**
 * @param {object} s  what the menu shows
 * @param {object|null} s.cfg          config the menu is built from
 * @param {() => object} s.getCfg      live config, read on click
 * @param {object} s.species           speciesOf(cfg.species) from pets.js
 * @param {Array} s.speciesList        [{ id, emoji, label }]
 * @param {string[]} s.coatNames       built-in coats for the species, plus custom coats for cats
 * @param {Array} s.recent             newest-first notifications [{ ts, message }]
 * @param {(ts: number) => string} s.relTime
 * @param {boolean} s.onBattery
 * @param {boolean} s.lowPowerOn       the effective low-power flag
 * @param {Array} s.toolItems          Quick Tools' own tray items
 * @param {object} a  what the items do
 */
function buildTrayTemplate(s, a) {
  const { cfg, getCfg, species: sp } = s;
  const persist = (patch) => a.persist({ ...getCfg(), ...patch });
  const toggle = (label, key, isOn) => ({
    label, type: 'checkbox', checked: isOn(cfg),
    click: () => persist({ [key]: !isOn(getCfg()) }),
  });

  const isDogCfg = sp.id === 'dog';
  const coatField = isDogCfg ? 'dogPattern' : 'pattern';
  const curCoat = cfg ? cfg[coatField] : 0;
  const coatItems = s.coatNames.map((name, i) => ({
    label: name, type: 'radio', checked: curCoat === i,
    click: () => persist({ [coatField]: i }),
  }));
  const speciesItems = s.speciesList.map(({ id, emoji, label }) => ({
    label: `${emoji}  ${label}`, type: 'radio', checked: sp.id === id,
    click: () => persist({ species: id }),
  }));
  const recentItems = s.recent.length
    ? s.recent.map((n) => ({
        label: s.relTime(n.ts) + ' - ' + String(n.message || '').replace(/\s+/g, ' ').slice(0, 48),
        click: () => a.renotify(n),   // re-show as a bubble
      })).concat([{ type: 'separator' }, { label: 'Clear', click: a.clearRecent }])
    : [{ label: '(nothing yet)', enabled: false }];

  // Captured at build time, as it always was: the menu is rebuilt on every change.
  const lj = (cfg && cfg.lobbyJam) || { on: false, mood: 'cozy' };

  return [
    { label: 'Settings…', click: a.openSettings },
    { label: 'Start break now', click: a.triggerBreak },
    { label: sp.giveLabel, click: a.giveTreat },
    { label: 'Recent notifications', submenu: recentItems },
    { label: 'Snooze last reminder', submenu: [5, 10, 30].map((m) => ({ label: `${m} minutes`, click: () => a.snooze(m) })) },
    { type: 'separator' },
    ...s.toolItems,
    { type: 'separator' },
    { label: 'Pet', submenu: speciesItems },
    { label: sp.coatNoun, submenu: coatItems },
    toggle('Follow cursor', 'followCursor', onIfSet('followCursor')),
    toggle('Mouse hunt', 'huntOn', onIfSet('huntOn')),
    toggle(sp.playToggleLabel, 'butterflyOn', onUnlessOff('butterflyOn')),
    toggle('Mood reactions', 'moodOn', onUnlessOff('moodOn')),
    toggle('Startle at cursor', 'startleOn', onUnlessOff('startleOn')),
    { label: 'Mood', submenu: [
      { label: 'Zoomies!', click: () => a.sendMood('zoomies') },
      { label: 'Calm down', click: () => a.sendMood('calm') },
    ] },
    { label: 'Pomodoro', type: 'checkbox', checked: !!(cfg && cfg.pomodoro && cfg.pomodoro.on), click: () => {
      const c = getCfg();
      persist({ pomodoro: { ...c.pomodoro, on: !(c.pomodoro && c.pomodoro.on) } });
    } },
    { label: 'Play area', submenu: [
      { label: 'Whole screen', type: 'radio', checked: !(cfg && cfg.playArea), click: () => persist({ playArea: null }) },
      ...PLAY_AREAS.map(([label, area]) => ({ label, click: () => persist({ playArea: area }) })),
      { type: 'separator' },
      { label: 'Set play area (drag)…', click: a.startSetArea },
    ] },
    toggle('Always on top', 'onTop', onUnlessOff('onTop')),
    toggle('Wander', 'roamOn', onUnlessOff('roamOn')),
    toggle(`Work mode (stay put, no ${sp.playNoun})`, 'workMode', onIfSet('workMode')),
    { label: 'Rest corner', submenu: [
      { label: 'Bottom-left', type: 'radio', checked: !!(cfg && cfg.restSide === 'left'), click: () => persist({ restSide: 'left' }) },
      { label: 'Bottom-right', type: 'radio', checked: !(cfg && cfg.restSide === 'left'), click: () => persist({ restSide: 'right' }) },
      { type: 'separator' },
      // Dragging the pet somewhere makes that spot its home, and the radios above
      // cannot undo that on their own: re-picking the corner already selected
      // changes no setting, so the overlay never hears about it. This is the way back.
      { label: 'Send it home (forget the drop spot)', click: () => a.sendAction('home') },
    ] },
    toggle('Stay on the floor', 'floorLock', onUnlessOff('floorLock')),
    // Checked shows the EFFECTIVE flag (it may be on because of the battery); the
    // click flips the user's own setting.
    { label: s.onBattery ? 'Low power mode (on battery)' : 'Low power mode', type: 'checkbox', checked: s.lowPowerOn,
      click: () => persist({ lowPower: !onIfSet('lowPower')(getCfg()) }) },
    toggle('Sound', 'soundOn', onIfSet('soundOn')),
    { label: '🎸 Lobby Jam', submenu: [
      { label: 'Play music', type: 'checkbox', checked: !!lj.on, click: () => persist({ lobbyJam: { ...lj, on: !lj.on } }) },
      { type: 'separator' },
      // Picking a mood sets the MOOD. It used to also force on:true, so clicking
      // the mood you already had selected, the most natural way to check which one
      // is active, started the music you had deliberately left off.
      ...MOODS.map(([id, label]) => ({ label, type: 'radio', checked: (lj.mood || 'cozy') === id,
        click: () => persist({ lobbyJam: { ...lj, mood: id } }) })),
    ] },
    { type: 'separator' },
    { label: 'Report a problem…', click: a.openReport },
    { label: 'Quit pixelpets', click: a.quit },
  ];
}

module.exports = { buildTrayTemplate };
