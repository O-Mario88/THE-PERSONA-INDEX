// Metro, set up to share the web app's TypeScript (frontend/src) with this
// app. Shared files are imported as "@shared/<file>"; any package they
// import is taken from this app's node_modules, so there is one React.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)
const shared = path.resolve(__dirname, '../frontend/src')

config.watchFolders = [shared]
config.resolver.extraNodeModules = { '@shared': shared }
const entry = path.join(__dirname, 'index.ts')
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === '@shared' || name.startsWith('@shared/')) {
    return context.resolveRequest(context, path.join(shared, name.slice('@shared'.length)), platform)
  }
  if (context.originModulePath.startsWith(shared + path.sep) && !name.startsWith('.') && !path.isAbsolute(name)) {
    return context.resolveRequest({ ...context, originModulePath: entry }, name, platform)
  }
  return context.resolveRequest(context, name, platform)
}

module.exports = config
