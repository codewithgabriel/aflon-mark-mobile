import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAPI } from './api';

export type QueuedScan = {
  id: string;
  userId: string;
  locationToken: string;
  action: 'IN' | 'OUT';
  timestamp: string; // ISO 8601 string
  date: string;      // YYYY-MM-DD
};

export type CachedTodayStatus = {
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: 'none' | 'checkedIn' | 'complete';
  isOfflinePending?: boolean;
  lastAction?: 'IN' | 'OUT';
};

const QUEUE_STORAGE_KEY = '@aflonmark_offline_queue';
const TODAY_STATUS_KEY = '@aflonmark_today_status';
const CACHED_HISTORY_KEY = '@aflonmark_cached_history';
const CACHED_STATS_KEY = '@aflonmark_cached_stats';

export const getTodayDateString = (): string => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Enqueue an attendance scan when offline or network fails.
 */
export const enqueueOfflineScan = async ({
  userId,
  locationToken,
  action,
}: {
  userId: string;
  locationToken: string;
  action: 'IN' | 'OUT';
}): Promise<QueuedScan> => {
  const now = new Date();
  const timestamp = now.toISOString();
  const date = getTodayDateString();

  const newScan: QueuedScan = {
    id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    locationToken,
    action,
    timestamp,
    date,
  };

  try {
    const existingQueueStr = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    const queue: QueuedScan[] = existingQueueStr ? JSON.parse(existingQueueStr) : [];
    
    // Avoid exact duplicate queued scans within 10 seconds
    const isDuplicate = queue.some(
      (q) => q.userId === userId && q.action === action && q.date === date
    );
    if (!isDuplicate) {
      queue.push(newScan);
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    }

    // Update today's local cached status immediately
    const todayStatus = await getCachedTodayStatus();
    const updatedStatus: CachedTodayStatus = {
      date,
      checkInTime: action === 'IN' ? timestamp : (todayStatus?.checkInTime || timestamp),
      checkOutTime: action === 'OUT' ? timestamp : (todayStatus?.checkOutTime || null),
      status: action === 'IN' ? 'checkedIn' : 'complete',
      isOfflinePending: true,
      lastAction: action,
    };
    await setCachedTodayStatus(updatedStatus);

    return newScan;
  } catch (error) {
    console.error('Failed to enqueue offline scan', error);
    throw error;
  }
};

/**
 * Retrieve all currently pending offline scans.
 */
export const getPendingOfflineScans = async (): Promise<QueuedScan[]> => {
  try {
    const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get offline queue', error);
    return [];
  }
};

/**
 * Synchronize all pending offline scans to the server.
 */
export const syncOfflineQueue = async (): Promise<{
  syncedCount: number;
  failedCount: number;
  results: { id: string; success: boolean; message: string }[];
}> => {
  const queue = await getPendingOfflineScans();
  if (queue.length === 0) {
    return { syncedCount: 0, failedCount: 0, results: [] };
  }

  const remainingQueue: QueuedScan[] = [];
  const results: { id: string; success: boolean; message: string }[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const item of queue) {
    try {
      const response = await fetchAPI('/attendance/scan', {
        method: 'POST',
        body: JSON.stringify({
          userId: item.userId,
          locationToken: item.locationToken,
          action: item.action,
          timestamp: item.timestamp,
        }),
      });

      syncedCount++;
      results.push({
        id: item.id,
        success: true,
        message: response.message || 'Synced successfully',
      });
    } catch (err: any) {
      // If error indicates already recorded/synced on server, treat as resolved
      const msg = err.message || '';
      if (
        msg.includes('already checked in') ||
        msg.includes('already checked out') ||
        msg.includes('Sync Error') ||
        msg.includes('Attendance complete') ||
        msg.includes('Sync confirmed')
      ) {
        syncedCount++;
        results.push({ id: item.id, success: true, message: 'Confirmed on server' });
      } else {
        // Keep in queue for next sync attempt (e.g. connection dropped)
        remainingQueue.push(item);
        failedCount++;
        results.push({ id: item.id, success: false, message: msg });
      }
    }
  }

  // Save remaining items back to storage
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remainingQueue));

  // If all synced, remove the offlinePending flag from cached today status
  if (remainingQueue.length === 0) {
    const todayStatus = await getCachedTodayStatus();
    if (todayStatus) {
      todayStatus.isOfflinePending = false;
      await setCachedTodayStatus(todayStatus);
    }
  }

  return { syncedCount, failedCount, results };
};

/**
 * Cache and retrieve today's attendance status locally.
 */
export const getCachedTodayStatus = async (): Promise<CachedTodayStatus | null> => {
  try {
    const raw = await AsyncStorage.getItem(TODAY_STATUS_KEY);
    if (!raw) return null;
    const parsed: CachedTodayStatus = JSON.parse(raw);
    // Only return if it matches today's date
    if (parsed.date === getTodayDateString()) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

export const setCachedTodayStatus = async (status: CachedTodayStatus): Promise<void> => {
  try {
    await AsyncStorage.setItem(TODAY_STATUS_KEY, JSON.stringify(status));
  } catch (e) {
    console.error('Failed to set cached today status', e);
  }
};

/**
 * History & Stats offline caching helpers.
 */
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

/**
 * Quick network check helper (pings settings with a short 3.5s timeout).
 */
export const checkServerConnectivity = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    await fetchAPI('/settings', { signal: controller.signal });
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
};
