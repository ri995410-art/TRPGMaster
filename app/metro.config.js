const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the workspace for hot reload
config.watchFolders = [workspaceRoot];

// Resolve workspace modules (e.g. @trpgmaster/shared)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.disableHierarchicalLookup = true;

// Ensure web platform resolves .js before platform-specific extensions
// This fixes react-native's Image.android.js / Image.ios.js not being found on web
config.resolver.sourceExts = [...config.resolver.sourceExts, 'jsx'];

module.exports = config;
