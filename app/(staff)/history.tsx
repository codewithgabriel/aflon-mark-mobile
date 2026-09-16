import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Animated,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { fetchAPI } from '../../utils/api';
import {
  getCachedHistory,
  getPendingOfflineScans,
  setCachedHistory,
  syncOfflineQueue,
} from '../../utils/offlineSync';

// ── Types ─────────────────────────────────────────────────────────────────────
type AttendanceRecord = {
  _id: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: 'Early' | 'OnTime' | 'Present' | 'Late' | 'Absent';
  isOfflinePending?: boolean;
  action?: 'IN' | 'OUT';
};

type MonthlySummary = {
  month: string;       // "YYYY-MM"
  activeDays: number;
  presentDays: number;
  lateDays: number;
  totalHours: number;
  totalMinutes: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

const fmtDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtMonth = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
};

const duration = (checkIn: string, checkOut: string | null) => {
  if (!checkOut) return null;
  const mins = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000);
  if (mins < 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// ── Skeleton Loader ───────────────────────────────────────────────────────────
function SkeletonCard() {
  const [opacity] = useState(() => new Animated.Value(0.25));
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.65, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.25, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);
  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.skeletonDate} />
      <View style={styles.skeletonRow}>
        <View style={styles.skeletonLine} />
        <View style={styles.skeletonBadge} />
      </View>
    </Animated.View>
  );
}

// ── Pulse Dot for Active Session ──────────────────────────────────────────────
function PulseDot() {
  const [scale] = useState(() => new Animated.Value(1));
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.6, duration: 800, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.2, duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, [scale, opacity]);
  return (
    <View style={styles.pulseWrapper}>
      <Animated.View style={[styles.pulseDot, { transform: [{ scale }], opacity }]} />
      <View style={styles.pulseDotCore} />
    </View>
  );
}

// ── Monthly Summary Card ──────────────────────────────────────────────────────
function MonthlySummaryCard({ summary }: { summary: MonthlySummary }) {
  const totalH = summary.totalHours;
  const totalM = summary.totalMinutes;
  return (
    <View style={styles.summaryCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={styles.summaryMonth}>{fmtMonth(summary.month)}</Text>
        <View style={styles.summaryBadge}>
          <Text style={styles.summaryBadgeText}>Monthly Overview</Text>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.activeDays}</Text>
          <Text style={styles.summaryLabel}>Active Days</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#10b981' }]}>{summary.presentDays}</Text>
          <Text style={styles.summaryLabel}>On Time</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>{summary.lateDays}</Text>
          <Text style={styles.summaryLabel}>Late</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#60a5fa' }]}>
            {totalH > 0 ? `${totalH}h` : ''}{totalM > 0 ? ` ${totalM}m` : totalH === 0 ? '0h' : ''}
          </Text>
          <Text style={styles.summaryLabel}>Hours</Text>
        </View>
      </View>
    </View>
  );
}

