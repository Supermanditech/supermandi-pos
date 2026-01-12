const { getDefaultConfig } = require("expo/metro-config");
const exclusionList = require("metro-config/src/defaults/exclusionList");

const config = getDefaultConfig(__dirname);

// Ignore Gradle build outputs inside node_modules (they appear/disappear and break Windows watcher)
config.resolver.blockList = exclusionList([
  /node_modules\/expo\/android\/build\/.*/,
  /node_modules\/.*\/android\/build\/.*/,
  /node_modules\/.*\/android\/\.gradle\/.*/,
]);

module.exports = config;
