// T1: Global Jest setup for Expo/React Native screen tests
// Mocks native modules that aren't available in Jest environment

// Mock expo-font to prevent native module errors
jest.mock('expo-font', () => ({
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: jest.fn().mockReturnValue(true),
  useFonts: jest.fn().mockReturnValue([true]),
}));

// Mock AsyncStorage to prevent NativeModule errors from zustand persist stores
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// react-native-reanimated mocked via moduleNameMapper in jest.config.js

// Mock @expo/vector-icons to prevent EventEmitter chain
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const MockIcon = (props) => React.createElement('Text', props, props.name || '');
  return new Proxy({}, {
    get: (_, name) => {
      if (name === '__esModule') return true;
      return MockIcon;
    },
  });
});
