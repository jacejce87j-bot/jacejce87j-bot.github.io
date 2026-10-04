const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withNetworkSecurityConfig(config) {
  // Add android:networkSecurityConfig attribute to the <application> element
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    if (!manifest || !manifest.manifest) return config;
    const application = manifest.manifest.application && manifest.manifest.application[0];
    if (application && application.$) {
      application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return config;
  });

  // Copy network_security_config.xml into the android project res/xml directory during prebuild
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const src = path.join(projectRoot, 'network_security_config.xml');
      const destDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
      try {
        if (!fs.existsSync(src)) {
          console.warn('withNetworkSecurityConfig: network_security_config.xml not found at', src);
          return config;
        }
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, path.join(destDir, 'network_security_config.xml'));
      } catch (e) {
        console.warn('withNetworkSecurityConfig: failed to copy network_security_config.xml', e);
      }
      return config;
    }
  ]);

  return config;
};