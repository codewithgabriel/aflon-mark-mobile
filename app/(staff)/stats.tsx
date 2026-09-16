import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { fetchAPI } from '../../utils/api';
import { getCachedStats, setCachedStats } from '../../utils/offlineSync';

// ── Types ─────────────────────────────────────────────────────────────────────
type Summary = {
  totalDays: number;
  earlyDays: number;
  onTimeDays: number;
  lateDays: number;
  totalHours: number;
  totalMins: number;
};

type Record = {
  _id: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const calcDuration = (inT: string, outT: string | null) => {
  if (!outT) return null;
  const m = Math.round((new Date(outT).getTime() - new Date(inT).getTime()) / 60000);
  if (m < 0) return null;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const statusStyle = (s: string) => {
  switch (s) {
    case 'Early':
      return { bg: 'rgba(16, 185, 129, 0.18)', text: '#34d399', label: 'Early' };
    case 'OnTime':
    case 'Present':
      return { bg: 'rgba(59, 130, 246, 0.18)', text: '#60a5fa', label: 'On Time' };
    case 'Late':
      return { bg: 'rgba(245, 158, 11, 0.18)', text: '#fbbf24', label: 'Late' };
    default:
      return { bg: 'rgba(239, 68, 68, 0.18)', text: '#f87171', label: s };
  }
};

// ── Stat Tile ─────────────────────────────────────────────────────────────────
function StatTile({
  label,
  value,
  color,
  subLabel,
}: {
  label: string;
  value: string | number;
  color: string;
  subLabel?: string;
}) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {subLabel && <Text style={styles.tileSub}>{subLabel}</Text>}
    </View>
  );
}

// ── Record Row ────────────────────────────────────────────────────────────────
function RecordRow({ item }: { item: Record }) {
  const dur = calcDuration(item.checkInTime, item.checkOutTime);
  const st = statusStyle(item.status);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowDate}>{fmtDate(item.date)}</Text>
        <Text style={styles.rowTime}>
          In: <Text style={{ color: '#34d399', fontWeight: '700' }}>{fmtTime(item.checkInTime)}</Text>
          {item.checkOutTime ? (
            <>
              {'  ·  '}Out: <Text style={{ color: '#60a5fa', fontWeight: '700' }}>{fmtTime(item.checkOutTime)}</Text>
            </>
          ) : (
            <>
              {'  ·  '}<Text style={{ color: '#00e5ff', fontWeight: '700' }}>Active</Text>
            </>
          )}
          {dur ? `  ·  ${dur}` : ''}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: st.bg }]}>
        <Text style={[styles.badgeText, { color: st.text }]}>{st.label}</Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function StatsScreen() {
  const { user } = useAuth();

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(defaultMonth);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const getCacheKey = () => {
    return `${user?._id}_${mode}_${mode === 'month' ? month : `${from}_${to}`}`;
  };

  const load = async () => {
    const cacheKey = getCacheKey();
    // 1. Try reading from cache first for instant display
    const cached = await getCachedStats(cacheKey);
    if (cached) {
      setSummary(cached.summary || null);
      setRecords(cached.records || []);
      setLoading(false);
    }

    try {
      const params = new URLSearchParams();
      if (mode === 'month' && month) params.set('month', month);
      if (mode === 'range' && from) params.set('from', from);
      if (mode === 'range' && to) params.set('to', to);

      const data = await fetchAPI(`/admin/staff/${user?._id}/stats?${params}`);
      setSummary(data.summary || null);
      setRecords(data.records ?? []);
      await setCachedStats(cacheKey, data);
    } catch {
      // offline fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [mode, month, from, to]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <View style={styles.container}>
      {/* Filter Bar */}
      <View style={styles.filterBar}>
        {/* Mode Toggle */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'month' && styles.modeBtnActive]}
            onPress={() => setMode('month')}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeBtnText, mode === 'month' && styles.modeBtnTextActive]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'range' && styles.modeBtnActive]}
            onPress={() => setMode('range')}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeBtnText, mode === 'range' && styles.modeBtnTextActive]}>
              Custom Range
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'month' ? (
          <TextInput
            style={styles.input}
            value={month}
            onChangeText={setMonth}
            placeholder="YYYY-MM (e.g. 2026-09)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            keyboardType="numbers-and-punctuation"
          />
        ) : (
          <View style={styles.rangeRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={from}
              onChangeText={setFrom}
              placeholder="From: YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.rangeSep}>→</Text>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={to}
              onChangeText={setTo}
              placeholder="To: YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#00e5ff" />
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(r) => r._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#00e5ff"
              colors={['#00e5ff']}
            />
          }
          ListHeaderComponent={
            summary ? (
              <View style={{ marginBottom: 16 }}>
                {/* Metric Summary Grid */}
                <View style={styles.tilesRow}>
                  <StatTile label="Total Days" value={summary.totalDays} color="#ffffff" />
                  <StatTile label="Early" value={summary.earlyDays} color="#34d399" />
                  <StatTile label="On Time" value={summary.onTimeDays} color="#60a5fa" />
                  <StatTile label="Late" value={summary.lateDays} color="#fbbf24" />
                  <StatTile
                    label="Hours"
                    value={`${summary.totalHours}h${summary.totalMins > 0 ? ` ${summary.totalMins}m` : ''}`}
                    color="#00e5ff"
                  />
                </View>
                <Text style={styles.sectionTitle}>Activity Breakdown</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="chart-box-outline" size={48} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>No statistics available for this period</Text>
            </View>
          }
          renderItem={({ item }) => <RecordRow item={item} />}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001f3f' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Filter
  filterBar: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    gap: 12,
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modeBtnActive: { backgroundColor: '#00e5ff', borderColor: '#00e5ff' },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  modeBtnTextActive: { color: '#001f3f', fontWeight: '900' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeSep: { color: 'rgba(255,255,255,0.4)', fontSize: 16, fontWeight: '700' },

  // Summary Tiles
  tilesRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  tileValue: { fontSize: 18, fontWeight: '900', color: 'white' },
  tileLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  tileSub: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 12,
  },

  // Record Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: 14,
    marginBottom: 10,
  },
  rowDate: { fontSize: 13, fontWeight: '800', color: '#ffffff', marginBottom: 3 },
  rowTime: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, marginLeft: 8 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
});
