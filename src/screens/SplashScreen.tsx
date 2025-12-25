import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { theme } from '../theme';
import { eventLogger } from '../services/eventLogger';

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
};

type SplashScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Splash'>;

export const SplashScreen = () => {
  const navigation = useNavigation<SplashScreenNavigationProp>();

  useEffect(() => {
    // Emit APP_LAUNCHED event
    eventLogger.log('APP_START', {
      screen: 'Splash',
      timestamp: Date.now(),
    });

    // Navigate to SellScan after exactly 5 seconds
    const timer = setTimeout(() => {
      navigation.replace('SellScan');
    }, 5000);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo Icon */}
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <View style={styles.logoShop}>
              <View style={styles.logoAwning} />
              <View style={styles.logoBase} />
            </View>
          </View>
        </View>
        
        <Text style={styles.title}>SuperMandi POS</Text>
        
        {/* Loading Spinner */}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.subtext}>Preparing POS...</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    marginBottom: 18,
  },
  logo: {
    width: 132,
    height: 132,
    backgroundColor: theme.colors.background,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  logoShop: {
    width: 72,
    height: 72,
    position: 'relative',
  },
  logoAwning: {
    width: 72,
    height: 18,
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    position: 'absolute',
    top: 0,
  },
  logoBase: {
    width: 72,
    height: 54,
    backgroundColor: theme.colors.primary,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    position: 'absolute',
    bottom: 0,
  },
  title: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 92,
    alignItems: 'center',
  },
  subtext: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 14,
  },
});
