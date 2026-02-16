// T-307/T-308/T-311/T-313/T-314: AI Insights Screen for POS
// Shows alerts, forecasts, slow movers, expiring products, price comparisons

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import * as aiApi from '../services/api/aiApi';

type Tab = 'alerts' | 'forecasts' | 'slow' | 'expiry' | 'prices';

interface Props {
  onBack: () => void;
}

export default function AIInsightsScreen({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('alerts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<aiApi.Alert[]>([]);
  const [forecasts, setForecasts] = useState<aiApi.Forecast[]>([]);
  const [slowMovers, setSlowMovers] = useState<aiApi.SlowMover[]>([]);
  const [expiryItems, setExpiryItems] = useState<aiApi.ExpiryItem[]>([]);
  const [priceComparisons, setPriceComparisons] = useState<aiApi.PriceComparison[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      switch (tab) {
        case 'alerts': {
          const res = await aiApi.getAlerts({ limit: 50 });
          setAlerts(res.alerts);
          break;
        }
        case 'forecasts': {
          const res = await aiApi.getForecasts({ days: 7 });
          setForecasts(res.forecasts);
          break;
        }
        case 'slow': {
          const res = await aiApi.getSlowMovers();
          setSlowMovers(res.slowMovers);
          break;
        }
        case 'expiry': {
          const res = await aiApi.getExpiringProducts({ daysAhead: 30 });
          setExpiryItems(res.items);
          break;
        }
        case 'prices': {
          const res = await aiApi.getPriceComparisons({ onlyWithSavings: true, limit: 30 });
          setPriceComparisons(res.comparisons);
          break;
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const tabs: Array<{ key: Tab; label: string; icon: string }> = [
    { key: 'alerts', label: 'Alerts', icon: 'bell-alert-outline' },
    { key: 'forecasts', label: 'Forecast', icon: 'chart-timeline-variant' },
    { key: 'slow', label: 'Slow', icon: 'turtle' },
    { key: 'expiry', label: 'Expiry', icon: 'clock-alert-outline' },
    { key: 'prices', label: 'Prices', icon: 'tag-multiple-outline' },
  ];

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return '#DC2626';
      case 'warning': return '#F59E0B';
      default: return '#0EA5E9';
    }
  };

  const renderAlert = ({ item }: { item: aiApi.Alert }) => (
    <Pressable
      style={[styles.card, !item.isRead && styles.unreadCard]}
      onPress={() => aiApi.markAlertRead(item.id).then(fetchData)}
    >
      <View style={[styles.severityDot, { backgroundColor: severityColor(item.severity) }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardDesc}>{item.message}</Text>
        <Text style={styles.cardMeta}>{new Date(item.createdAt).toLocaleDateString('en-IN')}</Text>
      </View>
    </Pressable>
  );

  const renderForecast = ({ item }: { item: aiApi.Forecast }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.productName}</Text>
        <Text style={styles.cardDesc}>
          Predicted: {item.predictedQty}/day | Stock: {item.currentStock}
          {item.daysUntilStockout != null ? ` | Stockout in ${item.daysUntilStockout}d` : ''}
        </Text>
        <View style={styles.confidenceBar}>
          <View style={[styles.confidenceFill, { width: `${item.confidence * 100}%` }]} />
        </View>
      </View>
    </View>
  );

  const renderSlowMover = ({ item }: { item: aiApi.SlowMover }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.cardTitle}>{item.productName}</Text>
          <View style={[styles.badge, { backgroundColor: item.trend === 'dead_stock' ? '#FEE2E2' : '#FEF3C7' }]}>
            <Text style={{ fontSize: 10, color: item.trend === 'dead_stock' ? '#991B1B' : '#92400E' }}>
              {item.trend.replace('_', ' ')}
            </Text>
          </View>
        </View>
        <Text style={styles.cardDesc}>Stock: {item.currentStock} | Sold (30d): {item.salesLast30Days}</Text>
        <Text style={[styles.cardMeta, { fontStyle: 'italic' }]}>{item.recommendation}</Text>
      </View>
    </View>
  );

  const renderExpiry = ({ item }: { item: aiApi.ExpiryItem }) => (
    <View style={styles.card}>
      <View style={[styles.severityDot, {
        backgroundColor: item.urgency === 'expired' ? '#DC2626' : item.urgency === 'critical' ? '#F59E0B' : '#0EA5E9'
      }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.productName}</Text>
        <Text style={styles.cardDesc}>
          {item.daysUntilExpiry < 0 ? 'EXPIRED' : `${item.daysUntilExpiry} days left`} | Expires: {item.expiryDate} | Stock: {item.currentStock}
        </Text>
        <Text style={[styles.cardMeta, { fontStyle: 'italic' }]}>{item.suggestedAction}</Text>
      </View>
    </View>
  );

  const renderPrice = ({ item }: { item: aiApi.PriceComparison }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.productName}</Text>
        <Text style={styles.cardDesc}>
          Current: {'\u20B9'}{(item.currentPrice / 100).toFixed(2)} | Best: {'\u20B9'}{(item.bestPrice / 100).toFixed(2)}
        </Text>
        {item.maxSavings > 0 && (
          <Text style={[styles.cardMeta, { color: '#16A34A' }]}>
            Save {'\u20B9'}{(item.maxSavings / 100).toFixed(2)} ({item.maxSavingsPercent.toFixed(1)}%)
          </Text>
        )}
      </View>
    </View>
  );

  const renderItem = tab === 'alerts' ? renderAlert
    : tab === 'forecasts' ? renderForecast
    : tab === 'slow' ? renderSlowMover
    : tab === 'expiry' ? renderExpiry
    : renderPrice;

  const data = tab === 'alerts' ? alerts
    : tab === 'forecasts' ? forecasts
    : tab === 'slow' ? slowMovers
    : tab === 'expiry' ? expiryItems
    : priceComparisons;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>AI Insights</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {tabs.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.activeTab]}>
            <MaterialCommunityIcons
              name={t.icon as any}
              size={18}
              color={tab === t.key ? theme.colors.primary : theme.colors.textTertiary}
            />
            <Text style={[styles.tabLabel, tab === t.key && styles.activeTabLabel]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={data as any[]}
          keyExtractor={(item: any, index: number) => item.id || item.productId || `ai-item-${index}`}
          renderItem={renderItem as any}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="robot-happy-outline" size={48} color={theme.colors.textTertiary} />
              <Text style={styles.emptyText}>No {tab} data yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff',
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: theme.colors.textPrimary },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0', paddingHorizontal: 4,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2,
  },
  activeTab: { borderBottomWidth: 2, borderBottomColor: theme.colors.primary },
  tabLabel: { fontSize: 11, color: theme.colors.textTertiary },
  activeTabLabel: { color: theme.colors.primary, fontWeight: '600' },
  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 8, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0', gap: 10,
  },
  unreadCard: { borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  severityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  cardTitle: { fontSize: 14, fontWeight: '500', color: theme.colors.textPrimary, marginBottom: 2 },
  cardDesc: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  cardMeta: { fontSize: 11, color: theme.colors.textTertiary },
  confidenceBar: { height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, marginTop: 4 },
  confidenceFill: { height: 4, backgroundColor: theme.colors.primary, borderRadius: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  errorBar: { backgroundColor: '#FEE2E2', padding: 10 },
  errorText: { color: '#991B1B', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 14, color: theme.colors.textTertiary, marginTop: 8 },
});
