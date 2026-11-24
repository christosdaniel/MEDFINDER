// Extends app.json. When the patient app is published as a website in a
// sub-folder (e.g. GitHub Pages /MEDFINDER/app), EXPO_BASE_URL sets that path.
module.exports = ({ config }) => ({
  ...config,
  web: {
    ...config.web,
    name: 'MedFinder',
    shortName: 'MedFinder',
    themeColor: '#0b4a2e',
    backgroundColor: '#ffffff',
  },
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
