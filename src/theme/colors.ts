export const colors = {
  // Primary POS Green (Stitch UI inspired)
  primary: '#10B981',
  primaryDark: '#059669',
  primaryLight: '#34D399',
  
  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F9FAFB',
  backgroundTertiary: '#F3F4F6',
  
  // Text - High Contrast
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textTertiary: '#6B7280',
  textInverse: '#FFFFFF',
  
  // Status Colors
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  
  // Borders
  border: '#E5E7EB',
  borderDark: '#D1D5DB',
  
  // Overlays
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.25)',
} as const;

export type ColorKey = keyof typeof colors;
