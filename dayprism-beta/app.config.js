// DayPrism Beta: the same app as app.json, installed next to the store version with its own
// name, icon, package and link scheme. Everything new is built here first.
module.exports = ({ config }) => ({
  ...config,
  name: 'DayPrism Beta',
  scheme: 'dayprism-beta',
  icon: './assets/beta/icon.png',
  android: {
    ...config.android,
    package: 'app.dayprism.beta',
    adaptiveIcon: {
      ...config.android.adaptiveIcon,
      foregroundImage: './assets/beta/android-icon-foreground.png',
      backgroundColor: '#4a3aa7',
    },
  },
  ios: { ...config.ios, bundleIdentifier: 'app.dayprism.beta' },
  extra: { ...config.extra, channel: 'beta' },
});
