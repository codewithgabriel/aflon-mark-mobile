import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, FlatList, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { fetchAPI } from '../../utils/api';

// ── Types ─────────────────────────────────────────────────────────────────────
type AttendanceRecord = {
  _id: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: 'Early' | 'OnTime' | 'Present' | 'Late' | 'Absent';
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
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
    ])).start();
  }, []);
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

// ── Pulse dot ─────────────────────────────────────────────────────────────────
function PulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(scale,   { toValue: 1.6, duration: 800, useNativeDriver: true }),
        Animated.timing(scale,   { toValue: 1,   duration: 800, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ]),
    ])).start();
  }, []);
  return (
    <View style={styles.pulseWrapper}>
      <Animated.View style={[styles.pulseDot, { transform: [{ scale }], opacity }]} />
      <View style={styles.pulseDotCore} />
    </View>
  );
}

// ── Monthly summary card ──────────────────────────────────────────────────────
function MonthlySummaryCard({ summary }: { summary: MonthlySummary }) {
  const totalH = summary.totalHours;
  const totalM = summary.totalMinutes;
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryMonth}>{fmtMonth(summary.month)}</Text>
      <View style={styles.summaryGrid}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.activeDays}</Text>
          <Text style={styles.summaryLabel}>Active Days</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#48bb78' }]}>{summary.presentDays}</Text>
          <Text style={styles.summaryLabel}>On Time</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#ecc94b' }]}>{summary.lateDays}</Text>
          <Text style={styles.summaryLabel}>Late</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {totalH > 0 ? `${totalH}h` : ''}{totalM > 0 ? ` ${totalM}m` : totalH === 0 ? '—' : ''}
          </Text>
          <Text style={styles.summaryLabel}>Total Hours</Text>
        </View>
      </View>
    </View>
  );
}

