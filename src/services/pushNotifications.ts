/**
 * Phase 8: POS Push Notification Service
 *
 * Handles:
 * - Permission requests
 * - Expo push token retrieval
 * - Token registration with backend
 * - Notification listeners (foreground + background)
 * - Deep linking from notification taps
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from './api/apiClient';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Configure notification behavior for foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

/**
 * Request notification permissions and get the push token.
 * Returns the Expo push token string, or null if denied.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[PushNotifications] Permission not granted');
      return null;
    }

    // Get the device push token (FCM token on Android, APNs on iOS)
    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    const token = tokenResponse.data;

    console.log('[PushNotifications] Got device push token:', token.substring(0, 20) + '...');

    // Set up Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10b981',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Order Updates',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('alerts', {
        name: 'Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        sound: 'default',
      });
    }

    return token;
  } catch (error) {
    console.error('[PushNotifications] Registration error:', error);
    return null;
  }
}

/**
 * Register the push token with the backend.
 */
export async function registerTokenWithBackend(token: string): Promise<boolean> {
  try {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const response = await apiClient.post<{ success?: boolean }>('/api/v1/pos/notifications/device-token', {
      token,
      platform,
    });

    if (response?.success) {
      console.log('[PushNotifications] Token registered with backend');
      return true;
    }
    return false;
  } catch (error) {
    console.warn('[PushNotifications] Backend registration failed:', error);
    return false;
  }
}

/**
 * Remove the push token from backend (on logout).
 */
export async function unregisterTokenFromBackend(token: string): Promise<void> {
  try {
    await apiClient.post('/api/v1/pos/notifications/device-token/unregister', { token });
  } catch {
    // Non-blocking
  }
}

// =============================================================================
// NOTIFICATION LISTENERS
// =============================================================================

type NotificationHandler = (notification: Notifications.Notification) => void;
type NotificationResponseHandler = (response: Notifications.NotificationResponse) => void;

let foregroundListener: Notifications.EventSubscription | null = null;
let responseListener: Notifications.EventSubscription | null = null;

/**
 * Set up notification listeners.
 * Call this once during app initialization.
 */
export function setupNotificationListeners(
  onNotificationReceived?: NotificationHandler,
  onNotificationResponse?: NotificationResponseHandler
): () => void {
  // Foreground notification handler
  foregroundListener = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[PushNotifications] Foreground notification:', notification.request.content.title);
    onNotificationReceived?.(notification);
  });

  // Notification tap handler (user taps on notification)
  responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    console.log('[PushNotifications] Notification tapped, data:', data);
    onNotificationResponse?.(response);
  });

  // Return cleanup function
  return () => {
    foregroundListener?.remove();
    responseListener?.remove();
    foregroundListener = null;
    responseListener = null;
  };
}

/**
 * Get the last notification response (if app was opened from notification).
 */
export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  return Notifications.getLastNotificationResponseAsync();
}

// =============================================================================
// NOTIFICATION API
// =============================================================================

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  type: string;
  isRead: boolean;
  createdAt: string;
}

/**
 * Fetch notifications from backend.
 */
export async function fetchNotifications(
  limit = 20,
  offset = 0
): Promise<{ data: NotificationItem[]; total: number }> {
  try {
    const response = await apiClient.get<{ data?: NotificationItem[]; pagination?: { total: number } }>(
      `/api/v1/pos/notifications?limit=${limit}&offset=${offset}`
    );
    return {
      data: response?.data || [],
      total: response?.pagination?.total || 0,
    };
  } catch {
    return { data: [], total: 0 };
  }
}

/**
 * Get unread notification count.
 */
export async function getUnreadCount(): Promise<number> {
  try {
    const response = await apiClient.get<{ count?: number }>('/api/v1/pos/notifications/unread-count');
    return response?.count || 0;
  } catch {
    return 0;
  }
}

/**
 * Mark a notification as read.
 */
export async function markAsRead(notificationId: string): Promise<void> {
  try {
    await apiClient.patch(`/api/v1/pos/notifications/${notificationId}/read`);
  } catch {
    // Non-blocking
  }
}

/**
 * Mark all notifications as read.
 */
export async function markAllAsRead(): Promise<void> {
  try {
    await apiClient.patch('/api/v1/pos/notifications/read-all');
  } catch {
    // Non-blocking
  }
}
