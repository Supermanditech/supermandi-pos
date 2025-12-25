import { TextStyle } from 'react-native';

export const typography = {
  // Large Typography for POS devices
  h1: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.5,
  } as TextStyle,
  
  h2: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.5,
  } as TextStyle,
  
  h3: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
    letterSpacing: -0.25,
  } as TextStyle,
  
  h4: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
    letterSpacing: 0,
  } as TextStyle,
  
  body: {
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 26,
    letterSpacing: 0,
  } as TextStyle,
  
  bodyLarge: {
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 28,
    letterSpacing: 0,
  } as TextStyle,
  
  bodySmall: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    letterSpacing: 0,
  } as TextStyle,
  
  button: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: 0.5,
  } as TextStyle,
  
  caption: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    letterSpacing: 0.25,
  } as TextStyle,
  
  label: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
    letterSpacing: 0.25,
  } as TextStyle,
} as const;

export type TypographyKey = keyof typeof typography;
