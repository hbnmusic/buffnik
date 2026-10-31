// Reads app.json and sets the Android versionCode from CI so each APK installs over the last one.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    versionCode: Number(process.env.ANDROID_VERSION_CODE || 1),
  },
});
