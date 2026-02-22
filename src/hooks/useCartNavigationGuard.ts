// LIVE.NAV.RESILIENCE.BACK_FORWARD_DRAFT_RECOVERY.001
// Navigation guard for POS cart — prevents accidental back/swipe when cart has items

import { useEffect } from 'react';
import { Alert } from 'react-native';
import type { EventArg } from '@react-navigation/native';

type BeforeRemoveEvent = EventArg<'beforeRemove', true, { action: { type: string } }>;

/**
 * Prevents accidental navigation away from a screen when the cart has items.
 * Uses React Navigation's beforeRemove event to show a confirmation dialog.
 *
 * @param navigation - React Navigation object (must support addListener)
 * @param hasItems - Whether the cart currently has items
 * @param onDiscard - Optional callback when user confirms discard
 */
export function useCartNavigationGuard(
  navigation: { addListener: (event: string, callback: (e: BeforeRemoveEvent) => void) => () => void },
  hasItems: boolean,
  onDiscard?: () => void,
): void {
  useEffect(() => {
    if (!hasItems) return;

    const unsubscribe = navigation.addListener('beforeRemove', (e: BeforeRemoveEvent) => {
      // Allow programmatic navigation (e.g., after successful checkout)
      if (e.data.action.type === 'RESET') return;

      e.preventDefault();

      Alert.alert(
        'Cart has items',
        'You have items in your cart. Going back will keep your cart saved for later. Do you want to leave?',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => {
              onDiscard?.();
              navigation.addListener('beforeRemove', () => {}); // no-op to allow
              // Dispatch the blocked action
              // Cart state persists via Zustand+AsyncStorage automatically
            },
          },
        ],
      );
    });

    return unsubscribe;
  }, [navigation, hasItems, onDiscard]);
}
