import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { APIError, fetchAPI } from '../../utils/api';
import {
  CachedTodayStatus,
  FailedScan,
  QueuedScan,
  Schedule,
  checkServerConnectivity,
  clearSyncFailures,
  discardQueuedScan,
  enqueueOfflineScan,
  evaluateScanLocally,
  getCachedSchedule,
  getCachedTodayStatus,
  getPendingOfflineScans,
  getSyncFailures,
  getTodayDateString,
  refreshSchedule,
  resolveDaySchedule,
  setCachedTodayStatus,
  syncOfflineQueue,
} from '../../utils/offlineSync';

type ScanState = 'idle' | 'scanning' | 'loading' | 'success' | 'error';
type StatusState = 'loading' | 'none' | 'checkedIn' | 'complete';

type AttendanceRecord = {
  _id: string;
  userId: string;
  date: string;          // "YYYY-MM-DD"
  checkInTime: string;   // ISO 8601
  checkOutTime: string | null;
  status: 'Early' | 'OnTime' | 'Present' | 'Late' | 'Absent';
};

const CONNECTIVITY_POLL_MS = 20000;

const formatClock = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

const STATUS_COPY: Record<string, string> = {
  Early: 'Early',
  OnTime: 'On Time',
  Late: 'Late',
};

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const { user } = useAuth();

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [statusState, setStatusState] = useState<StatusState>('loading');
  const [todayStatus, setTodayStatus] = useState<CachedTodayStatus | null>(null);
  const [mode, setMode] = useState<'IN' | 'OUT'>('IN');

  const [resultMessage, setResultMessage] = useState('');
  const [resultDetail, setResultDetail] = useState('');
  const [isOfflineResult, setIsOfflineResult] = useState(false);

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [failures, setFailures] = useState<FailedScan[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showQueueSheet, setShowQueueSheet] = useState(false);

  // Guards against overlapping syncs kicked off by the poller and by a scan.
  const syncingRef = useRef(false);

  const today = resolveDaySchedule(schedule, new Date());

  /* ── Queue state ─────────────────────────────────────────────────────── */

  const refreshQueueState = useCallback(async () => {
    const [pending, failed] = await Promise.all([getPendingOfflineScans(), getSyncFailures()]);
    setQueue(pending);
    setFailures(failed);
    return pending;
  }, []);

  /* ── Today's status ──────────────────────────────────────────────────── */

  const applyStatus = useCallback((status: CachedTodayStatus | null) => {
    setTodayStatus(status);
    if (!status || status.status === 'none') {
      setStatusState('none');
      setMode('IN');
      return;
    }
    setStatusState(status.status === 'complete' ? 'complete' : 'checkedIn');
    // Once checked in, the only remaining action is checking out.
    setMode('OUT');
  }, []);

  /**
   * Today's state is the server's record, with any still-queued offline scans
   * layered on top — otherwise a device that checked in offline would show
   * "not checked in" the moment it regained signal but before it synced.
   */
  const userId = user?._id;

  const fetchTodayStatus = useCallback(async () => {
    const date = getTodayDateString();
    const cached = await getCachedTodayStatus();
    if (cached) applyStatus(cached);
    else setStatusState('none');

    const pending = await refreshQueueState();
    const pendingToday = pending.filter((q) => q.date === date);

    let serverStatus: CachedTodayStatus | null = null;

    try {
      const res = await fetchAPI(`/attendance/history?userId=${userId}`);
      const list: AttendanceRecord[] = Array.isArray(res) ? res : res?.records || [];
      const record = list.find((r) => r.date === date) ?? null;
      setIsOnline(true);

      if (record) {
        serverStatus = {
          date,
          checkInTime: record.checkInTime,
          checkOutTime: record.checkOutTime,
          status: record.checkOutTime ? 'complete' : 'checkedIn',
          isOfflinePending: false,
          localStatus: (STATUS_COPY[record.status] ? record.status : undefined) as any,
        };
      } else {
        serverStatus = { date, checkInTime: null, checkOutTime: null, status: 'none' };
      }
    } catch {
      setIsOnline(false);
      // No server answer — the cache is the best truth we have.
      if (cached) return;
      if (pendingToday.length === 0) {
        applyStatus({ date, checkInTime: null, checkOutTime: null, status: 'none' });
        await setCachedTodayStatus({ date, checkInTime: null, checkOutTime: null, status: 'none' });
      }
      return;
    }

    // Overlay anything still waiting to be sent.
    const merged: CachedTodayStatus = { ...serverStatus };
    for (const item of pendingToday) {
      if (item.action === 'IN' && !merged.checkInTime) merged.checkInTime = item.timestamp;
      if (item.action === 'OUT' && !merged.checkOutTime) merged.checkOutTime = item.timestamp;
    }
    merged.isOfflinePending = pendingToday.length > 0;
    merged.status = merged.checkOutTime ? 'complete' : merged.checkInTime ? 'checkedIn' : 'none';
    merged.localStatus = merged.localStatus ?? cached?.localStatus;

    applyStatus(merged);
    await setCachedTodayStatus(merged);
  }, [applyStatus, refreshQueueState, userId]);

  /* ── Sync ────────────────────────────────────────────────────────────── */

  const runSync = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      if (!silent) setIsSyncing(true);

      try {
        const outcome = await syncOfflineQueue();
        if (outcome.syncedCount > 0) {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}
        }
        await refreshQueueState();
        await fetchTodayStatus();
        return outcome;
      } catch (e) {
        console.error('Sync failed', e);
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [fetchTodayStatus, refreshQueueState]
  );

  const checkConnectivity = useCallback(async () => {
    const online = await checkServerConnectivity();
    setIsOnline(online);

    if (online) {
      const cachedSchedule = await getCachedSchedule();
      if (cachedSchedule) setSchedule(cachedSchedule);
      const pending = await refreshQueueState();
      if (pending.length > 0) runSync({ silent: true });
    }
  }, [refreshQueueState, runSync]);

  /* ── Bootstrap ───────────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Show the last known schedule instantly, then refresh it.
      const cached = await getCachedSchedule();
      if (cached && !cancelled) setSchedule(cached);

      try {
        const fresh = await refreshSchedule();
        if (!cancelled) {
          setSchedule(fresh);
          setIsOnline(true);
        }
      } catch {
        if (!cancelled) setIsOnline(false);
      }

      if (!cancelled) await refreshQueueState();
    })();

    const interval = setInterval(checkConnectivity, CONNECTIVITY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scanState === 'idle') fetchTodayStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanState]);

  /* ── Scanning ────────────────────────────────────────────────────────── */

  const showError = useCallback(async (message: string, detail = '') => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}
    setResultMessage(message);
    setResultDetail(detail);
    setIsOfflineResult(false);
    setScanState('error');
  }, []);

  const handleBarcodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanState !== 'scanning') return; // the camera can fire repeatedly
    setScanState('loading');
    setIsOfflineResult(false);
    setResultDetail('');

    if (data !== 'static-wall-qr') {
      await showError('Invalid QR code. Please scan the official Aflon station code.');
      return;
    }

    if (!user?._id) {
      await showError('Your session has expired. Please sign in again.');
      return;
    }

    const capturedAt = new Date();

    try {
      const response = await fetchAPI('/attendance/scan', {
        method: 'POST',
        body: JSON.stringify({ userId: user._id, locationToken: data, action: mode }),
      });

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      setIsOnline(true);
      setResultMessage(response?.message || 'Attendance recorded successfully.');
      setResultDetail(
        response?.time ? `${mode === 'IN' ? 'Checked in' : 'Checked out'} at ${formatClock(response.time)}` : ''
      );
      setScanState('success');

      // Opportunistically drain anything queued from an earlier outage.
      runSync({ silent: true });
      return;
    } catch (err: any) {
      const status: number = err instanceof APIError ? err.status : -1;
      const unreachable = status === 0 || status === -1 || status >= 500;

      if (!unreachable) {
        // The server answered and said no — show its reason as-is.
        setIsOnline(true);
        await showError(err?.message || 'Unable to record attendance.');
        return;
      }

      setIsOnline(false);

      // ── Offline path ──
      // Apply the same rules the server would, so the staff member gets a
      // straight answer now instead of a silent rejection at sync time.
      const cachedSchedule = schedule || (await getCachedSchedule());
      const currentStatus = await getCachedTodayStatus();
      const decision = evaluateScanLocally({
        action: mode,
        schedule: cachedSchedule,
        todayStatus: currentStatus,
        when: capturedAt,
      });

      if (!decision.allowed) {
        await showError(
          decision.reason || 'This scan cannot be recorded right now.',
          'You are offline. This check was made against the schedule last synced to this device.'
        );
        return;
      }

      try {
        await enqueueOfflineScan({
          userId: user._id,
          locationToken: data,
          action: mode,
          localStatus: decision.status,
          when: capturedAt,
        });

        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}

        setIsOfflineResult(true);
        setResultMessage(
          `${mode === 'IN' ? 'Check-in' : 'Check-out'} saved offline at ${formatClock(capturedAt.toISOString())}.`
        );
        setResultDetail(
          decision.status
            ? `Recorded as ${STATUS_COPY[decision.status]} for ${decision.day.dayLabel}.`
            : `Recorded for ${decision.day.dayLabel}.`
        );
        setScanState('success');
        await refreshQueueState();
      } catch (queueErr) {
        console.error('Failed to queue offline scan', queueErr);
        await showError('Could not save this scan on your device. Please try again.');
      }
    }
  };

  const reset = () => {
    setResultMessage('');
    setResultDetail('');
    setIsOfflineResult(false);
    setScanState('idle');
  };

  /* ── Derived UI state ────────────────────────────────────────────────── */

  const isComplete = statusState === 'complete';
  const pendingCount = queue.length;
  const hasIssues = failures.length > 0;

  const modeAvailability = useMemo(() => {
    const decision = evaluateScanLocally({
      action: mode,
      schedule,
      todayStatus,
      when: new Date(),
    });
    return decision;
    // Re-evaluated whenever the inputs change; a minute-level refresh is not
    // needed because the server re-checks anyway when online.
  }, [mode, schedule, todayStatus]);

  /* ── Offline queue sheet ─────────────────────────────────────────────── */

  const renderQueueSheet = () => (
    <Modal
      visible={showQueueSheet}
      animationType="slide"
      transparent
      onRequestClose={() => setShowQueueSheet(false)}
    >
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>Offline Records</Text>
              <Text style={styles.sheetSubtitle}>
                {pendingCount > 0
                  ? `${pendingCount} scan${pendingCount > 1 ? 's' : ''} waiting to reach the server`
                  : 'Everything on this device has been synced'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowQueueSheet(false)} style={styles.sheetClose}>
              <MaterialCommunityIcons name="close" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.sheetScroll} contentContainerStyle={{ paddingBottom: 12 }}>
            {pendingCount === 0 && !hasIssues && (
              <View style={styles.sheetEmpty}>
                <MaterialCommunityIcons name="cloud-check-outline" size={44} color="rgba(16,185,129,0.6)" />
                <Text style={styles.sheetEmptyText}>Nothing pending. You&apos;re all caught up.</Text>
              </View>
            )}

            {queue.map((item) => (
              <View key={item.id} style={styles.queueRow}>
                <View
                  style={[
                    styles.queueIcon,
                    { backgroundColor: item.action === 'IN' ? 'rgba(16,185,129,0.18)' : 'rgba(96,165,250,0.18)' },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={item.action === 'IN' ? 'login' : 'logout'}
                    size={16}
                    color={item.action === 'IN' ? '#10b981' : '#60a5fa'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.queueTitle}>
                    {item.action === 'IN' ? 'Check-in' : 'Check-out'} · {formatClock(item.timestamp)}
                  </Text>
                  <Text style={styles.queueMeta}>
                    {item.date}
                    {item.attempts > 0 ? ` · ${item.attempts} attempt${item.attempts > 1 ? 's' : ''}` : ''}
                  </Text>
                  {!!item.lastError && <Text style={styles.queueError}>{item.lastError}</Text>}
                </View>
                <TouchableOpacity
                  onPress={async () => {
                    await discardQueuedScan(item.id);
                    await refreshQueueState();
                  }}
                  style={styles.queueDiscard}
                >
                  <Text style={styles.queueDiscardText}>Discard</Text>
                </TouchableOpacity>
              </View>
            ))}

            {hasIssues && (
              <>
                <View style={styles.sheetDivider}>
                  <Text style={styles.sheetDividerText}>Rejected by the server</Text>
                </View>
                {failures.map((item) => (
                  <View key={item.id} style={[styles.queueRow, styles.queueRowFailed]}>
                    <View style={[styles.queueIcon, { backgroundColor: 'rgba(239,68,68,0.18)' }]}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ef4444" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.queueTitle}>
                        {item.action === 'IN' ? 'Check-in' : 'Check-out'} · {formatClock(item.timestamp)}
                      </Text>
                      <Text style={styles.queueMeta}>{item.date}</Text>
                      <Text style={styles.queueError}>{item.reason}</Text>
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={async () => {
                    await clearSyncFailures();
                    await refreshQueueState();
                  }}
                  style={styles.sheetGhostBtn}
                >
                  <Text style={styles.sheetGhostBtnText}>Dismiss rejected records</Text>
                </TouchableOpacity>
                <Text style={styles.sheetNote}>
                  These scans fell outside the allowed window. Speak to an administrator if the record needs to be
                  added manually.
                </Text>
              </>
            )}
          </ScrollView>

          {pendingCount > 0 && (
            <TouchableOpacity
              style={[styles.sheetPrimaryBtn, (!isOnline || isSyncing) && { opacity: 0.45 }]}
              onPress={() => runSync()}
              disabled={!isOnline || isSyncing}
              activeOpacity={0.88}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#001f3f" />
              ) : (
                <MaterialCommunityIcons name="cloud-upload-outline" size={18} color="#001f3f" />
              )}
              <Text style={styles.sheetPrimaryBtnText}>
                {isSyncing ? 'Syncing…' : isOnline ? 'Sync now' : 'Waiting for connection'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderTopBar = () => (
    <View style={styles.topBar}>
      <View style={[styles.networkBadge, isOnline ? styles.badgeOnline : styles.badgeOffline]}>
        <View style={[styles.networkDot, { backgroundColor: isOnline ? '#10b981' : '#f59e0b' }]} />
        <Text style={styles.networkBadgeText}>{isOnline ? 'Online' : 'Offline Mode'}</Text>
      </View>

      {(pendingCount > 0 || hasIssues) && (
        <TouchableOpacity
          style={[styles.pendingSyncButton, hasIssues && pendingCount === 0 && styles.pendingSyncButtonAlert]}
          onPress={() => setShowQueueSheet(true)}
          activeOpacity={0.85}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#001f3f" />
          ) : (
            <MaterialCommunityIcons
              name={hasIssues && pendingCount === 0 ? 'alert-circle-outline' : 'cloud-upload-outline'}
              size={15}
              color="#001f3f"
            />
          )}
          <Text style={styles.pendingSyncText}>
            {isSyncing
              ? 'Syncing…'
              : pendingCount > 0
              ? `${pendingCount} queued`
              : `${failures.length} rejected`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderStatusIndicator = () => {
    if (statusState === 'loading') return <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />;

    if (statusState === 'none') {
      return (
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: '#94a3b8' }]} />
          <Text style={styles.statusNone}>Not checked in yet today</Text>
        </View>
      );
    }

    if (statusState === 'checkedIn') {
      return (
        <View
          style={[
            styles.statusPill,
            { borderColor: 'rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.12)' },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
          <Text style={styles.statusIn}>
            Checked in at {formatClock(todayStatus?.checkInTime)}
            {todayStatus?.localStatus ? ` · ${STATUS_COPY[todayStatus.localStatus]}` : ''}
            {todayStatus?.isOfflinePending ? ' · pending sync' : ''}
          </Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.statusPill,
          { borderColor: 'rgba(96, 165, 250, 0.3)', backgroundColor: 'rgba(96, 165, 250, 0.12)' },
        ]}
      >
        <View style={[styles.statusDot, { backgroundColor: '#60a5fa' }]} />
        <Text style={styles.statusComplete}>
          {formatClock(todayStatus?.checkInTime)} → {formatClock(todayStatus?.checkOutTime)}
          {todayStatus?.isOfflinePending ? ' · pending sync' : ''}
        </Text>
      </View>
    );
  };

  /* ── Permission gate ─────────────────────────────────────────────────── */

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionCard}>
          <View style={styles.permissionIconCircle}>
            <MaterialCommunityIcons name="camera-off" size={44} color="#00a8cc" />
          </View>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            AflonMark requires camera permission to scan campus check-in QR codes.
          </Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ── IDLE ────────────────────────────────────────────────────────────── */

  if (scanState === 'idle') {
    const blocked = !modeAvailability.allowed && !isComplete;

    return (
      <View style={styles.idleContainer}>
        {renderQueueSheet()}
        {renderTopBar()}

        {/* Mode Selector */}
        <View style={styles.modeSelector}>
          <View style={styles.modeContainer}>
            {(['IN', 'OUT'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeButton, mode === m && styles.modeActive]}
                onPress={() => setMode(m)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={m === 'IN' ? 'login' : 'logout'}
                  size={16}
                  color={mode === m ? '#001f3f' : 'rgba(255,255,255,0.4)'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                  {m === 'IN' ? 'CHECK IN' : 'CHECK OUT'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* The body is centred in whatever room is left below the chrome above,
            and scrolls instead of clipping on short screens. */}
        <ScrollView
          style={styles.idleScroll}
          contentContainerStyle={styles.idleScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.idleContent}>
          <View style={styles.idleIconGlow}>
            <View style={styles.idleIconRing}>
              <MaterialCommunityIcons name="qrcode-scan" size={56} color="#00e5ff" />
            </View>
          </View>

          <Text style={styles.idleTitle}>Ready to {mode === 'IN' ? 'Check In' : 'Check Out'}</Text>
          <Text style={styles.idleSubtitle}>
            Scan the Aflon wall station QR code. Works the same whether or not you have signal.
          </Text>

          {/* Today's schedule */}
          <View style={styles.timeCard}>
            <View style={styles.timeCardHeader}>
              <Text style={styles.timeCardHeaderText}>{today.dayLabel} schedule</Text>
              {today.mode === 'custom' && today.working && (
                <View style={styles.customBadge}>
                  <Text style={styles.customBadgeText}>CUSTOM</Text>
                </View>
              )}
              {!today.working && (
                <View style={styles.offBadge}>
                  <Text style={styles.offBadgeText}>NON-WORKING</Text>
                </View>
              )}
            </View>

            {today.working ? (
              <>
                <View style={styles.timeRow}>
                  <View style={styles.timeIconWrapIn}>
                    <MaterialCommunityIcons name="arrow-down-bold" size={14} color="#10b981" />
                  </View>
                  <Text style={styles.timeLabel}>Check-In</Text>
                  <Text style={styles.timeValue}>
                    On time before {today.checkInEnd}{' '}
                    <Text style={styles.timeSub}>(closes {today.checkInClose})</Text>
                  </Text>
                </View>
                <View style={[styles.timeRow, { marginTop: 10 }]}>
                  <View style={styles.timeIconWrapOut}>
                    <MaterialCommunityIcons name="arrow-up-bold" size={14} color="#60a5fa" />
                  </View>
                  <Text style={styles.timeLabel}>Check-Out</Text>
                  <Text style={styles.timeValue}>
                    {today.checkOutStart} – {today.checkOutEnd}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.timeValue}>
                Today is not a scheduled working day. Attendance is still recorded if you come in, and no
                absence is counted.
              </Text>
            )}
          </View>

          <View style={styles.statusRow}>{renderStatusIndicator()}</View>

          {blocked && (
            <View style={styles.blockedNotice}>
              <MaterialCommunityIcons name="clock-alert-outline" size={15} color="#fbbf24" />
              <Text style={styles.blockedNoticeText}>{modeAvailability.reason}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.scanBtn, isComplete && { opacity: 0.4 }]}
            onPress={isComplete ? undefined : () => setScanState('scanning')}
            disabled={isComplete}
            activeOpacity={0.88}
          >
            <MaterialCommunityIcons name="line-scan" size={22} color="#001f3f" />
            <Text style={styles.scanBtnText}>
              {isComplete ? 'Completed For Today' : 'Start Camera Scan'}
            </Text>
          </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ── SCANNING ────────────────────────────────────────────────────────── */

  if (scanState === 'scanning') {
    return (
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.overlay}>
          <View style={styles.scanHeader}>
            <View style={styles.scanModePill}>
              <Text style={styles.scanModeText}>
                SCANNING TO {mode === 'IN' ? 'CHECK IN' : 'CHECK OUT'}
              </Text>
            </View>
          </View>

          <View style={styles.targetFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>

          <Text style={styles.hintText}>Point camera at the campus QR Station code</Text>

          <TouchableOpacity style={styles.cancelBtn} onPress={reset} activeOpacity={0.8}>
            <Text style={styles.cancelBtnText}>Cancel Scan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ── LOADING ─────────────────────────────────────────────────────────── */

  if (scanState === 'loading') {
    return (
      <View style={styles.container}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#00e5ff" />
          <Text style={styles.loadingTitle}>Processing Attendance</Text>
          <Text style={styles.loadingSub}>Verifying code &amp; recording timestamp…</Text>
        </View>
      </View>
    );
  }

  /* ── RESULT ──────────────────────────────────────────────────────────── */

  const success = scanState === 'success';
  const accent = success ? (isOfflineResult ? '#f59e0b' : '#10b981') : '#ef4444';

  return (
    <View style={styles.container}>
      <View style={styles.resultCard}>
        <View style={[styles.resultIconRing, { backgroundColor: `${accent}2e` }]}>
          <MaterialCommunityIcons
            name={success ? (isOfflineResult ? 'cloud-clock' : 'check-circle') : 'alert-circle'}
            size={76}
            color={accent}
          />
        </View>

        <Text style={styles.resultTitle}>
          {success ? (isOfflineResult ? 'Saved Offline' : 'Verified') : 'Not Recorded'}
        </Text>

        <Text style={styles.resultMessage}>{resultMessage}</Text>
        {!!resultDetail && <Text style={styles.resultDetail}>{resultDetail}</Text>}

        {isOfflineResult && (
          <View style={styles.offlineNoticeBox}>
            <MaterialCommunityIcons name="information-outline" size={16} color="#f59e0b" />
            <Text style={styles.offlineNoticeText}>
              Your exact scan time is locked on this device and submits automatically once you are back online.
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.scanBtn} onPress={reset} activeOpacity={0.88}>
          <MaterialCommunityIcons name="arrow-left" size={18} color="#001f3f" />
          <Text style={styles.scanBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#001f3f',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Idle screen. Unlike `container` this does not centre its children: the top
  // chrome sits in normal flow and the body centres itself in what is left, so
  // adding a row to the schedule card can no longer shove the icon up under the
  // mode selector.
  idleContainer: {
    flex: 1,
    backgroundColor: '#001f3f',
  },
  idleScroll: {
    flex: 1,
    width: '100%',
  },
  idleScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 24,
  },

  // Top Status Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    zIndex: 20,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  badgeOffline: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  networkBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pendingSyncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#00e5ff',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  pendingSyncText: {
    color: '#001f3f',
    fontSize: 11,
    fontWeight: '800',
  },

  // Mode Selector
  modeSelector: {
    paddingHorizontal: 24,
    marginTop: 14,
    zIndex: 10,
  },
  modeContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 30,
    padding: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 24,
  },
  modeActive: {
    backgroundColor: '#00e5ff',
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modeText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
  },
  modeTextActive: {
    color: '#001f3f',
  },

  // Idle View
  idleContent: {
    alignItems: 'center',
    paddingHorizontal: 28,
    width: '100%',
  },
  idleIconGlow: {
    marginBottom: 24,
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
  },
  idleIconRing: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 2,
    borderColor: 'rgba(0, 229, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  idleTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  idleSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 28,
    paddingHorizontal: 16,
  },

  // Time Card
  timeCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 16,
    marginBottom: 20,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeIconWrapIn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  timeIconWrapOut: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  timeLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: '800',
    width: 76,
    textTransform: 'uppercase',
  },
  timeValue: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  timeSub: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    fontWeight: '500',
  },

  // Status Row
  statusRow: {
    marginBottom: 24,
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusNone: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  statusIn: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '800',
  },
  statusComplete: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '800',
  },

  // Scan Button
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#00e5ff',
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 30,
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  scanBtnText: {
    color: '#001f3f',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.5,
  },

  // Camera Overlay
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 31, 63, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scanHeader: {
    position: 'absolute',
    top: 60,
  },
  scanModePill: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#00e5ff',
  },
  scanModeText: {
    color: '#00e5ff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
  },
  targetFrame: {
    width: 250,
    height: 250,
    position: 'relative',
    marginBottom: 32,
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#00e5ff',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 36,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Loading Screen
  loadingCard: {
    alignItems: 'center',
    padding: 32,
  },
  loadingTitle: {
    marginTop: 20,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  loadingSub: {
    marginTop: 6,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontWeight: '500',
  },

  // Result Screen
  resultCard: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
  },
  resultIconRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  resultTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  resultMessage: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  offlineNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 28,
    width: '100%',
  },
  offlineNoticeText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },

  // Permissions Card
  permissionCard: {
    alignItems: 'center',
    padding: 36,
  },
  permissionIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0, 168, 204, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },
  permissionText: {
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 28,
  },
  permissionBtn: {
    backgroundColor: '#00e5ff',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  permissionBtnText: {
    color: '#001f3f',
    fontWeight: '900',
    fontSize: 14,
  },

  // New: sheet + schedule card additions
  pendingSyncButtonAlert: {
    backgroundColor: '#fbbf24',
    shadowColor: '#fbbf24',
  },
  timeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeCardHeaderText: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  customBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(167, 139, 250, 0.22)',
  },
  customBadgeText: {
    color: '#c4b5fd',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  offBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
  },
  offBadgeText: {
    color: '#cbd5e1',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  blockedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 20,
    width: '100%',
  },
  blockedNoticeText: {
    color: '#fbbf24',
    fontSize: 11.5,
    fontWeight: '700',
    flex: 1,
    lineHeight: 16,
  },
  resultDetail: {
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: -14,
    marginBottom: 22,
    paddingHorizontal: 12,
    fontWeight: '600',
  },

  // Offline queue sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 10, 22, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#04203f',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '82%',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetEmpty: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 12,
  },
  sheetEmptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  queueRowFailed: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.22)',
  },
  queueIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  queueMeta: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  queueError: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    lineHeight: 15,
  },
  queueDiscard: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  queueDiscardText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '800',
  },
  sheetDivider: {
    marginTop: 14,
    marginBottom: 8,
  },
  sheetDividerText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sheetGhostBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
  },
  sheetGhostBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11.5,
    fontWeight: '800',
  },
  sheetNote: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 10,
  },
  sheetPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00e5ff',
    paddingVertical: 14,
    borderRadius: 20,
    marginTop: 14,
  },
  sheetPrimaryBtnText: {
    color: '#001f3f',
    fontWeight: '900',
    fontSize: 14,
  },
});
