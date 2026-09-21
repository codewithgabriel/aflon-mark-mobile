/*
 * Exercises the offline queue the way a device actually drives it.
 * Loaded by tests/offline/run.mjs against the compiled utils/offlineSync.ts.
 */
const assert = require('assert');
const S = require('./offlineSync');
const api = require('./api');
const storage = require('@react-native-async-storage/async-storage');

let passed = 0, failed = 0;
const results = [];
async function test(name, fn) {
  storage.__store.clear();
  api.__state.calls = [];
  api.__state.handler = async () => ({ message: 'ok' });
  try { await fn(); passed++; results.push(`  ok   ${name}`); }
  catch (e) { failed++; results.push(`  FAIL ${name}\n         ${e.message}`); }
}

const { APIError } = api;

// Mon–Fri standard 09:00/11:00/15:00/20:00, Friday closes early, Sunday off.
const schedule = {
  timezone: 'Africa/Lagos',
  defaults: { checkInEnd: '09:00', checkInClose: '11:00', checkOutStart: '15:00', checkOutEnd: '20:00' },
  days: {
    sun: { working: false, mode: 'default' },
    mon: { working: true, mode: 'default' },
    tue: { working: true, mode: 'default' },
    wed: { working: true, mode: 'default' },
    thu: { working: true, mode: 'default' },
    fri: { working: true, mode: 'custom', checkInEnd: '08:30', checkInClose: '10:00', checkOutStart: '12:30', checkOutEnd: '14:00' },
    sat: { working: false, mode: 'default' },
  },
};

// Local wall-clock helpers (the harness runs in the machine's own zone, which
// is what a device would use too).
const at = (dateStr, hh, mm) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
};
const THU = '2026-09-17', FRI = '2026-09-18', SUN = '2026-09-20';

(async () => {

/* ── local date, not UTC ─────────────────────────────────────────────── */

await test('getTodayDateString uses the local calendar date', () => {
  // 00:30 local. Under the old UTC-based implementation this returned the
  // previous day for any zone ahead of UTC.
  assert.strictEqual(S.getTodayDateString(at(FRI, 0, 30)), '2026-09-18');
  assert.strictEqual(S.getTodayDateString(at(FRI, 23, 45)), '2026-09-18');
});

/* ── schedule resolution ─────────────────────────────────────────────── */

await test('resolveDaySchedule applies the Friday override', () => {
  const d = S.resolveDaySchedule(schedule, at(FRI, 10, 0));
  assert.strictEqual(d.dayKey, 'fri');
  assert.strictEqual(d.dayLabel, 'Friday');
  assert.strictEqual(d.checkOutStart, '12:30');
  assert.strictEqual(d.checkInEnd, '08:30');
});

await test('resolveDaySchedule falls back to the standard window', () => {
  const d = S.resolveDaySchedule(schedule, at(THU, 10, 0));
  assert.strictEqual(d.checkOutStart, '15:00');
  assert.strictEqual(d.checkInEnd, '09:00');
});

await test('resolveDaySchedule survives a null schedule', () => {
  const d = S.resolveDaySchedule(null, at(THU, 10, 0));
  assert.strictEqual(d.checkInEnd, '09:00');
  assert.strictEqual(d.working, true);
});

/* ── local rule evaluation ───────────────────────────────────────────── */

const evalAt = (action, when, todayStatus = null) =>
  S.evaluateScanLocally({ action, schedule, todayStatus, when });

await test('check-in before the deadline is Early', () => {
  const r = evalAt('IN', at(THU, 8, 30));
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.status, 'Early');
});

await test('check-in inside the grace window is OnTime', () => {
  const r = evalAt('IN', at(THU, 10, 0));
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.status, 'OnTime');
});

await test('check-in after the window closes is refused with a reason', () => {
  const r = evalAt('IN', at(THU, 11, 30));
  assert.strictEqual(r.allowed, false);
  assert.match(r.reason, /closed at 11:00/);
});

