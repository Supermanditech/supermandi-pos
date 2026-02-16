// T-288: Retailer Bulk Purchase Credit UI (POS)
// Browse available credit offers and apply for bulk purchase financing

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator, Alert as RNAlert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { API_BASE_URL } from '../config/api';
import { getDeviceToken } from '../services/deviceSession';

interface CreditOffer {
  id: string;
  providerName: string;
  productType: string;
  maxAmount: number;
  interestRate: number;
  tenureDays: number;
  status: string;
  appliedAt: string | null;
}

interface Props {
  onBack: () => void;
}

async function creditFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getDeviceToken();
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export default function BulkPurchaseCreditScreen({ onBack }: Props) {
  const [offers, setOffers] = useState<CreditOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOffers = useCallback(async () => {
    setError(null);
    try {
      const res = await creditFetch<{ offers: CreditOffer[] }>('/pos/credit/offers');
      setOffers(res.offers || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);
  const onRefresh = () => { setRefreshing(true); fetchOffers(); };

  const applyForCredit = async (offerId: string) => {
    RNAlert.alert('Apply for Credit', 'Submit application for this credit offer?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Apply',
        onPress: async () => {
          try {
            await creditFetch('/pos/credit/apply', {
              method: 'POST',
              body: JSON.stringify({ offerId }),
            });
            RNAlert.alert('Success', 'Application submitted. You will be notified of the status.');
            fetchOffers();
          } catch {
            RNAlert.alert('Error', 'Failed to submit application.');
          }
        },
      },
    ]);
  };

  const renderOffer = ({ item }: { item: CreditOffer }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.providerBadge}>
          <MaterialCommunityIcons name="bank-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.providerName}>{item.providerName}</Text>
        </View>
        <View style={[styles.statusBadge, {
          backgroundColor: item.status === 'available' ? '#ECFDF5' : item.status === 'applied' ? '#EFF6FF' : '#FEF3C7'
        }]}>
          <Text style={[styles.statusText, {
            color: item.status === 'available' ? '#166534' : item.status === 'applied' ? '#1E40AF' : '#92400E'
          }]}>{item.status}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Max Amount</Text>
          <Text style={styles.infoValue}>{'\u20B9'}{(item.maxAmount / 100).toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Interest Rate</Text>
          <Text style={styles.infoValue}>{item.interestRate}% p.a.</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Tenure</Text>
          <Text style={styles.infoValue}>{item.tenureDays} days</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Type</Text>
          <Text style={styles.infoValue}>{item.productType.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      {item.status === 'available' && (
        <Pressable style={styles.applyBtn} onPress={() => applyForCredit(item.id)}>
          <MaterialCommunityIcons name="file-document-edit-outline" size={16} color="#fff" />
          <Text style={styles.applyBtnText}>Apply Now</Text>
        </Pressable>
      )}

      {item.status === 'applied' && item.appliedAt && (
        <Text style={styles.appliedText}>Applied on {new Date(item.appliedAt).toLocaleDateString('en-IN')}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Bulk Purchase Credit</Text>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <MaterialCommunityIcons name="information-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.infoBannerText}>
          Apply for credit to finance bulk purchases from your suppliers. Get competitive rates from multiple providers.
        </Text>
      </View>

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={item => item.id}
          renderItem={renderOffer}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="bank-off-outline" size={48} color={theme.colors.textTertiary} />
              <Text style={styles.emptyTitle}>No Credit Offers Available</Text>
              <Text style={styles.emptyDesc}>Credit offers will appear here when providers are configured for your store.</Text>
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
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, margin: 12,
    backgroundColor: theme.colors.primaryLight, borderRadius: 8,
  },
  infoBannerText: { flex: 1, fontSize: 12, color: theme.colors.primary, lineHeight: 18 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  providerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  providerName: { fontSize: 15, fontWeight: '600', color: theme.colors.textPrimary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  cardBody: { gap: 6, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontSize: 13, color: theme.colors.textSecondary },
  infoValue: { fontSize: 13, fontWeight: '500', color: theme.colors.textPrimary },
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.primary, borderRadius: 8, paddingVertical: 10,
  },
  applyBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  appliedText: { fontSize: 12, color: theme.colors.textTertiary, textAlign: 'center', fontStyle: 'italic' },
  errorBar: { backgroundColor: '#FEE2E2', padding: 10, marginHorizontal: 12 },
  errorText: { color: '#991B1B', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary, marginTop: 12 },
  emptyDesc: { fontSize: 13, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 4 },
});
