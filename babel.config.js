module.exports = function(api) {
  // Cache based on NODE_ENV so production/development get different configs
  api.cache.using(() => process.env.NODE_ENV);

  const isProduction = process.env.NODE_ENV === 'production';

  const plugins = [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
        },
      },
    ],
    'react-native-reanimated/plugin',
  ];

  // Strip console.* calls only in release/production builds (EAS build or expo export)
  if (isProduction) {
    plugins.splice(plugins.length - 1, 0, 'transform-remove-console');
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
