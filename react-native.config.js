// Fix for pnpm strict hoisting: expo-modules-autolinking's
// require-from-string silently fails to load expo's react-native.config.js
// because expo-modules-autolinking/exports can't be resolved.
// The namespace in expo's build.gradle is "expo.core" but the actual
// ExpoModulesPackage class lives in package "expo.modules".
// This project-level override provides the correct import path.
module.exports = {
  dependencies: {
    expo: {
      platforms: {
        android: {
          packageImportPath: 'import expo.modules.ExpoModulesPackage;',
        },
      },
    },
  },
};
