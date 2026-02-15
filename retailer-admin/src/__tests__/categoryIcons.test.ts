import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CATEGORY_ICONS,
  DEFAULT_ICON,
  getCategoryIcon,
  createCategoryIconGetter,
} from '../config/categoryIcons';

describe('categoryIcons', () => {
  describe('DEFAULT_CATEGORY_ICONS', () => {
    it('is an object with string values', () => {
      expect(typeof DEFAULT_CATEGORY_ICONS).toBe('object');
      Object.values(DEFAULT_CATEGORY_ICONS).forEach(icon => {
        expect(typeof icon).toBe('string');
      });
    });

    it('contains expected category keys', () => {
      expect(DEFAULT_CATEGORY_ICONS).toHaveProperty('rice');
      expect(DEFAULT_CATEGORY_ICONS).toHaveProperty('oil');
      expect(DEFAULT_CATEGORY_ICONS).toHaveProperty('coffee');
    });
  });

  describe('DEFAULT_ICON', () => {
    it('is a string', () => {
      expect(typeof DEFAULT_ICON).toBe('string');
    });
  });

  describe('getCategoryIcon', () => {
    it('returns correct icon for known key', () => {
      expect(getCategoryIcon('rice')).toBe(DEFAULT_CATEGORY_ICONS['rice']);
    });

    it('returns DEFAULT_ICON for unknown key', () => {
      expect(getCategoryIcon('nonexistent')).toBe(DEFAULT_ICON);
    });

    it('uses custom icons when provided', () => {
      const customIcons = { 'custom-key': '🎯' };
      expect(getCategoryIcon('custom-key', customIcons)).toBe('🎯');
    });

    it('prefers custom icons over defaults', () => {
      const customIcons = { rice: '🎯' };
      expect(getCategoryIcon('rice', customIcons)).toBe('🎯');
    });

    it('falls back to defaults when custom does not have key', () => {
      const customIcons = { 'other': '🎯' };
      expect(getCategoryIcon('rice', customIcons)).toBe(DEFAULT_CATEGORY_ICONS['rice']);
    });
  });

  describe('createCategoryIconGetter', () => {
    it('returns a function', () => {
      const getter = createCategoryIconGetter();
      expect(typeof getter).toBe('function');
    });

    it('getter returns correct icon for known key', () => {
      const getter = createCategoryIconGetter();
      expect(getter('rice')).toBe(DEFAULT_CATEGORY_ICONS['rice']);
    });

    it('getter returns DEFAULT_ICON for unknown key', () => {
      const getter = createCategoryIconGetter();
      expect(getter('nonexistent')).toBe(DEFAULT_ICON);
    });

    it('merges backend icons with defaults', () => {
      const getter = createCategoryIconGetter({ 'custom-key': '🎯' });
      expect(getter('custom-key')).toBe('🎯');
      expect(getter('rice')).toBe(DEFAULT_CATEGORY_ICONS['rice']);
    });

    it('backend icons override defaults', () => {
      const getter = createCategoryIconGetter({ rice: '🎯' });
      expect(getter('rice')).toBe('🎯');
    });
  });
});
