/**
 * @module integrations
 * @description Plugin loader for deployment targets
 */

const path = require('path');

const PLUGINS = {};

// Load all available plugins
['proxmox', 'ssh-copy', 'file-copy'].forEach(name => {
  try {
    PLUGINS[name] = require(path.join(__dirname, name));
  } catch (e) {
    console.warn(`Integration plugin "${name}" failed to load: ${e.message}`);
  }
});

/**
 * Get all available plugin definitions (for GUI)
 */
function getAvailablePlugins() {
  return Object.values(PLUGINS).map(p => ({
    type: p.type,
    label: p.label,
    description: p.description,
    configSchema: p.configSchema,
  }));
}

/**
 * Get plugin by type
 */
function getPlugin(type) {
  return PLUGINS[type] || null;
}

module.exports = { getAvailablePlugins, getPlugin };
