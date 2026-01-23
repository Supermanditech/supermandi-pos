const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Ignore backend (pnpm creates temp folders that break Metro watcher on Windows)
config.watchFolders = [__dirname];
config.resolver.blockList = [
  /.*\/backend\/.*/,
  /.*\\backend\\.*/
];

module.exports = config;