await test('Friday uses its own, earlier check-in deadline', () => {
  assert.strictEqual(evalAt('IN', at(FRI, 8, 0)).status, 'Early');
  assert.strictEqual(evalAt('IN', at(FRI, 9, 0)).status, 'OnTime');
  const late = evalAt('IN', at(FRI, 10, 30));
  assert.strictEqual(late.allowed, false);
  assert.match(late.reason, /Friday/);
});

await test('check-out before the window opens is refused', () => {
  const status = { date: THU, checkInTime: at(THU, 8, 0).toISOString(), checkOutTime: null, status: 'checkedIn' };
  const r = evalAt('OUT', at(THU, 12, 0), status);
  assert.strictEqual(r.allowed, false);
  assert.match(r.reason, /opens at 15:00/);
});

await test('Friday check-out opens earlier than the rest of the week', () => {
  const status = { date: FRI, checkInTime: at(FRI, 8, 0).toISOString(), checkOutTime: null, status: 'checkedIn' };
  assert.strictEqual(evalAt('OUT', at(FRI, 13, 0), status).allowed, true);
  const late = evalAt('OUT', at(FRI, 15, 0), status);
  assert.strictEqual(late.allowed, false);
  assert.match(late.reason, /closed at 14:00/);
});

await test('check-out with no check-in is refused', () => {
  const r = evalAt('OUT', at(THU, 16, 0));
  assert.strictEqual(r.allowed, false);
  assert.match(r.reason, /No check-in found/);
});

await test('a second check-in on the same day is refused', () => {
  const status = { date: THU, checkInTime: at(THU, 8, 0).toISOString(), checkOutTime: null, status: 'checkedIn' };
  assert.strictEqual(evalAt('IN', at(THU, 9, 0), status).allowed, false);
});

await test('a second check-out on the same day is refused', () => {
  const status = { date: THU, checkInTime: at(THU, 8, 0).toISOString(), checkOutTime: at(THU, 16, 0).toISOString(), status: 'complete' };
  assert.strictEqual(evalAt('OUT', at(THU, 17, 0), status).allowed, false);
});

await test('yesterday\'s cached status does not block today\'s check-in', () => {
  const stale = { date: '2026-09-16', checkInTime: at(THU, 8, 0).toISOString(), checkOutTime: null, status: 'checkedIn' };
  assert.strictEqual(evalAt('IN', at(THU, 8, 30), stale).allowed, true);
});

await test('a non-working day accepts a scan at any hour', () => {
  assert.strictEqual(evalAt('IN', at(SUN, 19, 0)).allowed, true);
  const status = { date: SUN, checkInTime: at(SUN, 6, 0).toISOString(), checkOutTime: null, status: 'checkedIn' };
  assert.strictEqual(evalAt('OUT', at(SUN, 9, 0), status).allowed, true);
});

/* ── queueing ────────────────────────────────────────────────────────── */

await test('enqueue stores the scan and updates the cached status', async () => {
  const when = at(THU, 8, 15);
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'static-wall-qr', action: 'IN', localStatus: 'Early', when });

  const queue = await S.getPendingOfflineScans();
  assert.strictEqual(queue.length, 1);
  assert.strictEqual(queue[0].action, 'IN');
  assert.strictEqual(queue[0].timestamp, when.toISOString());
  assert.strictEqual(queue[0].date, THU);

  const cached = await S.getCachedTodayStatus();
  // getCachedTodayStatus only returns today's entry, so compare against the
  // stored value directly for a fixed historical date.
  const raw = JSON.parse(storage.__store.get('@aflonmark_today_status'));
  assert.strictEqual(raw.status, 'checkedIn');
  assert.strictEqual(raw.isOfflinePending, true);
  assert.strictEqual(raw.localStatus, 'Early');
});

