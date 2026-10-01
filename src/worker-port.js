// The worker's side of worker-host.js: receive one job, send one answer, exit.
//
// Under Electron's utilityProcess the channel is process.parentPort; under a
// plain child_process.fork (tests) it is process.send / process.on('message').

// Sending is asynchronous on both channels, so give the answer a moment to
// leave before the process ends. The host kills the worker as soon as the
// answer arrives anyway; this only matters if the host is slow.
const EXIT_GRACE_MS = 200;

/** True when this process was started as a worker, by either route. */
function isWorkerProcess() {
  return !!process.parentPort || typeof process.send === 'function';
}

/** Run `handler` on the one job this worker gets. */
function onJob(handler) {
  if (process.parentPort) process.parentPort.once('message', (e) => handler(e.data));
  else process.once('message', handler);
}

/** Send the answer. Never throws: the parent may already be gone. */
function reply(message) {
  try {
    if (process.parentPort) process.parentPort.postMessage(message);
    else process.send(message);
  } catch (e) { /* parent gone */ }
}

/** End the process once a reply has had time to leave. */
function exitSoon() {
  setTimeout(() => process.exit(0), EXIT_GRACE_MS);
}

module.exports = { isWorkerProcess, onJob, reply, exitSoon };