// ── Log Card Component ────────────────────────────────────────────────────────
function LogCard({ item }: { item: AttendanceRecord }) {
  const dur = duration(item.checkInTime, item.checkOutTime);

  const statusConfig = item.isOfflinePending
    ? { bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24', label: 'Offline • Pending Sync' }
    : {
        Early: { bg: 'rgba(16, 185, 129, 0.18)', text: '#34d399', label: 'Early' },
        OnTime: { bg: 'rgba(59, 130, 246, 0.18)', text: '#60a5fa', label: 'On Time' },
        Present: { bg: 'rgba(16, 185, 129, 0.18)', text: '#34d399', label: 'On Time' },
        Late: { bg: 'rgba(245, 158, 11, 0.18)', text: '#fbbf24', label: 'Late' },
        Absent: { bg: 'rgba(239, 68, 68, 0.18)', text: '#f87171', label: 'Absent' },
      }[item.status] ?? { bg: 'rgba(255, 255, 255, 0.1)', text: 'white', label: item.status };

  return (
    <View style={[styles.card, item.isOfflinePending && styles.offlineCardBorder]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {item.isOfflinePending && (
            <MaterialCommunityIcons name="cloud-clock-outline" size={16} color="#fbbf24" />
          )}
          <Text style={styles.dateText}>{fmtDate(item.date)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusConfig.bg }]}>
          <Text style={[styles.badgeText, { color: statusConfig.text }]}>{statusConfig.label}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Times */}
      <View style={styles.timesRow}>
        <View style={styles.timeItem}>
          <MaterialCommunityIcons name="clock-check-outline" size={16} color="#34d399" />
          <View style={styles.timeTexts}>
            <Text style={styles.timeLabel}>Check-in</Text>
            <Text style={[styles.timeValue, { color: '#34d399' }]}>{fmtTime(item.checkInTime)}</Text>
          </View>
        </View>

        <View style={styles.timesDivider} />

        <View style={styles.timeItem}>
          {item.checkOutTime ? (
            <>
              <MaterialCommunityIcons name="clock-out" size={16} color="#60a5fa" />
              <View style={styles.timeTexts}>
                <Text style={styles.timeLabel}>Check-out</Text>
                <Text style={[styles.timeValue, { color: '#60a5fa' }]}>{fmtTime(item.checkOutTime)}</Text>
              </View>
            </>
          ) : (
            <>
              <PulseDot />
              <View style={styles.timeTexts}>
                <Text style={styles.timeLabel}>Check-out</Text>
                <Text style={[styles.timeValue, { color: '#00e5ff' }]}>Active</Text>
              </View>
            </>
          )}
        </View>

        {dur && (
          <>
            <View style={styles.timesDivider} />
            <View style={styles.timeItem}>
              <MaterialCommunityIcons name="timer-outline" size={16} color="rgba(255,255,255,0.4)" />
              <View style={styles.timeTexts}>
                <Text style={styles.timeLabel}>Duration</Text>
                <Text style={[styles.timeValue, { color: 'rgba(255,255,255,0.85)' }]}>{dur}</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ── Month Picker ──────────────────────────────────────────────────────────────
function MonthPicker({
  months,
  selected,
  onSelect,
}: {
  months: string[];
  selected: string;
  onSelect: (m: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.monthPicker}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 12 }}
    >
      <TouchableOpacity
        style={[styles.monthChip, selected === 'all' && styles.monthChipActive]}
        onPress={() => onSelect('all')}
        activeOpacity={0.8}
      >
        <Text style={[styles.monthChipText, selected === 'all' && styles.monthChipTextActive]}>
          All Months
        </Text>
      </TouchableOpacity>
      {months.map((m) => (
        <TouchableOpacity
          key={m}
          style={[styles.monthChip, selected === m && styles.monthChipActive]}
          onPress={() => onSelect(m)}
          activeOpacity={0.8}
        >
          <Text style={[styles.monthChipText, selected === m && styles.monthChipTextActive]}>
            {fmtMonth(m)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconRing}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={48} color="rgba(255,255,255,0.2)" />
      </View>
      <Text style={styles.emptyTitle}>No Attendance Records</Text>
      <Text style={styles.emptySubtitle}>
        Your check-in history will appear here once you start scanning at the campus stations.
      </Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function HistoryScreen() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  const fetchHistory = async () => {
    // 1. Check local cache first for instant display
    const cached = await getCachedHistory();
    if (cached && cached.length > 0 && records.length === 0) {
      setRecords(cached);
      setLoading(false);
    }

    try {
      // 2. Fetch from backend
      const data = await fetchAPI(`/attendance/history?userId=${user?._id}`);
      const serverRecords: AttendanceRecord[] = data.records ?? (Array.isArray(data) ? data : []);
      const summaries: MonthlySummary[] = data.monthlySummary ?? [];

      // 3. Merge pending offline scans that may not be on the server yet
      const pendingQueue = await getPendingOfflineScans();
      const userPending = pendingQueue.filter((q) => q.userId === user?._id);

      const mergedRecords: AttendanceRecord[] = [...serverRecords];

      // Add any pending offline scan if it doesn't already exist on server for that date
      for (const pending of userPending) {
        const alreadyExists = mergedRecords.some((r) => r.date === pending.date);
        if (!alreadyExists) {
          mergedRecords.unshift({
            _id: pending.id,
            date: pending.date,
            checkInTime: pending.timestamp,
            checkOutTime: pending.action === 'OUT' ? pending.timestamp : null,
            status: 'Present',
            isOfflinePending: true,
            action: pending.action,
          });
        }
      }

      setRecords(mergedRecords);
      setMonthlySummary(summaries);
      await setCachedHistory(mergedRecords);
    } catch (err) {
      // Offline fallback: load cached
      console.warn('Unable to load history from server, using cached records.', err);
      const cachedRecords = await getCachedHistory();
      if (cachedRecords && cachedRecords.length > 0) {
        setRecords(cachedRecords);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // Sync any pending scans first
    await syncOfflineQueue().catch(() => {});
    await fetchHistory();
  };

  const months = monthlySummary.map((s) => s.month);

  const filteredRecords =
    selectedMonth === 'all'
      ? records
      : records.filter((r) => r.date.startsWith(selectedMonth));

  const activeSummary =
    selectedMonth === 'all'
      ? null
      : monthlySummary.find((s) => s.month === selectedMonth) ?? null;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.listContent}>
          {[1, 2, 3, 4].map((k) => (
            <SkeletonCard key={k} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Month Filter Chips */}
      {months.length > 0 && (
        <MonthPicker months={months} selected={selectedMonth} onSelect={setSelectedMonth} />
      )}

      <FlatList
        data={filteredRecords}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <LogCard item={item} />}
        contentContainerStyle={[
          styles.listContent,
          filteredRecords.length === 0 && styles.listEmpty,
        ]}
        ListHeaderComponent={
          activeSummary ? <MonthlySummaryCard summary={activeSummary} /> : null
        }
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00e5ff"
            colors={['#00e5ff']}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#001f3f',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Month Chips
  monthPicker: {
    flexGrow: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  monthChip: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  monthChipActive: {
    backgroundColor: '#00e5ff',
    borderColor: '#00e5ff',
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  monthChipText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '700',
  },
  monthChipTextActive: {
    color: '#001f3f',
    fontWeight: '900',
  },

  // Monthly Summary Card
  summaryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    padding: 18,
    marginBottom: 8,
  },
  summaryMonth: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  summaryBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  summaryBadgeText: {
    color: '#00e5ff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 2,
  },
  summaryLabel: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },

  // Card
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
  },
  offlineCardBorder: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    marginBottom: 12,
  },
  timesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  timeTexts: {
    flexDirection: 'column',
  },
  timeLabel: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  timeValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  timesDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 8,
  },

  // Pulse Dot
  pulseWrapper: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00e5ff',
  },
  pulseDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00e5ff',
  },

  // Skeleton
  skeletonDate: {
    width: 120,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    marginBottom: 14,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonLine: {
    width: '60%',
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 7,
  },
  skeletonBadge: {
    width: 60,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  emptyIconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 24,
  },
});
