// Expo config plugin: wires react-native-health-connect's permission delegate
// into MainActivity.onCreate, AND declares the health data permissions in the
// manifest. The library's own plugin (app.plugin.js, applied via the
// "react-native-health-connect" entry in app.json) only adds the
// ACTION_SHOW_PERMISSIONS_RATIONALE intent-filter — it does NOT add the
// per-record-type <uses-permission> entries. Per Health Connect's own docs,
// requestPermission() requires those permissions to already be declared in
// the manifest, so without this, the runtime permission prompt silently
// fails to grant anything. Keep this list in sync with the accessType/
// recordType pairs requested in lib/health.ts.
// Runs at prebuild, so the generated android/ dir stays disposable.
const { withMainActivity, withAndroidManifest } = require("expo/config-plugins");

const IMPORT_LINE =
  "import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate";
const DELEGATE_LINE =
  "    HealthConnectPermissionDelegate.setPermissionDelegate(this)";

const HEALTH_PERMISSIONS = [
  "android.permission.health.READ_WEIGHT",
  "android.permission.health.WRITE_WEIGHT",
  "android.permission.health.WRITE_EXERCISE",
];

module.exports = function withHealthConnectDelegate(config) {
  config = withMainActivity(config, (mod) => {
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

  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] ?? [];

    for (const name of HEALTH_PERMISSIONS) {
      const already = manifest["uses-permission"].some(
        (p) => p.$?.["android:name"] === name,
      );
      if (!already) {
        manifest["uses-permission"].push({ $: { "android:name": name } });
      }
    }

    // Android 14+ additionally requires this activity-alias (the library's
    // own plugin only adds the Android-13 ACTION_SHOW_PERMISSIONS_RATIONALE
    // intent-filter); without it the system can suppress the Health Connect
    // permission dialog entirely — requestPermission() then resolves silently
    // with an empty grant.
    const app = manifest.application?.[0];
    if (app) {
      app["activity-alias"] = app["activity-alias"] ?? [];
      const hasAlias = app["activity-alias"].some(
        (a) => a.$?.["android:name"] === "ViewPermissionUsageActivity",
      );
      if (!hasAlias) {
        app["activity-alias"].push({
          $: {
            "android:name": "ViewPermissionUsageActivity",
            "android:exported": "true",
            "android:targetActivity": ".MainActivity",
            "android:permission": "android.permission.START_VIEW_PERMISSION_USAGE",
          },
          "intent-filter": [
            {
              action: [
                { $: { "android:name": "android.intent.action.VIEW_PERMISSION_USAGE" } },
              ],
              category: [
                { $: { "android:name": "android.intent.category.HEALTH_PERMISSIONS" } },
              ],
            },
          ],
        });
      }
    }

    return mod;
  });
};
