/**
 * Tests for useModalBackHandler
 */
import { renderHook } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';
import { useModalBackHandler } from '../../hooks/useModalBackHandler';

describe('useModalBackHandler', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
    jest.restoreAllMocks();
  });

  it('does not add listener on non-android', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    const onClose = jest.fn();
    renderHook(() => useModalBackHandler(true, onClose));
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not add listener when not visible', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    const onClose = jest.fn();
    renderHook(() => useModalBackHandler(false, onClose));
    expect(spy).not.toHaveBeenCalled();
  });

  it('adds listener on android when visible', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });
    const removeFn = jest.fn();
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: removeFn } as any);
    const onClose = jest.fn();
    renderHook(() => useModalBackHandler(true, onClose));
    expect(spy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
  });

  it('calls onClose when back button pressed', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });
    let handler: (() => boolean) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, cb) => {
      handler = cb as () => boolean;
      return { remove: jest.fn() } as any;
    });
    const onClose = jest.fn();
    renderHook(() => useModalBackHandler(true, onClose));
    expect(handler).toBeDefined();
    const result = handler!();
    expect(onClose).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('removes listener on cleanup', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });
    const removeFn = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: removeFn } as any);
    const onClose = jest.fn();
    const { unmount } = renderHook(() => useModalBackHandler(true, onClose));
    unmount();
    expect(removeFn).toHaveBeenCalled();
  });
});
