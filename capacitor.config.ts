const config = {
  appId: 'ao.roletaquant.lab',
  appName: 'Roleta Quant Lab',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*'],
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    RouletteSplitBrowser: {
      defaultUrl: 'https://www.kwanzabet.ao',
      preserveCookies: true,
    },
  },
};

export default config;
