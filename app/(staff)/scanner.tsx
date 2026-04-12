import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { fetchAPI } from '../../utils/api';

type ScanState = 'idle' | 'scanning' | 'loading' | 'success' | 'error';
type StatusState = 'loading' | 'none' | 'checkedIn' | 'complete' | 'error';

type AttendanceRecord = {
  _id: string;
  userId: string;
  date: string;          // "YYYY-MM-DD"
  checkInTime: string;   // ISO 8601
  checkOutTime: string | null;
  status: 'Present' | 'Late' | 'Absent';
};

type AttendanceTimes = {
  checkInStart: string;
  checkInEnd: string;
  checkOutStart: string;
  checkOutEnd: string;
};

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [statusState, setStatusState] = useState<StatusState>('loading');
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [mode, setMode] = useState<'IN' | 'OUT'>('IN');
  const [times, setTimes] = useState<AttendanceTimes>({
    checkInStart: '07:00', checkInEnd: '09:00',
    checkOutStart: '15:00', checkOutEnd: '20:00',
  });
  const { user } = useAuth();

  const formatTime = (isoString: string): string => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const fetchTodayStatus = async () => {
    setStatusState('loading');
    try {
      const records: AttendanceRecord[] = await fetchAPI(`/attendance/history?userId=${user?._id}`);
      const today = new Date().toISOString().split('T')[0];
      const record = records.find((r) => r.date === today) ?? null;

      if (!record) {
        setStatusState('none');
      } else if (record.checkInTime && !record.checkOutTime) {
        setStatusState('checkedIn');
        setCheckInTime(formatTime(record.checkInTime));
        setMode('OUT');
      } else if (record.checkInTime && record.checkOutTime) {
        setStatusState('complete');
      }
    } catch {
      setStatusState('error');
    }
  };

  useEffect(() => {
    fetchAPI('/settings')
      .then((data: AttendanceTimes) => setTimes(data))
      .catch(() => {}); // silently use defaults
  }, []);

  useEffect(() => {
    if (scanState === 'idle') fetchTodayStatus();
  }, [scanState]);

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <MaterialCommunityIcons name="camera-off" size={48} color="rgba(255,255,255,0.3)" />
        <Text style={styles.permissionText}>Camera access is required to scan QR codes</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarcodeScanned = async ({ data }: { type: string; data: string }) => {
    // Camera is live — lock it immediately so no further scans fire
    setScanState('loading');

    try {
      const response = await fetchAPI('/attendance/scan', {
        method: 'POST',
        body: JSON.stringify({ userId: user?._id, locationToken: data, action: mode }),
      });
      setResultMessage(response.message);
      setScanState('success');
    } catch (err: any) {
      setResultMessage(err.message || 'Unable to record attendance.');
      setScanState('error');
    }
  };

  const reset = () => {
    setResultMessage('');
    setScanState('idle');
    // fetchTodayStatus is triggered by the useEffect watching scanState === 'idle'
  };

  const startScan = () => setScanState('scanning');

  const isComplete = statusState === 'complete';

  const renderStatusIndicator = () => {
    if (statusState === 'loading') return <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />;
    if (statusState === 'none')    return <Text style={styles.statusNone}>Not checked in yet</Text>;
    if (statusState === 'checkedIn') return <Text style={styles.statusIn}>Checked in at {checkInTime}</Text>;
    if (statusState === 'complete')  return <Text style={styles.statusComplete}>Attendance complete for today</Text>;
    return null;
  };

  // ── IDLE: prompt user to tap Scan ──────────────────────────────────────────
  if (scanState === 'idle') {
    return (
      <View style={styles.container}>
        <View style={styles.modeSelector}>
          <View style={styles.modeContainer}>
            <TouchableOpacity style={[styles.modeButton, mode === 'IN' && styles.modeActive]} onPress={() => setMode('IN')}>
              <Text style={[styles.modeText, mode === 'IN' && styles.modeTextActive]}>CHECK IN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modeButton, mode === 'OUT' && styles.modeActive]} onPress={() => setMode('OUT')}>
              <Text style={[styles.modeText, mode === 'OUT' && styles.modeTextActive]}>CHECK OUT</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.idleContent}>
          <View style={styles.idleIconRing}>
            <MaterialCommunityIcons name="qrcode-scan" size={52} color={Colors.light.accent} />
          </View>
          <Text style={styles.idleTitle}>Ready to {mode === 'IN' ? 'Check In' : 'Check Out'}</Text>
          <Text style={styles.idleSubtitle}>Point your camera at the Aflon QR code and tap the button below</Text>

          {/* Time window info */}
          <View style={styles.timeCard}>
            <View style={styles.timeRow}>
              <MaterialCommunityIcons name="login" size={14} color="#10b981" />
              <Text style={styles.timeLabel}>Check-In</Text>
              <Text style={styles.timeValue}>{times.checkInStart} – {times.checkInEnd} <Text style={styles.timeSub}>(on-time)</Text></Text>
            </View>
            <View style={[styles.timeRow, { marginTop: 8 }]}>
              <MaterialCommunityIcons name="logout" size={14} color="#60a5fa" />
              <Text style={styles.timeLabel}>Check-Out</Text>
              <Text style={styles.timeValue}>{times.checkOutStart} – {times.checkOutEnd}</Text>
            </View>
          </View>

          {/* Status indicator */}
          <View style={styles.statusRow}>{renderStatusIndicator()}</View>

          <TouchableOpacity
            style={[styles.scanBtn, isComplete && { opacity: 0.4 }]}
            onPress={isComplete ? undefined : startScan}
            disabled={isComplete}
          >
            <MaterialCommunityIcons name="line-scan" size={20} color="#001f3f" />
            <Text style={styles.scanBtnText}>Start Scanning</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── SCANNING: live camera, locked after first read ─────────────────────────
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
          <View style={styles.scanBox} />
          <Text style={styles.hintText}>Align QR code within the frame</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={reset}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── LOADING: processing ────────────────────────────────────────────────────
  if (scanState === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.light.accent} />
        <Text style={styles.loadingText}>Syncing with server...</Text>
      </View>
    );
  }

  // ── SUCCESS / ERROR: result screen ────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.resultCard}>
        <MaterialCommunityIcons
          name={scanState === 'success' ? 'check-circle' : 'alert-circle'}
          size={72}
          color={scanState === 'success' ? Colors.light.success : '#ef4444'}
        />
        <Text style={styles.resultTitle}>{scanState === 'success' ? 'Verified!' : 'Scan Failed'}</Text>
        <Text style={styles.resultMessage}>{resultMessage}</Text>
        <TouchableOpacity style={styles.scanBtn} onPress={reset}>
          <MaterialCommunityIcons name="refresh" size={18} color="#001f3f" />
          <Text style={styles.scanBtnText}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Mode toggle
  modeSelector: {
    position: 'absolute',
    top: 56,
    left: 24,
    right: 24,
    zIndex: 10,
  },
  modeContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 30,
    padding: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  modeButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 24,
    alignItems: 'center',
  },
  modeActive: {
    backgroundColor: Colors.light.accent,
  },
  modeText: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 1,
  },
  modeTextActive: {
    color: '#001f3f',
  },

  // Idle screen
  idleContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  idleIconRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,168,204,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  idleTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    marginBottom: 10,
  },
  idleSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 36,
  },

  // Scan button
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.accent,
    paddingVertical: 15,
    paddingHorizontal: 36,
    borderRadius: 30,
    shadowColor: Colors.light.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  scanBtnText: {
    color: '#001f3f',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.5,
  },

  // Camera overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBox: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: Colors.light.accent,
    borderRadius: 16,
    backgroundColor: 'transparent',
    marginBottom: 24,
  },
  hintText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 32,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cancelBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700',
    fontSize: 14,
  },

  // Loading
  loadingText: {
    marginTop: 16,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },

  // Result
  resultCard: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: 'white',
    marginTop: 20,
    marginBottom: 10,
  },
  resultMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 36,
    paddingHorizontal: 16,
  },

  // Time card
  timeCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 14,
    marginBottom: 28,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '700',
    width: 76,
  },
  timeValue: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  timeSub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
  },

  // Status indicator
  statusRow: {
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusNone: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '600',
  },
  statusIn: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '700',
  },
  statusComplete: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '700',
  },

  // Permission
  permissionText: {
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    fontSize: 14,
    paddingHorizontal: 32,
  },
  permissionBtn: {
    backgroundColor: Colors.light.accent,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  permissionBtnText: {
    color: '#001f3f',
    fontWeight: '800',
    fontSize: 14,
  },
});
