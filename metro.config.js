const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// ✅ Ignore backend (pnpm creates temporary _tmp_ folders that disappear and crash Metro watcher on Windows)
config.watchFolders = [__dirname];

config.resolver.blockList = [
  /.*\/backend\/.*/,
  /.*\\backend\\.*/
];

module.exports = config;