await test('re-scanning the same action keeps the original capture time', async () => {
  const first = at(THU, 8, 15);
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: first });
  const dup = await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: at(THU, 9, 45) });

  const queue = await S.getPendingOfflineScans();
  assert.strictEqual(queue.length, 1, 'no duplicate entry');
  assert.strictEqual(queue[0].timestamp, first.toISOString(), 'original time preserved');
  assert.strictEqual(dup.timestamp, first.toISOString(), 'returns the existing scan');
});

await test('IN and OUT queue as separate entries', async () => {
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: at(THU, 8, 15) });
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'OUT', when: at(THU, 16, 0) });
  const queue = await S.getPendingOfflineScans();
  assert.strictEqual(queue.length, 2);
  const raw = JSON.parse(storage.__store.get('@aflonmark_today_status'));
  assert.strictEqual(raw.status, 'complete');
  assert.strictEqual(raw.checkInTime, at(THU, 8, 15).toISOString());
  assert.strictEqual(raw.checkOutTime, at(THU, 16, 0).toISOString());
});

/* ── syncing ─────────────────────────────────────────────────────────── */

await test('a successful sync drains the queue', async () => {
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: at(THU, 8, 15) });
  const out = await S.syncOfflineQueue();
  assert.strictEqual(out.syncedCount, 1);
  assert.strictEqual((await S.getPendingOfflineScans()).length, 0);
});

await test('scans are replayed oldest first so the check-in lands before the check-out', async () => {
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'OUT', when: at(THU, 16, 0) });
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: at(THU, 8, 15) });
  await S.syncOfflineQueue();
  assert.deepStrictEqual(api.__state.calls.map((c) => c.body.action), ['IN', 'OUT']);
});

await test('the original capture time and the offline flag reach the server', async () => {
  const when = at(THU, 8, 15);
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when });
  await S.syncOfflineQueue();
  assert.strictEqual(api.__state.calls[0].body.timestamp, when.toISOString());
  assert.strictEqual(api.__state.calls[0].body.offline, true);
});

await test('a network failure keeps the scan queued for another attempt', async () => {
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: at(THU, 8, 15) });
  api.__state.handler = async () => { throw new APIError('Network error', 0); };
  const out = await S.syncOfflineQueue();
  assert.strictEqual(out.failedCount, 1);
  assert.strictEqual(out.rejectedCount, 0);
  const queue = await S.getPendingOfflineScans();
  assert.strictEqual(queue.length, 1);
  assert.strictEqual(queue[0].attempts, 1);
});

await test('a 5xx keeps the scan queued', async () => {
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: at(THU, 8, 15) });
  api.__state.handler = async () => { throw new APIError('Bad gateway', 502); };
  await S.syncOfflineQueue();
  assert.strictEqual((await S.getPendingOfflineScans()).length, 1);
});

await test('an out-of-window rejection is dropped instead of retried forever', async () => {
  // This is the defect the client reported: such a scan used to sit in the
  // queue being resent on every poll, for ever, with no way to clear it.
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'OUT', when: at(THU, 16, 0) });
  api.__state.handler = async () => {
    throw new APIError('Check-out on Thursday closed at 20:00.', 400, 'CHECK_OUT_CLOSED');
  };
  const out = await S.syncOfflineQueue();

  assert.strictEqual(out.rejectedCount, 1);
  assert.strictEqual((await S.getPendingOfflineScans()).length, 0, 'removed from the queue');

  const failures = await S.getSyncFailures();
  assert.strictEqual(failures.length, 1, 'surfaced to the user');
  assert.strictEqual(failures[0].code, 'CHECK_OUT_CLOSED');
  assert.match(failures[0].reason, /closed at 20:00/);
});

await test('a missing check-in rejection is dropped and reported', async () => {
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'OUT', when: at(THU, 16, 0) });
  api.__state.handler = async () => { throw new APIError('No check-in found for today.', 400, 'NO_CHECK_IN'); };
  await S.syncOfflineQueue();
  assert.strictEqual((await S.getPendingOfflineScans()).length, 0);
  assert.strictEqual((await S.getSyncFailures())[0].code, 'NO_CHECK_IN');
});

