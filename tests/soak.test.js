const test = require('node:test');
const assert = require('node:assert');
const { summarise } = require('../src/main/soak');
const { parseCli } = require('../src/main/cli');

// One getAppMetrics() entry. workingSetSize is in KB, as Electron reports it.
const proc = (type, mb, cpu) => ({ type, memory: { workingSetSize: mb * 1024 }, cpu: { percentCPUUsage: cpu } });

test('memory is compared quarter to quarter, per process type', () => {
  const samples = [100, 100, 101, 102, 104, 106, 108, 110].map((mb, i) => ({
    t: i, metrics: [proc('Browser', 80, 0.1), proc('Tab', mb, 2)],
  }));
  const rows = summarise(samples);
  const tab = rows.find((r) => r.type === 'Tab');
  assert.deepStrictEqual(tab, { type: 'Tab', startMB: 100, endMB: 109, peakMB: 110, avgCPU: 2, peakCPU: 2 });
  assert.strictEqual(rows.find((r) => r.type === 'Browser').endMB, 80);
});

test('processes of the same type are added together', () => {
  const rows = summarise([{ t: 0, metrics: [proc('Utility', 20, 1), proc('Utility', 30, 1)] }]);
  assert.deepStrictEqual(rows, [{ type: 'Utility', startMB: 50, endMB: 50, peakMB: 50, avgCPU: 2, peakCPU: 2 }]);
});

test('--soak takes minutes, is off by default and capped at a day', () => {
  assert.strictEqual(parseCli([]).soakMinutes, 0);
  assert.strictEqual(parseCli(['--soak=90']).soakMinutes, 90);
  assert.strictEqual(parseCli(['--soak=forever']).soakMinutes, 0);
  assert.strictEqual(parseCli(['--soak=100000']).soakMinutes, 24 * 60);
});