// ── Log card ──────────────────────────────────────────────────────────────────
function LogCard({ item }: { item: AttendanceRecord }) {
  const dur = duration(item.checkInTime, item.checkOutTime);
  const statusConfig = {
    Early:   { bg: 'rgba(56,161,105,0.18)',  text: '#48bb78', label: 'Early'   },
    OnTime:  { bg: 'rgba(59,130,246,0.18)',  text: '#60a5fa', label: 'On Time' },
    Present: { bg: 'rgba(56,161,105,0.18)',  text: '#48bb78', label: 'On Time' },
    Late:    { bg: 'rgba(214,158,46,0.18)',  text: '#ecc94b', label: 'Late'    },
    Absent:  { bg: 'rgba(229,62,62,0.18)',   text: '#fc8181', label: 'Absent'  },
  }[item.status] ?? { bg: 'rgba(255,255,255,0.1)', text: 'white', label: item.status };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.dateText}>{fmtDate(item.date)}</Text>
        <View style={[styles.badge, { backgroundColor: statusConfig.bg }]}>
          <Text style={[styles.badgeText, { color: statusConfig.text }]}>{statusConfig.label}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Times */}
      <View style={styles.timesRow}>
        <View style={styles.timeItem}>
          <MaterialCommunityIcons name="clock-check-outline" size={15} color="#48bb78" />
          <View style={styles.timeTexts}>
            <Text style={styles.timeLabel}>Check-in</Text>
            <Text style={[styles.timeValue, { color: '#48bb78' }]}>{fmtTime(item.checkInTime)}</Text>
          </View>
        </View>

        <View style={styles.timesDivider} />

        <View style={styles.timeItem}>
          {item.checkOutTime ? (
            <>
              <MaterialCommunityIcons name="clock-out" size={15} color="#60a5fa" />
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
                <Text style={[styles.timeValue, { color: Colors.light.accent }]}>Active</Text>
              </View>
            </>
          )}
        </View>

        {dur && (
          <>
            <View style={styles.timesDivider} />
            <View style={styles.timeItem}>
              <MaterialCommunityIcons name="timer-outline" size={15} color="rgba(255,255,255,0.5)" />
              <View style={styles.timeTexts}>
                <Text style={styles.timeLabel}>Duration</Text>
                <Text style={[styles.timeValue, { color: 'rgba(255,255,255,0.8)' }]}>{dur}</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ── Month picker ──────────────────────────────────────────────────────────────
function MonthPicker({ months, selected, onSelect }: { months: string[]; selected: string; onSelect: (m: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthPicker} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      <TouchableOpacity
        style={[styles.monthChip, selected === 'all' && styles.monthChipActive]}
        onPress={() => onSelect('all')}
      >
        <Text style={[styles.monthChipText, selected === 'all' && styles.monthChipTextActive]}>All</Text>
      </TouchableOpacity>
      {months.map(m => (
        <TouchableOpacity
          key={m}
          style={[styles.monthChip, selected === m && styles.monthChipActive]}
          onPress={() => onSelect(m)}
        >
          <Text style={[styles.monthChipText, selected === m && styles.monthChipTextActive]}>
            {fmtMonth(m)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconRing}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={44} color="rgba(255,255,255,0.2)" />
      </View>
      <Text style={styles.emptyTitle}>No records yet</Text>
      <Text style={styles.emptySubtitle}>Your attendance history will appear here once you start checking in.</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HistoryScreen() {
  const { user } = useAuth();
  const [records, setRecords]           = useState<AttendanceRecord[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  useEffect(() => { fetchHistory(); }, []);

  const fetchHistory = async () => {
    try {
      const data = await fetchAPI(`/attendance/history?userId=${user?._id}`);
      setRecords(data.records ?? []);
      setMonthlySummary(data.monthlySummary ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const months = monthlySummary.map(s => s.month);

  const filteredRecords = selectedMonth === 'all'
    ? records
    : records.filter(r => r.date.startsWith(selectedMonth));

  const activeSummary = selectedMonth === 'all'
    ? null
    : monthlySummary.find(s => s.month === selectedMonth) ?? null;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.listContent}>
          {[1, 2, 3, 4].map(k => <SkeletonCard key={k} />)}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Month filter */}
      {months.length > 0 && (
        <MonthPicker months={months} selected={selectedMonth} onSelect={setSelectedMonth} />
      )}

      <FlatList
        data={filteredRecords}
        keyExtractor={item => item._id}
        renderItem={({ item }) => <LogCard item={item} />}
        contentContainerStyle={[styles.listContent, filteredRecords.length === 0 && styles.listEmpty]}
        ListHeaderComponent={activeSummary ? <MonthlySummaryCard summary={activeSummary} /> : null}
        ListEmptyComponent={<EmptyState />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.light.primaryDark },
  listContent: { padding: 16, paddingBottom: 32 },
  listEmpty:   { flex: 1, justifyContent: 'center' },

  // Month picker
  monthPicker: { maxHeight: 48, marginTop: 12 },
  monthChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  monthChipActive: { backgroundColor: Colors.light.accent, borderColor: Colors.light.accent },
  monthChipText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  monthChipTextActive: { color: '#001f3f' },

  // Monthly summary
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 16, marginBottom: 16,
  },
  summaryMonth: { fontSize: 14, fontWeight: '700', color: 'white', marginBottom: 14 },
  summaryGrid:  { flexDirection: 'row', alignItems: 'center' },
  summaryItem:  { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '800', color: 'white' },
  summaryLabel: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  summaryDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.1)' },

  // Log card
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 16, marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dateText:   { fontSize: 14, fontWeight: '700', color: 'white', flex: 1, marginRight: 8 },
  divider:    { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  timesRow:   { flexDirection: 'row', alignItems: 'center' },
  timeItem:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  timeTexts:  { gap: 2 },
  timeLabel:  { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  timeValue:  { fontSize: 13, fontWeight: '700' },
  timesDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 10 },
  badge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  // Pulse dot
  pulseWrapper: { width: 15, height: 15, justifyContent: 'center', alignItems: 'center' },
  pulseDot:     { position: 'absolute', width: 13, height: 13, borderRadius: 7, backgroundColor: Colors.light.accent },
  pulseDotCore: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.light.accent },

  // Skeleton
  skeletonDate:  { height: 13, width: '55%', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 6, marginBottom: 12 },
  skeletonRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skeletonLine:  { height: 11, width: '40%', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6 },
  skeletonBadge: { height: 20, width: 56, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },

  // Empty
  emptyContainer: { alignItems: 'center', paddingHorizontal: 40 },
  emptyIconRing: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 20 },
});
