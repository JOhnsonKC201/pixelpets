// Which native "glass" the OS can draw behind the Quick Tools launcher, and the
// BrowserWindow options for it. Pure (no electron import) so it can be tested
// without loading Electron: a test that requires electron joins the race for
// Electron's lazy binary download on a fresh install.
const os = require('os');

const WIN11_22H2 = 22621;   // first Windows build with DWM backdrop materials (acrylic)

// Windows 11 22H2+ gets acrylic, macOS gets vibrancy; anything older gets a solid
// panel, which the page learns about through the reset state (glass: false).
function glassFor(platform = process.platform, release = os.release()) {
  if (platform === 'darwin') return 'vibrancy';
  if (platform === 'win32' && Number(String(release).split('.')[2]) >= WIN11_22H2) return 'acrylic';
  return null;
}

function materialOptions(glass) {
  if (glass === 'acrylic') return { backgroundColor: '#00000000', backgroundMaterial: 'acrylic', roundedCorners: true };
  if (glass === 'vibrancy') return { transparent: true, backgroundColor: '#00000000', vibrancy: 'popover', visualEffectState: 'active', roundedCorners: true };
  return { backgroundColor: '#1b1d24', roundedCorners: true };
}

module.exports = { glassFor, materialOptions };
