const { getDefaultConfig } = require("expo/metro-config");
const exclusionList = require("metro-config/src/defaults/exclusionList");

const config = getDefaultConfig(__dirname);

// Block Metro from watching anything under /backend (prevents ENOENT watcher crashes)
config.resolver.blockList = exclusionList([
  /.*\/backend\/.*/,
  /.*\\backend\\.*/
]);

module.exports = config;
