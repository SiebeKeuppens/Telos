// Expo config plugin: wires react-native-health-connect's permission delegate
// into MainActivity.onCreate. The library's own plugin only patches the
// manifest; without this delegate, requestPermission() never shows the sheet.
// Runs at prebuild, so the generated android/ dir stays disposable.
const { withMainActivity } = require("expo/config-plugins");

const IMPORT_LINE =
  "import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate";
const DELEGATE_LINE =
  "    HealthConnectPermissionDelegate.setPermissionDelegate(this)";

module.exports = function withHealthConnectDelegate(config) {
  return withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;

    if (!src.includes(IMPORT_LINE)) {
      src = src.replace(
        /^(package .*)$/m,
        `$1\n\n${IMPORT_LINE}`,
      );
    }

    if (!src.includes("HealthConnectPermissionDelegate.setPermissionDelegate")) {
      // Insert right after super.onCreate(...) inside onCreate.
      src = src.replace(
        /(super\.onCreate\([^)]*\))/,
        `$1\n${DELEGATE_LINE}`,
      );
    }

    mod.modResults.contents = src;
    return mod;
  });
};
