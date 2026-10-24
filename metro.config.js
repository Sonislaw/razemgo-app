const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname, {
  // Preserve SDK module exports on Windows. Runtime integrations disable replay and feedback.
  annotateReactComponents: false,
  enableSourceContextInDevelopment: false,
  optionsFile: false,
});
