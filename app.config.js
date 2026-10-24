const fs = require('node:fs');

module.exports = ({ config }) => {
  // EAS supports a file environment variable; local builds can use an ignored
  // google-services.json. The rest of the app works before Firebase is configured.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync('./google-services.json') ? './google-services.json' : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
