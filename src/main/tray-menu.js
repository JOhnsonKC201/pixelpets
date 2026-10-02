// The tray menu, as a plain template.
//
// Pure: takes what the menu shows and what its items do, returns the array
// Menu.buildFromTemplate() wants. main.js owns the Tray and rebuilds the menu
// whenever something it shows changes; tests/tray-menu.test.js clicks through
// it without Electron.
//
// Checkmarks read the config the menu was built from. Clicks read the config
// at click time through getCfg(), so a click always toggles the live value.
//
// Every label comes from s.t (src/i18n.js), English when a caller passes none.

const { translator, FALLBACK } = require('../i18n');

const MOODS = ['cozy', 'dreamy', 'upbeat', 'focus', 'rain', 'sleepy'];

// Preset play areas, as fractions of the display.
const PLAY_AREAS = [
  ['tray.area.bottomStrip', { x: 0, y: 0.78, w: 1, h: 0.22 }],
  ['tray.area.topStrip', { x: 0, y: 0, w: 1, h: 0.25 }],
  ['tray.area.leftThird', { x: 0, y: 0, w: 0.34, h: 1 }],
  ['tray.area.rightThird', { x: 0.66, y: 0, w: 0.34, h: 1 }],
  ['tray.bottomRight', { x: 0.6, y: 0.55, w: 0.4, h: 0.45 }],
];

// Settings that default to ON are stored only when turned off.
const onUnlessOff = (key) => (c) => !(c && c[key] === false);
const onIfSet = (key) => (c) => !!(c && c[key]);

/**
 * @param {object} s  what the menu shows
 * @param {object|null} s.cfg          config the menu is built from
 * @param {() => object} s.getCfg      live config, read on click
 * @param {object} s.species           speciesOf(cfg.species) from pets.js
 * @param {Array} s.speciesList        [{ id, emoji }]
 * @param {string[]} s.coatNames       coat labels as shown: built-in coats, plus custom coats for cats
 * @param {(key: string, vars?: object) => string} [s.t]  the user's language
 * @param {Array} s.recent             newest-first notifications [{ ts, message }]
 * @param {(ts: number) => string} s.relTime
 * @param {boolean} s.onBattery
 * @param {boolean} s.lowPowerOn       the effective low-power flag
 * @param {Array} s.toolItems          Quick Tools' own tray items
 * @param {object} a  what the items do
 */
