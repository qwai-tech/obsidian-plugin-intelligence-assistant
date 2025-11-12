const { join } = require('path');
const { existsSync } = require('fs');
const os = require('os');

function resolveDefaultLocalPath() {
    const envPath = process.env.OBSIDIAN_LOCAL_PATH;
    if (envPath) {
        return envPath;
    }

    const legacyPath = join(
        os.homedir(),
        'Library',
        'Mobile Documents',
        'iCloud~md~obsidian',
        'Documents',
        'Chengqing Notes',
        '.obsidian',
        'plugins'
    );

    if (existsSync(legacyPath)) {
        return legacyPath;
    }

    return join(os.homedir(), '.obsidian', 'plugins');
}

// Default configuration
const defaultConfig = {
    // Plugin identification
    pluginId: 'intelligence-assistant',
    
    // Deployment paths
    local: {
        enabled: true,
        path: resolveDefaultLocalPath()
    },
    
    production: {
        enabled: false,
        path: process.env.OBSIDIAN_PRODUCTION_PATH
    },
    
    // Files to deploy
    files: [
        'main.js',
        'manifest.json',
        'styles.css'
    ],
    
    // Options
    options: {
        createBackup: true,
        verifyFiles: true,
        showProgress: true
    }
};

// Load user overrides if config file exists
let userConfig = {};
const userConfigPath = join(process.cwd(), 'scripts.config.js');
if (existsSync(userConfigPath)) {
    try {
        userConfig = require(userConfigPath).deployment || {};
    } catch (error) {
        console.warn('Warning: Could not load user config, using defaults');
    }
}

// Merge with user configuration
const config = {
    ...defaultConfig,
    ...userConfig,
    local: {
        ...defaultConfig.local,
        ...(userConfig.local || {})
    },
    production: {
        ...defaultConfig.production,
        ...(userConfig.production || {})
    },
    options: {
        ...defaultConfig.options,
        ...(userConfig.options || {})
    }
};

// Validate configuration
function validateConfig(config) {
    const errors = [];
    
    if (!config.pluginId) {
        errors.push('Plugin ID is required');
    }
    
    if (config.local.enabled && !config.local.path) {
        errors.push('Local deployment path is required when local deployment is enabled');
    }
    
    if (config.production.enabled && !config.production.path) {
        errors.push('Production deployment path is required when production deployment is enabled');
    }
    
    if (!config.files || config.files.length === 0) {
        errors.push('At least one file must be specified for deployment');
    }
    
    return errors;
}

// Get target deployment configuration
function getDeploymentConfig(target = 'local') {
    if (target === 'production' && config.production.enabled) {
        return {
            ...config.production,
            isProduction: true,
            files: config.files,
            pluginId: config.pluginId,
            options: config.options
        };
    } else if (config.local.enabled) {
        return {
            ...config.local,
            isProduction: false,
            files: config.files,
            pluginId: config.pluginId,
            options: config.options
        };
    } else {
        throw new Error(`Deployment target '${target}' is not enabled`);
    }
}

module.exports = {
    config,
    validateConfig,
    getDeploymentConfig
};
