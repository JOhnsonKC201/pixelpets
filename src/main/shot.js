// `--shot`: render the overlay once, save a PNG and quit. It is how QA previews
// are made, and it is the boot check CI runs against both the source tree and
// the packaged app, so it has to fail loudly: a page that did not load, or a
// canvas with nothing on it, exits non-zero instead of saving a blank picture
// that looks like success.

// Counts pixels the pet actually drew. Sampling every 7th pixel is plenty for
// a sprite hundreds of pixels across.
const PAINTED_PIXELS = `(() => {
  const c = document.getElementById('cat');
  if (!c) return -1;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i]) n++;
  return n;
})()`;

/**
 * @param {object} d
 * @param {object} d.app
 * @param {object} d.win        the overlay window, already loading
 * @param {number} d.delayMs    how long to let the scene animate first
 * @param {string} d.out        where the PNG goes
 * @param {object} d.fs
 */
function captureShot({ app, win, delayMs, out, fs }) {
  const fail = (why) => { console.error(`[shot] FAILED: ${why}`); app.exit(1); };
  win.webContents.on('did-fail-load', (_e, code, description, url) => fail(`page did not load (${code} ${description}) ${url}`));
  win.webContents.on('render-process-gone', (_e, details) => fail(`renderer gone (${details.reason})`));
  win.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const painted = await win.webContents.executeJavaScript(PAINTED_PIXELS);
        if (painted < 0) return fail('the overlay page has no #cat canvas');
        if (painted === 0) return fail('the canvas is empty: nothing was drawn');
        const img = await win.webContents.capturePage();
        fs.writeFileSync(out, img.toPNG());
        console.log(`[captured ${out}] ${painted} painted samples`);
        app.quit();
      } catch (e) {
        fail(e && e.message ? e.message : String(e));
      }
    }, delayMs);
  });
}

module.exports = { captureShot };
