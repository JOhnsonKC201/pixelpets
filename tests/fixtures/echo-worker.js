// A worker for tests/worker-host.test.js. The job says what to do.
const { onJob, reply, exitSoon } = require('../../src/worker-port');

onJob((job) => {
  if (job.mode === 'echo') { reply({ ok: true, echo: job.value }); exitSoon(); return; }
  if (job.mode === 'silent-exit') { process.exit(0); return; }
  // 'hang': stay alive and never answer, like a stuck socket; the host's
  // watchdog has to end it.
  setInterval(() => {}, 1000);
});
