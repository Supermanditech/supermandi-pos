/**
 * Tests for utils/showToast
 */
import { Platform, ToastAndroid } from 'react-native';
import { showToast } from '../../utils/showToast';

describe('showToast', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
    jest.restoreAllMocks();
  });

  it('calls ToastAndroid.show on Android with short duration', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });
    const spy = jest.spyOn(ToastAndroid, 'show').mockImplementation();
    showToast('Hello', 'short');
    expect(spy).toHaveBeenCalledWith('Hello', ToastAndroid.SHORT);
  });

  it('calls ToastAndroid.show on Android with long duration', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });
    const spy = jest.spyOn(ToastAndroid, 'show').mockImplementation();
    showToast('Hello', 'long');
    expect(spy).toHaveBeenCalledWith('Hello', ToastAndroid.LONG);
  });

  it('defaults to short duration', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });
    const spy = jest.spyOn(ToastAndroid, 'show').mockImplementation();
    showToast('Hello');
    expect(spy).toHaveBeenCalledWith('Hello', ToastAndroid.SHORT);
  });

  it('logs to console on iOS (no crash)', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
    const spy = jest.spyOn(console, 'log').mockImplementation();
    showToast('Hello');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Hello'));
    spy.mockRestore();
  });
});
