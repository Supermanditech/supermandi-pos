// T-288: Retailer Bulk Purchase Credit UI (POS)
// Browse available credit offers and apply for bulk purchase financing

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator, Alert as RNAlert, BackHandler, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { theme, useThemeColors } from '../theme';
// UIUX-POS-009: Use apiClient instead of raw fetch (handles auth refresh, rate limiting, error handling)
import { apiClient } from '../services/api/apiClient';

// STG-448: Aligned with backend GET /api/v1/pos/credit/offers response shape
interface CreditOffer {
  id: string;
  source: string;
  amountMinor: number;
  tenureMonths: number;
  interestRateAnnual: number;
  emiMinor: number;
  validUntil: string | null;
  status: string;
}

interface Props {
  onBack: () => void;
}

// UIUX-POS-009: Replaced raw fetch with apiClient (auth refresh, rate limiting, error handling)

export default function BulkPurchaseCreditScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
    },
    backBtn: { padding: 4, marginRight: 8 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: colors.textPrimary },
    infoBanner: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, margin: 12,
      backgroundColor: colors.primaryLight, borderRadius: 8,
    },
    infoBannerText: { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 18 },
    card: { backgroundColor: colors.surface, borderRadius: 10, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    providerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    providerName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
    statusText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
    cardBody: { gap: 6, marginBottom: 12 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
    infoLabel: { fontSize: 13, color: colors.textSecondary },
    infoValue: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
    applyBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10,
    },
    applyBtnText: { fontSize: 14, fontWeight: '600', color: colors.textInverse },
    appliedText: { fontSize: 12, color: colors.textTertiary, textAlign: 'center', fontStyle: 'italic' },
    errorBar: { backgroundColor: colors.errorSoft, padding: 10, marginHorizontal: 12 },
    errorText: { color: colors.errorDark, fontSize: 13 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginTop: 12 },
    emptyDesc: { fontSize: 13, color: colors.textTertiary, textAlign: 'center', marginTop: 4 },
  }), [colors]);

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

  const [offers, setOffers] = useState<CreditOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOffers = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.get<{ offers: CreditOffer[] }>('/api/v1/pos/credit/offers');
      setOffers(res.offers || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("bulkCredit.failedToLoad"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);
  const onRefresh = () => { setRefreshing(true); fetchOffers(); };

  // ISSUE-151: Ref-based guard to prevent duplicate credit applications
  const applyingRef = useRef(false);
  const applyForCredit = async (offerId: string) => {
    if (applyingRef.current) return;
    RNAlert.alert(t("bulkCredit.applyForCredit"), t("bulkCredit.submitApplicationConfirm"), [
      { text: t("common.cancel"), style: 'cancel' },
      {
        text: t("bulkCredit.apply"),
        onPress: async () => {
          if (applyingRef.current) return;
          applyingRef.current = true;
          try {
            await apiClient.post('/api/v1/pos/credit/apply', { offerId });
            RNAlert.alert(t("common.success"), t("bulkCredit.applicationSubmitted"));
            void fetchOffers();
          } catch (err) {
            RNAlert.alert(t("common.error"), err instanceof Error ? err.message : t("bulkCredit.failedToSubmit"));
          } finally {
            applyingRef.current = false;
          }
        },
      },
    ]);
  };

  const statusBg = (status: string) =>
    status === 'available' ? colors.successSoft
    : status === 'applied' ? colors.primaryLight
    : colors.warningSoft;

  const statusFg = (status: string) =>
    status === 'available' ? colors.successDark
    : status === 'applied' ? colors.primaryDark
    : colors.warningDark;

  const renderOffer = ({ item }: { item: CreditOffer }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.providerBadge}>
          <MaterialCommunityIcons name="bank-outline" size={16} color={colors.primary} />
          <Text style={styles.providerName}>{item.source.replace(/_/g, ' ')}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusBg(item.status) }]}>
          <Text style={[styles.statusText, { color: statusFg(item.status) }]}>{item.status}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("bulkCredit.maxAmount")}</Text>
          <Text style={styles.infoValue}>{'\u20B9'}{(item.amountMinor / 100).toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("bulkCredit.interestRate")}</Text>
          <Text style={styles.infoValue}>{item.interestRateAnnual}% p.a.</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("bulkCredit.tenure")}</Text>
          <Text style={styles.infoValue}>{item.tenureMonths} months</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("bulkCredit.emi")}</Text>
          <Text style={styles.infoValue}>{'\u20B9'}{(item.emiMinor / 100).toLocaleString('en-IN')}/mo</Text>
        </View>
      </View>

      {item.status === 'available' && (
        <Pressable
          style={styles.applyBtn}
          onPress={() => applyForCredit(item.id)}
          accessibilityLabel={t("bulkCredit.applyNow")}
          accessibilityRole="button"
          testID="credit-apply-btn"
        >
          <MaterialCommunityIcons name="file-document-edit-outline" size={16} color={colors.textInverse} />
          <Text style={styles.applyBtnText}>{t("bulkCredit.applyNow")}</Text>
        </Pressable>
      )}

      {item.status === 'applied' && (
        <Text style={styles.appliedText}>{t("bulkCredit.applicationSubmittedStatus")}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityLabel={t("common.back")} accessibilityRole="button">
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("bulkCredit.title")}</Text>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <MaterialCommunityIcons name="information-outline" size={18} color={colors.primary} />
        <Text style={styles.infoBannerText}>
          {t("bulkCredit.infoBanner")}
        </Text>
      </View>

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={item => item.id}
          renderItem={renderOffer}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="bank-off-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>{t("bulkCredit.noOffersTitle")}</Text>
              <Text style={styles.emptyDesc}>{t("bulkCredit.noOffersDescription")}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
