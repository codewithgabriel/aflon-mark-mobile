import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    FlatList,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { fetchAPI } from '../../utils/api';

type AttendanceRecord = {
  _id: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: 'Present' | 'Late' | 'Absent';
};

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.skeletonDate} />
      <View style={styles.skeletonRow}>
        <View style={styles.skeletonLine} />
        <View style={styles.skeletonBadge} />
      </View>
      <View style={[styles.skeletonLine, { width: '45%', marginTop: 8 }]} />
    </Animated.View>
  );
}

// ── Active pulse dot ──────────────────────────────────────────────────────────
function PulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

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
  }, []);

  return (
    <View style={styles.pulseWrapper}>
      <Animated.View style={[styles.pulseDot, { transform: [{ scale }], opacity }]} />
      <View style={styles.pulseDotCore} />
    </View>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AttendanceRecord['status'] }) {
  const config = {
    Present: { bg: 'rgba(56,161,105,0.18)', text: '#48bb78', label: 'Present' },
    Late:    { bg: 'rgba(214,158,46,0.18)',  text: '#ecc94b', label: 'Late'    },
    Absent:  { bg: 'rgba(229,62,62,0.18)',   text: '#fc8181', label: 'Absent'  },
  }[status] ?? { bg: 'rgba(255,255,255,0.1)', text: 'white', label: status };

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.badgeText, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

// ── History item card ─────────────────────────────────────────────────────────
function HistoryCard({ item }: { item: AttendanceRecord }) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const displayDate = (() => {
    const d = new Date(item.date + 'T00:00:00');
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  })();

  return (
    <View style={styles.card}>
      {/* Date row */}
      <View style={styles.cardHeader}>
        <Text style={styles.dateText}>{displayDate}</Text>
        <StatusBadge status={item.status} />
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Times row */}
      <View style={styles.timesRow}>
        {/* Check-in */}
        <View style={styles.timeItem}>
          <MaterialCommunityIcons name="clock-check-outline" size={16} color="#48bb78" />
          <View style={styles.timeTexts}>
            <Text style={styles.timeLabel}>Check-in</Text>
            <Text style={[styles.timeValue, { color: '#48bb78' }]}>{fmt(item.checkInTime)}</Text>
          </View>
        </View>

        <View style={styles.timesDivider} />

        {/* Check-out */}
        <View style={styles.timeItem}>
          {item.checkOutTime ? (
            <>
              <MaterialCommunityIcons name="clock-out" size={16} color="#60a5fa" />
              <View style={styles.timeTexts}>
                <Text style={styles.timeLabel}>Check-out</Text>
                <Text style={[styles.timeValue, { color: '#60a5fa' }]}>{fmt(item.checkOutTime)}</Text>
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
      </View>
    </View>
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
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const data = await fetchAPI(`/attendance/history?userId=${user?._id}`);
      setHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.listContent}>
          {[1, 2, 3, 4].map((k) => <SkeletonCard key={k} />)}
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => <HistoryCard item={item} />}
          contentContainerStyle={[styles.listContent, history.length === 0 && styles.listEmpty]}
          ListEmptyComponent={<EmptyState />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.primaryDark,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  listEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  // Card
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'white',
    flex: 1,
    marginRight: 8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },

  // Times
  timesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeTexts: {
    gap: 2,
  },
  timeLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  timesDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 12,
  },

  // Badge
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Pulse dot
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
    backgroundColor: Colors.light.accent,
  },
  pulseDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.accent,
  },

  // Skeleton
  skeletonDate: {
    height: 14,
    width: '55%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 6,
    marginBottom: 12,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonLine: {
    height: 12,
    width: '40%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
  },
  skeletonBadge: {
    height: 22,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
