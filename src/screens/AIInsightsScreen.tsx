// T-307/T-308/T-311/T-313/T-314: AI Insights Screen for POS
// Shows alerts, forecasts, slow movers, expiring products, price comparisons

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator, BackHandler, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import * as aiApi from '../services/api/aiApi';

type Tab = 'alerts' | 'forecasts' | 'slow' | 'expiry' | 'prices';

interface Props {
  onBack: () => void;
}

export default function AIInsightsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();

  // UIUX-POS-004: Android hardware back button support
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

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

  // POS-041: Only show spinner if tab has no cached data
  useEffect(() => {
    const hasCache =
      (tab === 'alerts' && alerts.length > 0) ||
      (tab === 'forecasts' && forecasts.length > 0) ||
      (tab === 'slow' && slowMovers.length > 0) ||
      (tab === 'expiry' && expiryItems.length > 0) ||
      (tab === 'prices' && priceComparisons.length > 0);
    if (!hasCache) setLoading(true);
    fetchData();
  }, [fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

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
      case 'critical': return theme.colors.error;
      case 'warning': return theme.colors.warning;
      default: return theme.colors.info;
    }
  };

  const renderAlert = ({ item }: { item: aiApi.Alert }) => (
    <Pressable
      style={[styles.card, !item.isRead && styles.unreadCard]}
      onPress={() => {
        // POS-040: Optimistic update + error handling
        setAlerts(prev => prev.map(a => a.id === item.id ? { ...a, isRead: true } : a));
        aiApi.markAlertRead(item.id).catch(() => {
          setAlerts(prev => prev.map(a => a.id === item.id ? { ...a, isRead: false } : a));
        });
      }}
      accessibilityLabel={`${item.severity} alert: ${item.title}`}
      accessibilityRole="button"
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

  const trendBg = (trend: string) => trend === 'dead_stock' ? theme.colors.errorSoft : theme.colors.warningSoft;
  const trendFg = (trend: string) => trend === 'dead_stock' ? theme.colors.errorDark : theme.colors.warningDark;

  const renderSlowMover = ({ item }: { item: aiApi.SlowMover }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.cardTitle}>{item.productName}</Text>
          <View style={[styles.badge, { backgroundColor: trendBg(item.trend) }]}>
            <Text style={[styles.badgeText, { color: trendFg(item.trend) }]}>
              {item.trend.replace('_', ' ')}
            </Text>
          </View>
        </View>
        <Text style={styles.cardDesc}>Stock: {item.currentStock} | Sold (30d): {item.salesLast30Days}</Text>
        <Text style={[styles.cardMeta, { fontStyle: 'italic' }]}>{item.recommendation}</Text>
      </View>
    </View>
  );

  const urgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'expired': return theme.colors.error;
      case 'critical': return theme.colors.warning;
      default: return theme.colors.info;
    }
  };

  const renderExpiry = ({ item }: { item: aiApi.ExpiryItem }) => (
    <View style={styles.card}>
      <View style={[styles.severityDot, { backgroundColor: urgencyColor(item.urgency) }]} />
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
          <Text style={[styles.cardMeta, { color: theme.colors.success }]}>
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
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>AI Insights</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {tabs.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.activeTab]}
            accessibilityLabel={t.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
          >
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
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: theme.colors.textPrimary },
  tabBar: {
    flexDirection: 'row', backgroundColor: theme.colors.surface, borderBottomWidth: 1,
    borderBottomColor: theme.colors.border, paddingHorizontal: 4,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2,
  },
  activeTab: { borderBottomWidth: 2, borderBottomColor: theme.colors.primary },
  tabLabel: { fontSize: 11, color: theme.colors.textTertiary },
  activeTabLabel: { color: theme.colors.primary, fontWeight: '600' },
  card: {
    flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border, gap: 10,
  },
  unreadCard: { borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  severityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  cardTitle: { fontSize: 14, fontWeight: '500', color: theme.colors.textPrimary, marginBottom: 2 },
  cardDesc: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  cardMeta: { fontSize: 11, color: theme.colors.textTertiary },
  confidenceBar: { height: 4, backgroundColor: theme.colors.backgroundTertiary, borderRadius: 2, marginTop: 4 },
  confidenceFill: { height: 4, backgroundColor: theme.colors.primary, borderRadius: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10 },
  errorBar: { backgroundColor: theme.colors.errorSoft, padding: 10 },
  errorText: { color: theme.colors.errorDark, fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 14, color: theme.colors.textTertiary, marginTop: 8 },
});
