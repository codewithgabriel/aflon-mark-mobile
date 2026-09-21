import AsyncStorage from '@react-native-async-storage/async-storage';
import { APIError, fetchAPI } from './api';

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────*/

export type ScanAction = 'IN' | 'OUT';

export type QueuedScan = {
  id: string;
  userId: string;
  locationToken: string;
  action: ScanAction;
  timestamp: string; // ISO 8601, captured at scan time
  date: string;      // YYYY-MM-DD, device local
  attempts: number;
  lastError?: string;
};

/** A queued scan the server rejected for a reason retrying can never fix. */
export type FailedScan = QueuedScan & {
  reason: string;
  code?: string;
  failedAt: string;
};

export type CachedTodayStatus = {
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: 'none' | 'checkedIn' | 'complete';
  isOfflinePending?: boolean;
  lastAction?: ScanAction;
  /** Locally computed Early/OnTime/Late, shown until the server confirms. */
  localStatus?: 'Early' | 'OnTime' | 'Late';
};

export type DayWindow = {
  checkInEnd: string;
  checkInClose: string;
  checkOutStart: string;
  checkOutEnd: string;
};

export type DaySchedule = DayWindow & {
  working: boolean;
  mode: 'default' | 'custom';
};

export type Schedule = {
  timezone: string;
  defaults: DayWindow;
  days: Record<string, DaySchedule>;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Storage keys
 * ──────────────────────────────────────────────────────────────────────────*/

const QUEUE_STORAGE_KEY = '@aflonmark_offline_queue';
const FAILED_STORAGE_KEY = '@aflonmark_offline_failed';
const TODAY_STATUS_KEY = '@aflonmark_today_status';
const CACHED_HISTORY_KEY = '@aflonmark_cached_history';
const CACHED_STATS_KEY = '@aflonmark_cached_stats';
const CACHED_SCHEDULE_KEY = '@aflonmark_cached_schedule';

/* ────────────────────────────────────────────────────────────────────────────
 * Schedule
 * ──────────────────────────────────────────────────────────────────────────*/

// getDay() order: 0 = Sunday … 6 = Saturday.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_LABELS: Record<string, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

const FALLBACK_WINDOW: DayWindow = {
  checkInEnd: '09:00',
  checkInClose: '11:00',
  checkOutStart: '15:00',
  checkOutEnd: '20:00',
};

export const FALLBACK_SCHEDULE: Schedule = {
  timezone: 'Africa/Lagos',
  defaults: { ...FALLBACK_WINDOW },
  days: DAY_KEYS.reduce((acc, key) => {
    acc[key] = {
      working: key !== 'sat' && key !== 'sun',
      mode: 'default',
      ...FALLBACK_WINDOW,
    };
    return acc;
  }, {} as Record<string, DaySchedule>),
};

/** "YYYY-MM-DD" in the device's own timezone (never UTC). */
export const getTodayDateString = (d: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toMinutes = (t?: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
};

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** The effective window for a given moment, per the cached schedule. */
export const resolveDaySchedule = (
  schedule: Schedule | null,
  when: Date = new Date()
): DaySchedule & { dayKey: string; dayLabel: string } => {
  const active = schedule || FALLBACK_SCHEDULE;
  const dayKey = DAY_KEYS[when.getDay()];
  const day = active.days?.[dayKey] || FALLBACK_SCHEDULE.days[dayKey];
  const window = day.mode === 'custom' ? day : active.defaults || FALLBACK_WINDOW;

  return {
    dayKey,
    dayLabel: DAY_LABELS[dayKey],
    working: day.working,
    mode: day.mode,
    checkInEnd: window.checkInEnd,
    checkInClose: window.checkInClose,
    checkOutStart: window.checkOutStart,
    checkOutEnd: window.checkOutEnd,
  };
};

export const getCachedSchedule = async (): Promise<Schedule | null> => {
  try {
    const raw = await AsyncStorage.getItem(CACHED_SCHEDULE_KEY);
    return raw ? (JSON.parse(raw) as Schedule) : null;
  } catch {
    return null;
  }
};

export const setCachedSchedule = async (schedule: Schedule): Promise<void> => {
  try {
    await AsyncStorage.setItem(CACHED_SCHEDULE_KEY, JSON.stringify(schedule));
  } catch (e) {
    console.error('Failed to cache schedule', e);
  }
};

/**
 * Pull the latest schedule and cache it. Offline scans are validated against
 * whatever was cached on the last successful fetch, so this runs on every
 * app open and after each reconnect.
 */
export const refreshSchedule = async (): Promise<Schedule> => {
  const data = await fetchAPI('/settings');
  const schedule: Schedule = data?.schedule || FALLBACK_SCHEDULE;
  await setCachedSchedule(schedule);
  return schedule;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Local rule evaluation
 *
 * The same rules the server applies, run on-device so an offline scan either
 * succeeds for good or is refused immediately with a clear reason — rather
 * than being accepted, queued, and silently rejected hours later.
 * ──────────────────────────────────────────────────────────────────────────*/

export type LocalDecision = {
  allowed: boolean;
  reason?: string;
  status?: 'Early' | 'OnTime' | 'Late';
  day: DaySchedule & { dayKey: string; dayLabel: string };
};

export const evaluateScanLocally = ({
  action,
  schedule,
  todayStatus,
  when = new Date(),
}: {
  action: ScanAction;
  schedule: Schedule | null;
  todayStatus: CachedTodayStatus | null;
  when?: Date;
}): LocalDecision => {
  const day = resolveDaySchedule(schedule, when);
  const mins = minutesOfDay(when);
  const today = getTodayDateString(when);
  const current = todayStatus && todayStatus.date === today ? todayStatus : null;

  if (action === 'IN') {
    if (current?.checkInTime) {
      return { allowed: false, reason: 'You have already checked in today.', day };
    }

    // Non-working days stay open all day — staff who do come in are recorded.
    if (!day.working) return { allowed: true, status: 'OnTime', day };

    const close = toMinutes(day.checkInClose);
    if (close !== null && mins > close) {
      return {
        allowed: false,
        reason: `Check-in for ${day.dayLabel} closed at ${day.checkInClose}.`,
        day,
      };
    }

    const deadline = toMinutes(day.checkInEnd);
    const status = deadline === null || mins < deadline ? 'Early' : 'OnTime';
    return { allowed: true, status, day };
  }

  // action === 'OUT'
  if (!current?.checkInTime) {
    return { allowed: false, reason: 'No check-in found for today. Please check in first.', day };
  }
  if (current.checkOutTime) {
    return { allowed: false, reason: 'You have already checked out today.', day };
  }
  if (!day.working) return { allowed: true, day };

  const start = toMinutes(day.checkOutStart);
  const end = toMinutes(day.checkOutEnd);
  if (start !== null && mins < start) {
    return { allowed: false, reason: `Check-out on ${day.dayLabel} opens at ${day.checkOutStart}.`, day };
  }
  if (end !== null && mins > end) {
    return { allowed: false, reason: `Check-out on ${day.dayLabel} closed at ${day.checkOutEnd}.`, day };
  }

  return { allowed: true, day };
};

/* ────────────────────────────────────────────────────────────────────────────
 * Offline queue
 * ──────────────────────────────────────────────────────────────────────────*/

const readQueue = async (): Promise<QueuedScan[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (queue: QueuedScan[]) =>
  AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));

export const getPendingOfflineScans = readQueue;

export const getSyncFailures = async (): Promise<FailedScan[]> => {
  try {
    const raw = await AsyncStorage.getItem(FAILED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const clearSyncFailures = () => AsyncStorage.removeItem(FAILED_STORAGE_KEY);

const recordFailure = async (item: QueuedScan, reason: string, code?: string) => {
  const existing = await getSyncFailures();
  const next = [
    { ...item, reason, code, failedAt: new Date().toISOString() },
    // Keep the log short — only the last 20 rejections are ever useful.
    ...existing.filter((f) => f.id !== item.id),
  ].slice(0, 20);
  await AsyncStorage.setItem(FAILED_STORAGE_KEY, JSON.stringify(next));
};

/**
 * Queue an attendance scan captured while offline.
 *
 * Callers must have already run `evaluateScanLocally` — this only handles
 * storage, deduplication and the optimistic local status update.
 */
export const enqueueOfflineScan = async ({
  userId,
  locationToken,
  action,
  localStatus,
  when = new Date(),
}: {
  userId: string;
  locationToken: string;
  action: ScanAction;
  localStatus?: 'Early' | 'OnTime' | 'Late';
  when?: Date;
}): Promise<QueuedScan> => {
  const timestamp = when.toISOString();
  const date = getTodayDateString(when);

  const scan: QueuedScan = {
    id: `offline_${when.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    userId,
    locationToken,
    action,
    timestamp,
    date,
    attempts: 0,
  };

  const queue = await readQueue();

  // One IN and one OUT per user per day — a repeat scan must not create a
  // second queue entry, and must not move the already-captured timestamp.
  const duplicate = queue.find(
    (q) => q.userId === userId && q.action === action && q.date === date
  );

  if (duplicate) return duplicate;

  queue.push(scan);
  await writeQueue(queue);

  const previous = await readStoredStatus();
  const base = previous && previous.date === date ? previous : null;

  await setCachedTodayStatus({
    date,
    checkInTime: action === 'IN' ? timestamp : base?.checkInTime ?? null,
    checkOutTime: action === 'OUT' ? timestamp : base?.checkOutTime ?? null,
    status: action === 'IN' ? 'checkedIn' : 'complete',
    isOfflinePending: true,
    lastAction: action,
    localStatus: action === 'IN' ? localStatus : base?.localStatus,
  });

  return scan;
};

/** Rejections that retrying can never resolve — the scan is dropped. */
const PERMANENT_CODES = new Set([
  'CHECK_IN_CLOSED',
  'CHECK_OUT_NOT_OPEN',
  'CHECK_OUT_CLOSED',
  'NO_CHECK_IN',
]);

/** Server responses that mean "this scan is already recorded" — treat as done. */
const RESOLVED_CODES = new Set([
  'CHECKED_IN',
  'CHECKED_OUT',
  'ALREADY_CHECKED_IN',
  'ALREADY_CHECKED_OUT',
  'DAY_COMPLETE',
]);

export type SyncOutcome = {
  syncedCount: number;
  failedCount: number;
  rejectedCount: number;
  results: { id: string; success: boolean; message: string; permanent?: boolean }[];
};

/**
 * Replay every queued scan against the server.
 *
 * Scans are sent oldest-first so a check-in always lands before the check-out
 * that depends on it. Each result is classified:
 *
 *   • accepted / already recorded → removed from the queue
 *   • permanently rejected        → removed, and logged for the user to see
 *   • transient (offline, 5xx)    → left in the queue for the next attempt
 */
export const syncOfflineQueue = async (): Promise<SyncOutcome> => {
  const queue = (await readQueue()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (queue.length === 0) {
    return { syncedCount: 0, failedCount: 0, rejectedCount: 0, results: [] };
  }

  const remaining: QueuedScan[] = [];
  const results: SyncOutcome['results'] = [];
  let syncedCount = 0;
  let failedCount = 0;
  let rejectedCount = 0;

  for (const item of queue) {
    try {
      const response = await fetchAPI('/attendance/scan', {
        method: 'POST',
        body: JSON.stringify({
          userId: item.userId,
          locationToken: item.locationToken,
          action: item.action,
          timestamp: item.timestamp,
          offline: true,
        }),
      });

      syncedCount++;
      results.push({ id: item.id, success: true, message: response?.message || 'Synced' });
    } catch (err: any) {
      const status: number = err instanceof APIError ? err.status : -1;
      const code: string | undefined = err?.code;
      const message: string = err?.message || 'Sync failed';

      if (code && RESOLVED_CODES.has(code)) {
        // The server already holds this scan — nothing left to do.
        syncedCount++;
        results.push({ id: item.id, success: true, message: 'Confirmed on server' });
        continue;
      }

      // A 0 status means the request never reached the server, and 5xx means
      // the server is unwell; both are worth another attempt later.
      const transient = status === 0 || status === -1 || status >= 500;

      if (transient) {
        remaining.push({ ...item, attempts: item.attempts + 1, lastError: message });
        failedCount++;
        results.push({ id: item.id, success: false, message });
        continue;
      }

      // Everything else is the server saying no, for good.
      const permanent = !code || PERMANENT_CODES.has(code) || status === 404 || status === 403;
      if (permanent) {
        await recordFailure(item, message, code);
        rejectedCount++;
        results.push({ id: item.id, success: false, message, permanent: true });
        continue;
      }

      remaining.push({ ...item, attempts: item.attempts + 1, lastError: message });
      failedCount++;
      results.push({ id: item.id, success: false, message });
    }
  }

  await writeQueue(remaining);

  // Once the queue is drained, today's cached status is authoritative again.
  if (remaining.length === 0) {
    const todayStatus = await getCachedTodayStatus();
    if (todayStatus?.isOfflinePending) {
      await setCachedTodayStatus({ ...todayStatus, isOfflinePending: false });
    }
  }

  return { syncedCount, failedCount, rejectedCount, results };
};

/** Drop a queued scan the user has decided to abandon. */
export const discardQueuedScan = async (id: string): Promise<void> => {
  const queue = await readQueue();
  await writeQueue(queue.filter((q) => q.id !== id));
};

/* ────────────────────────────────────────────────────────────────────────────
 * Cached today status
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * The stored status whatever day it belongs to. Callers that care about "today"
 * compare the date themselves — `enqueueOfflineScan` has to match against the
 * scan's own capture date, which can differ from the current date when a scan
 * is taken either side of midnight.
 */
const readStoredStatus = async (): Promise<CachedTodayStatus | null> => {
  try {
    const raw = await AsyncStorage.getItem(TODAY_STATUS_KEY);
    return raw ? (JSON.parse(raw) as CachedTodayStatus) : null;
  } catch {
    return null;
  }
};

export const getCachedTodayStatus = async (): Promise<CachedTodayStatus | null> => {
  const stored = await readStoredStatus();
  return stored && stored.date === getTodayDateString() ? stored : null;
};

export const setCachedTodayStatus = async (status: CachedTodayStatus): Promise<void> => {
  try {
    await AsyncStorage.setItem(TODAY_STATUS_KEY, JSON.stringify(status));
  } catch (e) {
    console.error('Failed to set cached today status', e);
  }
};

/* ────────────────────────────────────────────────────────────────────────────
 * History & stats caching
 * ──────────────────────────────────────────────────────────────────────────*/

export const getCachedHistory = async (): Promise<any[]> => {
  try {
    const raw = await AsyncStorage.getItem(CACHED_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setCachedHistory = async (history: any[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(CACHED_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to set cached history', e);
  }
};

export const getCachedStats = async (key: string): Promise<any | null> => {
  try {
    const raw = await AsyncStorage.getItem(`${CACHED_STATS_KEY}_${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setCachedStats = async (key: string, stats: any): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${CACHED_STATS_KEY}_${key}`, JSON.stringify(stats));
  } catch (e) {
    console.error('Failed to set cached stats', e);
  }
};

/* ────────────────────────────────────────────────────────────────────────────
 * Connectivity
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Ping the backend with a short timeout. Doubles as the schedule refresh, so a
 * device that has been offline picks up any admin changes the moment it
 * reconnects.
 */
export const checkServerConnectivity = async (): Promise<boolean> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const data = await fetchAPI('/settings', { signal: controller.signal });
    if (data?.schedule) await setCachedSchedule(data.schedule);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};
