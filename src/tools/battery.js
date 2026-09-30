// Low-battery alert rule. The overlay reports { level: 0..1, charging } from
// navigator.getBattery(); this decides when that is worth saying out loud.
// Hysteresis: alert once when a discharging battery reaches 20%, then stay quiet
// until it is charging or back above 25%, so a level bouncing around 20% speaks once.

const ALERT_AT = 0.2;
const REARM_AT = 0.25;

function batteryEdge(armed, reading) {
  const level = reading && Number(reading.level);
  if (!Number.isFinite(level) || level < 0 || level > 1) return { alert: false, armed };
  if (reading.charging || level >= REARM_AT) return { alert: false, armed: true };
  if (armed && level <= ALERT_AT) return { alert: true, armed: false };
  return { alert: false, armed };
}

module.exports = { batteryEdge, ALERT_AT };
