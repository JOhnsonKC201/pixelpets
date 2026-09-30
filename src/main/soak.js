// `--soak=<minutes>`: run the pet normally, sample every process's memory and
// CPU, then print how they moved and quit. A desktop pet runs for days, so a
// slow leak or a busy loop is the failure that matters and the one a short
// test never sees. See docs/development.md, "Checking for leaks".

const SAMPLE_MS = 30000;
const KB = 1024;

/**
 * Summarise getAppMetrics() samples by process type.
 * Memory is the working set in MB; CPU is percent of one core.
 * @param {Array<{ t: number, metrics: object[] }>} samples
 */
function summarise(samples) {
  const byType = new Map();
  for (const { metrics } of samples) {
    const seen = new Map();
    for (const m of metrics) {
      const cur = seen.get(m.type) || { mem: 0, cpu: 0 };
      cur.mem += (m.memory && m.memory.workingSetSize) || 0;
      cur.cpu += (m.cpu && m.cpu.percentCPUUsage) || 0;
      seen.set(m.type, cur);
    }
    for (const [type, v] of seen) {
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(v);
    }
  }
  const rows = [];
  for (const [type, series] of byType) {
    const mem = series.map((v) => v.mem / KB);
    const cpu = series.map((v) => v.cpu);
    // Compare the first and last quarter, not two single samples: a GC landing
    // on either end would otherwise read as a leak or a recovery.
    const q = Math.max(1, Math.floor(mem.length / 4));
    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    rows.push({
      type,
      startMB: round(avg(mem.slice(0, q))),
      endMB: round(avg(mem.slice(-q))),
      peakMB: round(Math.max(...mem)),
      avgCPU: round(avg(cpu)),
      peakCPU: round(Math.max(...cpu)),
    });
  }
  return rows;
}

const round = (x) => Math.round(x * 10) / 10;

/**
 * @param {object} d
 * @param {object} d.app       Electron app
 * @param {number} d.minutes
 * @param {(line: string) => void} d.print
 */
function startSoak({ app, minutes, print }) {
  const samples = [];
  const take = () => samples.push({ t: Date.now(), metrics: app.getAppMetrics() });
  take();
  const timer = setInterval(take, SAMPLE_MS);
  setTimeout(() => {
    clearInterval(timer);
    take();
    print(`[soak] ${minutes} min, ${samples.length} samples`);
    for (const r of summarise(samples)) {
      print(`[soak] ${r.type.padEnd(10)} memory ${r.startMB} -> ${r.endMB} MB (peak ${r.peakMB})  cpu avg ${r.avgCPU}% peak ${r.peakCPU}%`);
    }
    app.quit();
  }, minutes * 60000);
}

module.exports = { startSoak, summarise };
