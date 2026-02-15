import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useEscapeKey, useAriaLabel, useFocusTrap } from '../../lib/hooks';
import React from 'react';

// ── useEscapeKey ─────────────────────────────────────────────────────────

describe('useEscapeKey', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls onEscape when Escape key is pressed', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, true));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not call onEscape when isActive is false', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, false));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('does not call onEscape for other keys', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, true));

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.keyDown(document, { key: 'a' });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('defaults isActive to true', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('cleans up event listener on unmount', () => {
    const onEscape = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(onEscape, true));

    unmount();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('cleans up when isActive changes from true to false', () => {
    const onEscape = vi.fn();
    const { rerender } = renderHook(
      ({ active }) => useEscapeKey(onEscape, active),
      { initialProps: { active: true } }
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    onEscape.mockClear();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('prevents default on Escape', () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(onEscape, true));

    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    document.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});

// ── useAriaLabel ─────────────────────────────────────────────────────────

describe('useAriaLabel', () => {
  it('capitalizes entity and appends field + "input"', () => {
    const { result } = renderHook(() => useAriaLabel('product', 'name'));
    expect(result.current).toBe('Product name input');
  });

  it('capitalizes first letter of entity', () => {
    const { result } = renderHook(() => useAriaLabel('supplier', 'phone'));
    expect(result.current).toBe('Supplier phone input');
  });

  it('handles single character entity', () => {
    const { result } = renderHook(() => useAriaLabel('a', 'b'));
    expect(result.current).toBe('A b input');
  });

  it('handles empty strings', () => {
    const { result } = renderHook(() => useAriaLabel('', ''));
    expect(result.current).toBe('  input');
  });

  it('does not modify already capitalized entity', () => {
    const { result } = renderHook(() => useAriaLabel('Store', 'address'));
    expect(result.current).toBe('Store address input');
  });
});

// ── useFocusTrap ─────────────────────────────────────────────────────────

describe('useFocusTrap', () => {
  it('focuses the first focusable element when active', () => {
    const container = document.createElement('div');
    const button1 = document.createElement('button');
    button1.textContent = 'First';
    const button2 = document.createElement('button');
    button2.textContent = 'Last';
    container.appendChild(button1);
    container.appendChild(button2);
    document.body.appendChild(container);

    const ref = { current: container } as React.RefObject<HTMLElement>;
    const focusSpy = vi.spyOn(button1, 'focus');

    renderHook(() => useFocusTrap(ref, true));

    expect(focusSpy).toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('does not focus when isActive is false', () => {
    const container = document.createElement('div');
    const button = document.createElement('button');
    container.appendChild(button);
    document.body.appendChild(container);

    const ref = { current: container } as React.RefObject<HTMLElement>;
    const focusSpy = vi.spyOn(button, 'focus');

    renderHook(() => useFocusTrap(ref, false));

    expect(focusSpy).not.toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('traps Tab from last element to first element', () => {
    const container = document.createElement('div');
    const button1 = document.createElement('button');
    const button2 = document.createElement('button');
    container.appendChild(button1);
    container.appendChild(button2);
    document.body.appendChild(container);

    const ref = { current: container } as React.RefObject<HTMLElement>;
    renderHook(() => useFocusTrap(ref, true));

    // Focus the last element
    button2.focus();
    const focusSpy = vi.spyOn(button1, 'focus');

    // Tab from last element should wrap to first
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });

    expect(focusSpy).toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('traps Shift+Tab from first element to last element', () => {
    const container = document.createElement('div');
    const button1 = document.createElement('button');
    const button2 = document.createElement('button');
    container.appendChild(button1);
    container.appendChild(button2);
    document.body.appendChild(container);

    const ref = { current: container } as React.RefObject<HTMLElement>;
    renderHook(() => useFocusTrap(ref, true));

    // Focus the first element
    button1.focus();
    const focusSpy = vi.spyOn(button2, 'focus');

    // Shift+Tab from first should wrap to last
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(focusSpy).toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('does not trap non-Tab keys', () => {
    const container = document.createElement('div');
    const button = document.createElement('button');
    container.appendChild(button);
    document.body.appendChild(container);

    const ref = { current: container } as React.RefObject<HTMLElement>;
    renderHook(() => useFocusTrap(ref, true));

    // Non-Tab key should not cause issues
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });

    // No assertion needed - just verify no errors thrown
    document.body.removeChild(container);
  });

  it('handles null ref', () => {
    const ref = { current: null } as React.RefObject<HTMLElement>;

    // Should not throw
    renderHook(() => useFocusTrap(ref, true));
  });
});
