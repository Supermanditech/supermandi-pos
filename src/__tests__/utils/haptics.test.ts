/**
 * Tests for utils/haptics
 */

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
}));

import { hapticFeedback } from '../../utils/haptics';
import * as Haptics from 'expo-haptics';

describe('hapticFeedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('light calls impactAsync with Light', async () => {
    await hapticFeedback.light();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('medium calls impactAsync with Medium', async () => {
    await hapticFeedback.medium();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it('heavy calls impactAsync with Heavy', async () => {
    await hapticFeedback.heavy();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
  });

  it('success calls notificationAsync with Success', async () => {
    await hapticFeedback.success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('warning calls notificationAsync with Warning', async () => {
    await hapticFeedback.warning();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
  });

  it('error calls notificationAsync with Error', async () => {
    await hapticFeedback.error();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('selection calls selectionAsync', async () => {
    await hapticFeedback.selection();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('handles error gracefully for light', async () => {
    (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('not available'));
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    await hapticFeedback.light(); // should not throw
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles error gracefully for success', async () => {
    (Haptics.notificationAsync as jest.Mock).mockRejectedValueOnce(new Error('not available'));
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    await hapticFeedback.success(); // should not throw
    consoleSpy.mockRestore();
  });

  it('handles error gracefully for selection', async () => {
    (Haptics.selectionAsync as jest.Mock).mockRejectedValueOnce(new Error('not available'));
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    await hapticFeedback.selection(); // should not throw
    consoleSpy.mockRestore();
  });
});
