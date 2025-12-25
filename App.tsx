import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { eventLogger } from './src/services/eventLogger';
import { printerService } from './src/services/printerService';
import { SplashScreen } from './src/screens/SplashScreen';
import { SellScanScreen } from './src/screens/SellScanScreen';
import { PaymentScreen } from './src/screens/PaymentScreen';
import { SuccessPrintScreen } from './src/screens/SuccessPrintScreen';
import { theme } from './src/theme';

const Stack = createStackNavigator();

export default function App() {
  useEffect(() => {
    // Initialize services
    const initializeApp = async () => {
      try {
        await eventLogger.initialize();
        await eventLogger.log('APP_START', {
          timestamp: Date.now(),
        });
        
        await printerService.initialize();
        
        console.log('App initialized successfully');
      } catch (error) {
        console.error('Failed to initialize app:', error);
        await eventLogger.log('ERROR', {
          message: 'App initialization failed',
          error: String(error),
        });
      }
    };

    initializeApp();
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.colors.primary,
            },
            headerTintColor: theme.colors.textInverse,
            headerTitleStyle: {
              ...theme.typography.h3,
              color: theme.colors.textInverse,
            },
          }}
        >
          <Stack.Screen
            name="Splash"
            component={SplashScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SellScan"
            component={SellScanScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Payment"
            component={PaymentScreen}
            options={{ title: 'Select Payment Method' }}
          />
          <Stack.Screen
            name="SuccessPrint"
            component={SuccessPrintScreen}
            options={{ title: 'Success' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
