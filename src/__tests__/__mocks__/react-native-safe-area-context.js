// Mock for react-native-safe-area-context
// useSafeAreaInsets is a jest.fn so tests can track calls and override return values
const useSafeAreaInsets = jest.fn().mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
const React = require('react');

module.exports = {
  useSafeAreaInsets,
  SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  SafeAreaView: ({ children, style, ...props }) => React.createElement(require('react-native').View, { style, ...props }, children),
  SafeAreaInsetsContext: { Consumer: ({ children }) => children({ top: 47, bottom: 34, left: 0, right: 0 }) },
  initialWindowMetrics: { insets: { top: 47, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 375, height: 812 } },
};
