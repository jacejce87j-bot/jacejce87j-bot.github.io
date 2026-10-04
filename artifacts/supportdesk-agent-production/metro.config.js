const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const appNodeModules = path.join(__dirname, 'node_modules');
const appReactQueryEntry = require.resolve('@tanstack/react-query', {
  paths: [appNodeModules],
});
const ticketSystemViteCache = path.join(
  __dirname,
  '..',
  'ticket-system',
  'node_modules',
  '.vite',
);

const existingBlockList = config.resolver.blockList
  ? (Array.isArray(config.resolver.blockList)
      ? config.resolver.blockList.flat(Infinity)
      : [config.resolver.blockList])
  : [];

config.resolver.blockList = [
  ...existingBlockList,
  new RegExp(`${ticketSystemViteCache.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`),
];
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@tanstack/react-query') {
    return {
      type: 'sourceFile',
      filePath: appReactQueryEntry,
    };
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
