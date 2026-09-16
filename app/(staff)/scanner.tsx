import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { APIError, fetchAPI } from '../../utils/api';
import {
  checkServerConnectivity,
  enqueueOfflineScan,
  getCachedTodayStatus,
  getPendingOfflineScans,
  getTodayDateString,
  setCachedTodayStatus,
  syncOfflineQueue,
} from '../../utils/offlineSync';

type ScanState = 'idle' | 'scanning' | 'loading' | 'success' | 'error';
type StatusState = 'loading' | 'none' | 'checkedIn' | 'complete' | 'error';

type AttendanceRecord = {
  _id: string;
  userId: string;
  date: string;          // "YYYY-MM-DD"
  checkInTime: string;   // ISO 8601
  checkOutTime: string | null;
  status: 'Early' | 'OnTime' | 'Present' | 'Late' | 'Absent';
};

type AttendanceTimes = {
  checkInEnd: string;
  checkInClose: string;
  checkOutStart: string;
  checkOutEnd: string;
  fridayCheckOutStart: string;
  fridayCheckOutEnd: string;
};

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [statusState, setStatusState] = useState<StatusState>('loading');
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [isOfflineResult, setIsOfflineResult] = useState(false);
  const [mode, setMode] = useState<'IN' | 'OUT'>('IN');
  const [times, setTimes] = useState<AttendanceTimes>({
    checkInEnd: '09:00', checkInClose: '11:00',
    checkOutStart: '15:00', checkOutEnd: '20:00',
    fridayCheckOutStart: '', fridayCheckOutEnd: '',
  });

  // Offline sync & connectivity state
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOfflinePendingToday, setIsOfflinePendingToday] = useState(false);

  const { user } = useAuth();

  const formatTime = (isoString: string): string => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // Update pending offline items count
  const refreshPendingCount = async () => {
    const queue = await getPendingOfflineScans();
    setPendingCount(queue.length);
  };

  // Check connectivity and trigger sync if back online
  const checkConnectivity = async () => {
    const online = await checkServerConnectivity();
    setIsOnline(online);

    if (online) {
      const queue = await getPendingOfflineScans();
      if (queue.length > 0 && !isSyncing) {
        handleTriggerSync();
      }
    }
  };

  const handleTriggerSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const { syncedCount } = await syncOfflineQueue();
      if (syncedCount > 0) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }
      await refreshPendingCount();
      await fetchTodayStatus();
    } catch (e) {
      console.error('Manual sync failed', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchTodayStatus = async () => {
    setStatusState('loading');
    const today = getTodayDateString();

    // Check cached today status first for instant display
    const cachedToday = await getCachedTodayStatus();
    if (cachedToday && cachedToday.date === today) {
      if (cachedToday.status === 'checkedIn' && cachedToday.checkInTime) {
        setCheckInTime(formatTime(cachedToday.checkInTime));
        setStatusState('checkedIn');
        setMode('OUT');
        setIsOfflinePendingToday(!!cachedToday.isOfflinePending);
      } else if (cachedToday.status === 'complete') {
        setStatusState('complete');
        setIsOfflinePendingToday(!!cachedToday.isOfflinePending);
      }
    }

    try {
      const res = await fetchAPI(`/attendance/history?userId=${user?._id}`);
      const list: AttendanceRecord[] = Array.isArray(res) ? res : (res?.records || []);
      const record = list.find((r) => r.date === today) ?? null;

      if (!record) {
        // If not on server, but we have a pending offline check-in today, keep offline state
        if (cachedToday?.status === 'checkedIn' && cachedToday.isOfflinePending) {
          setStatusState('checkedIn');
          setMode('OUT');
          setIsOfflinePendingToday(true);
        } else if (cachedToday?.status === 'complete' && cachedToday.isOfflinePending) {
          setStatusState('complete');
          setIsOfflinePendingToday(true);
        } else {
          setStatusState('none');
          setIsOfflinePendingToday(false);
          await setCachedTodayStatus({
            date: today,
            checkInTime: null,
            checkOutTime: null,
            status: 'none',
          });
        }
      } else if (record.checkInTime && !record.checkOutTime) {
        setStatusState('checkedIn');
        setCheckInTime(formatTime(record.checkInTime));
        setMode('OUT');
        setIsOfflinePendingToday(false);
        await setCachedTodayStatus({
          date: today,
          checkInTime: record.checkInTime,
          checkOutTime: null,
          status: 'checkedIn',
          isOfflinePending: false,
        });
      } else if (record.checkInTime && record.checkOutTime) {
        setStatusState('complete');
        setIsOfflinePendingToday(false);
        await setCachedTodayStatus({
          date: today,
          checkInTime: record.checkInTime,
          checkOutTime: record.checkOutTime,
          status: 'complete',
          isOfflinePending: false,
        });
      }
    } catch {
      // Offline fallback: rely on local cache if server is unreachable
      if (cachedToday && cachedToday.date === today) {
        if (cachedToday.status === 'checkedIn') {
          setStatusState('checkedIn');
          setCheckInTime(formatTime(cachedToday.checkInTime || new Date().toISOString()));
          setMode('OUT');
          setIsOfflinePendingToday(!!cachedToday.isOfflinePending);
        } else if (cachedToday.status === 'complete') {
          setStatusState('complete');
          setIsOfflinePendingToday(!!cachedToday.isOfflinePending);
        } else {
          setStatusState('none');
        }
      } else {
        setStatusState('none');
      }
    }
  };

  useEffect(() => {
    fetchAPI('/settings')
      .then((data: AttendanceTimes) => {
        setTimes(data);
        setIsOnline(true);
      })
      .catch(() => {
        setIsOnline(false);
      });

    refreshPendingCount();

    // Check connectivity every 20 seconds
    const interval = setInterval(() => {
      checkConnectivity();
      refreshPendingCount();
    }, 20000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scanState === 'idle') {
      fetchTodayStatus();
      refreshPendingCount();
    }
  }, [scanState]);

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

  const handleBarcodeScanned = async ({ data }: { type: string; data: string }) => {
    setScanState('loading');
    setIsOfflineResult(false);

    try {
      // Validate location token
      if (data !== 'static-wall-qr') {
        throw new Error('Invalid QR code. Please scan the official Aflon station code.');
      }

      // Try sending to the backend
      const response = await fetchAPI('/attendance/scan', {
        method: 'POST',
        body: JSON.stringify({ userId: user?._id, locationToken: data, action: mode }),
      });

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      setResultMessage(response.message || 'Attendance recorded successfully.');
      setScanState('success');

      // Also trigger sync for any other pending offline records
      syncOfflineQueue().catch(() => {});
    } catch (err: any) {
      // Check if this is a network error (no connection, server unreachable)
      const isNetworkError = (err instanceof APIError && err.status === 0) || !isOnline;

      if (isNetworkError && user?._id) {
        // Record offline!
        try {
          await enqueueOfflineScan({
            userId: user._id,
            locationToken: data,
            action: mode,
          });

          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}

          setIsOfflineResult(true);
          setResultMessage(
            `${mode === 'IN' ? 'Check-In' : 'Check-Out'} recorded offline!\nIt is securely saved on this device and will automatically submit once internet is restored.`
          );
          setScanState('success');
          await refreshPendingCount();
          return;
        } catch (queueErr) {
          console.error('Failed to queue offline scan', queueErr);
        }
      }

      // Other API errors (e.g. "Check-out window has closed", "You are already checked in")
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}

      setResultMessage(err.message || 'Unable to record attendance.');
      setScanState('error');
    }
  };

  const reset = () => {
    setResultMessage('');
    setIsOfflineResult(false);
    setScanState('idle');
  };

  const startScan = () => setScanState('scanning');

  const isComplete = statusState === 'complete';

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
        <View style={[styles.statusPill, { borderColor: 'rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
          <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
          <Text style={styles.statusIn}>
            Checked in at {checkInTime || 'today'}
            {isOfflinePendingToday ? ' (Offline • Pending Sync)' : ''}
          </Text>
        </View>
      );
    }
    if (statusState === 'complete') {
      return (
        <View style={[styles.statusPill, { borderColor: 'rgba(96, 165, 250, 0.3)', backgroundColor: 'rgba(96, 165, 250, 0.12)' }]}>
          <View style={[styles.statusDot, { backgroundColor: '#60a5fa' }]} />
          <Text style={styles.statusComplete}>Attendance complete for today</Text>
        </View>
      );
    }
    return null;
  };

  // ── IDLE SCREEN ──────────────────────────────────────────────────────────
  if (scanState === 'idle') {
    return (
      <View style={styles.container}>
        {/* Top Connectivity & Sync Bar */}
        <View style={styles.topBar}>
          <View style={[styles.networkBadge, isOnline ? styles.badgeOnline : styles.badgeOffline]}>
            <View style={[styles.networkDot, { backgroundColor: isOnline ? '#10b981' : '#f59e0b' }]} />
            <Text style={styles.networkBadgeText}>
              {isOnline ? 'Online' : 'Offline Mode'}
            </Text>
          </View>

          {pendingCount > 0 && (
            <TouchableOpacity
              style={styles.pendingSyncButton}
              onPress={handleTriggerSync}
              disabled={isSyncing || !isOnline}
              activeOpacity={0.8}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#001f3f" />
              ) : (
                <MaterialCommunityIcons name="cloud-upload-outline" size={15} color="#001f3f" />
              )}
              <Text style={styles.pendingSyncText}>
                {isSyncing ? 'Syncing...' : `${pendingCount} Queued • Sync Now`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Mode Selector */}
        <View style={styles.modeSelector}>
          <View style={styles.modeContainer}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'IN' && styles.modeActive]}
              onPress={() => setMode('IN')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="login"
                size={16}
                color={mode === 'IN' ? '#001f3f' : 'rgba(255,255,255,0.4)'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeText, mode === 'IN' && styles.modeTextActive]}>CHECK IN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'OUT' && styles.modeActive]}
              onPress={() => setMode('OUT')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="logout"
                size={16}
                color={mode === 'OUT' ? '#001f3f' : 'rgba(255,255,255,0.4)'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeText, mode === 'OUT' && styles.modeTextActive]}>CHECK OUT</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Idle Content */}
        <View style={styles.idleContent}>
          <View style={styles.idleIconGlow}>
            <View style={styles.idleIconRing}>
              <MaterialCommunityIcons name="qrcode-scan" size={56} color="#00e5ff" />
            </View>
          </View>

          <Text style={styles.idleTitle}>
            Ready to {mode === 'IN' ? 'Check In' : 'Check Out'}
          </Text>
          <Text style={styles.idleSubtitle}>
            Scan the Aflon wall station QR code. Works seamlessly online and offline!
          </Text>

          {/* Time Window Details Card */}
          <View style={styles.timeCard}>
            <View style={styles.timeRow}>
              <View style={styles.timeIconWrapIn}>
                <MaterialCommunityIcons name="arrow-down-bold" size={14} color="#10b981" />
              </View>
              <Text style={styles.timeLabel}>Check-In</Text>
              <Text style={styles.timeValue}>
                On-time before {times.checkInEnd} <Text style={styles.timeSub}>(closes {times.checkInClose})</Text>
              </Text>
            </View>
            <View style={[styles.timeRow, { marginTop: 10 }]}>
              <View style={styles.timeIconWrapOut}>
                <MaterialCommunityIcons name="arrow-up-bold" size={14} color="#60a5fa" />
              </View>
              <Text style={styles.timeLabel}>Check-Out</Text>
              {(() => {
                const isFriday = new Date().getDay() === 5;
                const useFriday = isFriday && times.fridayCheckOutStart && times.fridayCheckOutEnd;
                const start = useFriday ? times.fridayCheckOutStart : times.checkOutStart;
                const end = useFriday ? times.fridayCheckOutEnd : times.checkOutEnd;
                return (
                  <Text style={styles.timeValue}>
                    {start} – {end}
                    {useFriday ? <Text style={styles.timeSub}> (Friday Schedule)</Text> : null}
                  </Text>
                );
              })()}
            </View>
          </View>

          {/* Current Day Status Pill */}
          <View style={styles.statusRow}>{renderStatusIndicator()}</View>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.scanBtn, isComplete && { opacity: 0.4 }]}
            onPress={isComplete ? undefined : startScan}
            disabled={isComplete}
            activeOpacity={0.88}
          >
            <MaterialCommunityIcons name="line-scan" size={22} color="#001f3f" />
            <Text style={styles.scanBtnText}>
              {isComplete ? 'Completed For Today' : 'Start Camera Scan'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── CAMERA SCANNING SCREEN ────────────────────────────────────────────────
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
          {/* Top mode indicator */}
          <View style={styles.scanHeader}>
            <View style={styles.scanModePill}>
              <Text style={styles.scanModeText}>
                SCANNING TO {mode === 'IN' ? 'CHECK IN' : 'CHECK OUT'}
              </Text>
            </View>
          </View>

          {/* Target Scan Box with Brackets */}
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

  // ── LOADING / PROCESSING ──────────────────────────────────────────────────
  if (scanState === 'loading') {
    return (
      <View style={styles.container}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#00e5ff" />
          <Text style={styles.loadingTitle}>Processing Attendance</Text>
          <Text style={styles.loadingSub}>Verifying code & recording timestamp...</Text>
        </View>
      </View>
    );
  }

  // ── SUCCESS / ERROR RESULT SCREEN ─────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.resultCard}>
        <View
          style={[
            styles.resultIconRing,
            {
              backgroundColor:
                scanState === 'success'
                  ? isOfflineResult
                    ? 'rgba(245, 158, 11, 0.18)'
                    : 'rgba(16, 185, 129, 0.18)'
                  : 'rgba(239, 68, 68, 0.18)',
            },
          ]}
        >
          <MaterialCommunityIcons
            name={
              scanState === 'success'
                ? isOfflineResult
                  ? 'cloud-clock'
                  : 'check-circle'
                : 'alert-circle'
            }
            size={76}
            color={
              scanState === 'success'
                ? isOfflineResult
                  ? '#f59e0b'
                  : '#10b981'
                : '#ef4444'
            }
          />
        </View>

        <Text style={styles.resultTitle}>
          {scanState === 'success'
            ? isOfflineResult
              ? 'Saved Offline!'
              : 'Verified!'
            : 'Scan Failed'}
        </Text>

        <Text style={styles.resultMessage}>{resultMessage}</Text>

        {isOfflineResult && (
          <View style={styles.offlineNoticeBox}>
            <MaterialCommunityIcons name="information-outline" size={16} color="#f59e0b" />
            <Text style={styles.offlineNoticeText}>
              Your check-in timestamp has been locked. It will automatically submit with your exact arrival time when online.
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

  // Top Status Bar
  topBar: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    position: 'absolute',
    top: 96,
    left: 24,
    right: 24,
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
    marginTop: 80,
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
});