await test('"already recorded" counts as synced, not failed', async () => {
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: at(THU, 8, 15) });
  api.__state.handler = async () => { throw new APIError('Already checked in at 08:15.', 200, 'ALREADY_CHECKED_IN'); };
  const out = await S.syncOfflineQueue();
  assert.strictEqual(out.syncedCount, 1);
  assert.strictEqual(out.rejectedCount, 0);
  assert.strictEqual((await S.getPendingOfflineScans()).length, 0);
  assert.strictEqual((await S.getSyncFailures()).length, 0);
});

await test('a retry after a transient failure eventually succeeds', async () => {
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: at(THU, 8, 15) });
  api.__state.handler = async () => { throw new APIError('Network error', 0); };
  await S.syncOfflineQueue();
  assert.strictEqual((await S.getPendingOfflineScans()).length, 1);

  api.__state.handler = async () => ({ message: 'Checked IN successfully' });
  const out = await S.syncOfflineQueue();
  assert.strictEqual(out.syncedCount, 1);
  assert.strictEqual((await S.getPendingOfflineScans()).length, 0);
});

await test('the pending flag clears only once the queue is empty', async () => {
  await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: new Date() });
  api.__state.handler = async () => { throw new APIError('Network error', 0); };
  await S.syncOfflineQueue();
  assert.strictEqual((await S.getCachedTodayStatus()).isOfflinePending, true);

  api.__state.handler = async () => ({ message: 'ok' });
  await S.syncOfflineQueue();
  assert.strictEqual((await S.getCachedTodayStatus()).isOfflinePending, false);
});

await test('a queued scan can be discarded by hand', async () => {
  const scan = await S.enqueueOfflineScan({ userId: 'u1', locationToken: 'q', action: 'IN', when: at(THU, 8, 15) });
  await S.discardQueuedScan(scan.id);
  assert.strictEqual((await S.getPendingOfflineScans()).length, 0);
});

await test('the failure log can be cleared and is capped', async () => {
  api.__state.handler = async () => { throw new APIError('nope', 400, 'CHECK_IN_CLOSED'); };
  for (let i = 0; i < 25; i++) {
    await S.enqueueOfflineScan({ userId: `u${i}`, locationToken: 'q', action: 'IN', when: at(THU, 8, 15) });
    await S.syncOfflineQueue();
  }
  assert.strictEqual((await S.getSyncFailures()).length, 20, 'capped at 20');
  await S.clearSyncFailures();
  assert.strictEqual((await S.getSyncFailures()).length, 0);
});

await test('syncing an empty queue makes no network calls', async () => {
  const out = await S.syncOfflineQueue();
  assert.strictEqual(out.syncedCount, 0);
  assert.strictEqual(api.__state.calls.length, 0);
});

await test('corrupt queue storage degrades to empty rather than throwing', async () => {
  storage.__store.set('@aflonmark_offline_queue', 'not json');
  assert.deepStrictEqual(await S.getPendingOfflineScans(), []);
});

/* ── schedule caching ────────────────────────────────────────────────── */

await test('the schedule is cached and read back', async () => {
  await S.setCachedSchedule(schedule);
  const back = await S.getCachedSchedule();
  assert.strictEqual(back.days.fri.checkOutEnd, '14:00');
});

await test('connectivity check caches the schedule it receives', async () => {
  api.__state.handler = async () => ({ schedule });
  assert.strictEqual(await S.checkServerConnectivity(), true);
  assert.strictEqual((await S.getCachedSchedule()).days.fri.checkOutStart, '12:30');
});

await test('connectivity check reports offline without throwing', async () => {
  api.__state.handler = async () => { throw new APIError('Network error', 0); };
  assert.strictEqual(await S.checkServerConnectivity(), false);
});

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
})();