function buildTrayTemplate(s, a) {
  const { cfg, getCfg, species: sp } = s;
  const t = typeof s.t === 'function' ? s.t : translator(FALLBACK);
  const pet = (word) => t(`pet.${sp.id}.${word}`);
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
  const speciesItems = s.speciesList.map(({ id, emoji }) => ({
    label: `${emoji}  ${t(`pet.${id}.label`)}`, type: 'radio', checked: sp.id === id,
    click: () => persist({ species: id }),
  }));
  const recentItems = s.recent.length
    ? s.recent.map((n) => ({
        label: s.relTime(n.ts) + ' - ' + String(n.message || '').replace(/\s+/g, ' ').slice(0, 48),
        click: () => a.renotify(n),   // re-show as a bubble
      })).concat([{ type: 'separator' }, { label: t('tray.recentClear'), click: a.clearRecent }])
    : [{ label: t('tray.recentEmpty'), enabled: false }];

  // Captured at build time, as it always was: the menu is rebuilt on every change.
  const lj = (cfg && cfg.lobbyJam) || { on: false, mood: 'cozy' };

  return [
    { label: t('tray.settings'), click: a.openSettings },
    { label: t('tray.break'), click: a.triggerBreak },
    { label: pet('give'), click: a.giveTreat },
    { label: t('tray.recent'), submenu: recentItems },
    { label: t('tray.snooze'), submenu: [5, 10, 30].map((m) => ({ label: t('tray.minutes', { n: m }), click: () => a.snooze(m) })) },
    { type: 'separator' },
    ...s.toolItems,
    { type: 'separator' },
    { label: t('tray.pet'), submenu: speciesItems },
    { label: pet('coatNoun'), submenu: coatItems },
    toggle(t('tray.followCursor'), 'followCursor', onIfSet('followCursor')),
    toggle(t('tray.hunt'), 'huntOn', onIfSet('huntOn')),
    toggle(pet('playToggle'), 'butterflyOn', onUnlessOff('butterflyOn')),
    toggle(t('tray.moodReactions'), 'moodOn', onUnlessOff('moodOn')),
    toggle(t('tray.startle'), 'startleOn', onUnlessOff('startleOn')),
    { label: t('tray.mood'), submenu: [
      { label: t('tray.zoomies'), click: () => a.sendMood('zoomies') },
      { label: t('tray.calm'), click: () => a.sendMood('calm') },
    ] },
    { label: t('tray.pomodoro'), type: 'checkbox', checked: !!(cfg && cfg.pomodoro && cfg.pomodoro.on), click: () => {
      const c = getCfg();
      persist({ pomodoro: { ...c.pomodoro, on: !(c.pomodoro && c.pomodoro.on) } });
    } },
    { label: t('tray.playArea'), submenu: [
      { label: t('tray.wholeScreen'), type: 'radio', checked: !(cfg && cfg.playArea), click: () => persist({ playArea: null }) },
      ...PLAY_AREAS.map(([key, area]) => ({ label: t(key), click: () => persist({ playArea: area }) })),
      { type: 'separator' },
      { label: t('tray.setArea'), click: a.startSetArea },
    ] },
    toggle(t('tray.onTop'), 'onTop', onUnlessOff('onTop')),
    toggle(t('tray.wander'), 'roamOn', onUnlessOff('roamOn')),
    toggle(t('tray.workMode', { toy: pet('playNoun') }), 'workMode', onIfSet('workMode')),
    { label: t('tray.restCorner'), submenu: [
      { label: t('tray.bottomLeft'), type: 'radio', checked: !!(cfg && cfg.restSide === 'left'), click: () => persist({ restSide: 'left' }) },
      { label: t('tray.bottomRight'), type: 'radio', checked: !(cfg && cfg.restSide === 'left'), click: () => persist({ restSide: 'right' }) },
      { type: 'separator' },
      // Dragging the pet somewhere makes that spot its home, and the radios above
      // cannot undo that on their own: re-picking the corner already selected
      // changes no setting, so the overlay never hears about it. This is the way back.
      { label: t('tray.sendHome'), click: () => a.sendAction('home') },
    ] },
    toggle(t('tray.floor'), 'floorLock', onUnlessOff('floorLock')),
    // Checked shows the EFFECTIVE flag (it may be on because of the battery); the
    // click flips the user's own setting.
    { label: t(s.onBattery ? 'tray.lowPowerBattery' : 'tray.lowPower'), type: 'checkbox', checked: s.lowPowerOn,
      click: () => persist({ lowPower: !onIfSet('lowPower')(getCfg()) }) },
    toggle(t('tray.sound'), 'soundOn', onIfSet('soundOn')),
    { label: `🎸 ${t('tray.jam')}`, submenu: [
      { label: t('tray.playMusic'), type: 'checkbox', checked: !!lj.on, click: () => persist({ lobbyJam: { ...lj, on: !lj.on } }) },
      { type: 'separator' },
      // Picking a mood sets the MOOD. It used to also force on:true, so clicking
      // the mood you already had selected, the most natural way to check which one
      // is active, started the music you had deliberately left off.
      ...MOODS.map((id) => ({ label: t(`jam.${id}`), type: 'radio', checked: (lj.mood || 'cozy') === id,
        click: () => persist({ lobbyJam: { ...lj, mood: id } }) })),
    ] },
    { type: 'separator' },
    { label: t('tray.report'), click: a.openReport },
    { label: t('tray.quit'), click: a.quit },
  ];
}

module.exports = { buildTrayTemplate };
