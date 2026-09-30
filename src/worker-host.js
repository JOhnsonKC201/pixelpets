// Run a one-shot worker: start it, send it one job, take its one answer.
//
// The mail and calendar checks talk to servers somebody else controls, so they
// run in a separate process that can crash, hang or be killed without taking the
// pet with it.
//
// Inside Electron this uses utilityProcess, a Node process Electron manages
// itself. It used to be child_process.fork with ELECTRON_RUN_AS_NODE, which
// only works while the packaged app can still be run as plain Node; that
// ability is switched off in release builds (the RunAsNode fuse, see
// package.json build.electronFuses) because anything on the machine could use
// it to run code as pixelpets. Outside Electron (tests, scripts) it falls back
// to child_process.fork.

function electronUtilityProcess() {
  try {
    const electron = require('electron');
    return electron && typeof electron === 'object' && electron.utilityProcess ? electron.utilityProcess : null;
  } catch (e) { return null; }
}

/**
 * @param {string} file        absolute path of the worker script
 * @param {object} job         the one message the worker gets
 * @param {object} opts
 * @param {number} opts.timeoutMs
 * @param {string} opts.name   used in the fallback error messages ("mail", "calendar")
 * @param {string} opts.timeoutError
 * @param {(res: object) => void} cb   called exactly once
 */
function runWorker(file, job, { timeoutMs, name, timeoutError }, cb) {
  let done = false, child = null;
  const finish = (res) => {
    if (done) return;
    done = true;
    clearTimeout(watchdog);
    try { if (child) child.kill(); } catch (e) { /* gone */ }
    cb(res);
  };
  const utility = electronUtilityProcess();
  try {
    if (utility) {
      child = utility.fork(file, [], { stdio: 'ignore', serviceName: `pixelpets ${name} check` });
    } else {
      child = require('child_process').fork(file, [], { stdio: 'ignore' });
    }
  } catch (e) {
    cb({ ok: false, error: `Could not start the ${name} worker.` });
    return;
  }
  const watchdog = setTimeout(() => finish({ ok: false, error: timeoutError }), timeoutMs);
  child.on('message', (msg) => finish(msg));
  child.on('error', () => finish({ ok: false, error: `${capitalise(name)} worker failed.` }));
  child.on('exit', () => finish({ ok: false, error: `${capitalise(name)} worker exited.` }));
  try {
    if (utility) child.postMessage(job);
    else child.send(job);
  } catch (e) {
    finish({ ok: false, error: `Could not reach the ${name} worker.` });
  }
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

module.exports = { runWorker };
