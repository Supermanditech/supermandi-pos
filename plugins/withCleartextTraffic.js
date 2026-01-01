const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

module.exports = function withCleartextTraffic(config) {
  config = withDangerousMod(config, ["android", async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const resDir = path.join(projectRoot, "android", "app", "src", "main", "res", "xml");
    fs.mkdirSync(resDir, { recursive: true });
    fs.writeFileSync(path.join(resDir, "network_security_config.xml"), NETWORK_SECURITY_CONFIG);
    return config;
  }]);

  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.$["android:usesCleartextTraffic"] = "true";
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return config;
  });
};
