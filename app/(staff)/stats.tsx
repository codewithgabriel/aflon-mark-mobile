import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { fetchAPI } from '../../utils/api';

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
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const statusStyle = (s: string) => {
  switch (s) {
    case 'Early':   return { bg: 'rgba(56,161,105,0.18)',  text: '#48bb78', label: 'Early'   };
    case 'OnTime':
    case 'Present': return { bg: 'rgba(59,130,246,0.18)',  text: '#60a5fa', label: 'On Time' };
    case 'Late':    return { bg: 'rgba(214,158,46,0.18)',  text: '#ecc94b', label: 'Late'    };
    default:        return { bg: 'rgba(229,62,62,0.18)',   text: '#fc8181', label: s         };
  }
};

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

// ── Record row ────────────────────────────────────────────────────────────────
function RecordRow({ item }: { item: Record }) {
  const dur = calcDuration(item.checkInTime, item.checkOutTime);
  const st  = statusStyle(item.status);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowDate}>{fmtDate(item.date)}</Text>
        <Text style={styles.rowTime}>
          In: {fmtTime(item.checkInTime)}
          {item.checkOutTime ? `  ·  Out: ${fmtTime(item.checkOutTime)}` : '  ·  Active'}
          {dur ? `  ·  ${dur}` : ''}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: st.bg }]}>
        <Text style={[styles.badgeText, { color: st.text }]}>{st.label}</Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StatsScreen() {
  const { user } = useAuth();

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [mode, setMode]       = useState<'month' | 'range'>('month');
  const [month, setMonth]     = useState(defaultMonth);
  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (mode === 'month' && month) params.set('month', month);
      if (mode === 'range' && from)  params.set('from', from);
      if (mode === 'range' && to)    params.set('to', to);
      const data = await fetchAPI(`/admin/staff/${user?._id}/stats?${params}`);
      setSummary(data.summary);
      setRecords(data.records ?? []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [mode, month, from, to]);

  return (
    <View style={styles.container}>
      {/* Filter bar */}
      <View style={styles.filterBar}>
        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'month' && styles.modeBtnActive]}
            onPress={() => setMode('month')}
          >
            <Text style={[styles.modeBtnText, mode === 'month' && styles.modeBtnTextActive]}>Month</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'range' && styles.modeBtnActive]}
            onPress={() => setMode('range')}
          >
            <Text style={[styles.modeBtnText, mode === 'range' && styles.modeBtnTextActive]}>Date Range</Text>
          </TouchableOpacity>
        </View>

        {mode === 'month' ? (
          <TextInput
            style={styles.input}
            value={month}
            onChangeText={setMonth}
            placeholder="YYYY-MM"
            placeholderTextColor="rgba(255,255,255,0.3)"
            keyboardType="numbers-and-punctuation"
          />
        ) : (
          <View style={styles.rangeRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={from}
              onChangeText={setFrom}
              placeholder="From YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.rangeSep}>→</Text>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={to}
              onChangeText={setTo}
              placeholder="To YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.light.accent} />
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={r => r._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListHeaderComponent={
            summary ? (
              <View>
                {/* Summary tiles */}
                <View style={styles.tilesRow}>
                  <StatTile label="Days"     value={summary.totalDays}  color="white" />
                  <StatTile label="Early"    value={summary.earlyDays}  color="#48bb78" />
                  <StatTile label="On Time"  value={summary.onTimeDays} color="#60a5fa" />
                  <StatTile label="Late"     value={summary.lateDays}   color="#ecc94b" />
                  <StatTile
                    label="Hours"
                    value={`${summary.totalHours}h${summary.totalMins > 0 ? ` ${summary.totalMins}m` : ''}`}
                    color="rgba(255,255,255,0.8)"
                  />
                </View>
                <Text style={styles.sectionTitle}>Attendance Log</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={44} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>No records for this period</Text>
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
  container: { flex: 1, backgroundColor: Colors.light.primaryDark },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Filter
  filterBar: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  modeBtnActive:     { backgroundColor: Colors.light.accent, borderColor: Colors.light.accent },
  modeBtnText:       { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  modeBtnTextActive: { color: '#001f3f' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: 'white', fontSize: 13, fontWeight: '600',
  },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeSep: { color: 'rgba(255,255,255,0.4)', fontSize: 16, fontWeight: '700' },

  // Summary tiles
  tilesRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20, overflow: 'hidden',
  },
  tile: { flex: 1, alignItems: 'center', paddingVertical: 16, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)' },
  tileValue: { fontSize: 18, fontWeight: '800', color: 'white' },
  tileLabel: { fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: '700', textTransform: 'uppercase', marginTop: 3 },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },

  // Record row
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: 14, marginBottom: 10,
  },
  rowDate: { fontSize: 13, fontWeight: '700', color: 'white', marginBottom: 3 },
  rowTime: { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  badge:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginLeft: 8 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: 'rgba(255,255,255,0.35)', fontWeight: '500' },
});
