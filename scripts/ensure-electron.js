// Runs before `npm test` (the "pretest" script).
//
// Electron downloads its binary lazily, the first time anything calls
// require('electron'). `node --test` runs test files in parallel, and several of
// them load a module that requires electron (config, themes, mail, ...). On a
// fresh install they all find the binary missing at once and race the same
// download; the losers die with "failed to create directory ... already exists"
// and take their whole test file with them. That made about half of all cold
// runs fail, on main too, with nothing wrong in the code under test.
//
// Loading it once here, serially, means the download (if any) is finished before
// the parallel files start. On a warm install this is a no-op.
require('electron');
