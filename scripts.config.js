module.exports = {
    deployment: {
        local: {
            enabled: true,
            path: process.env.OBSIDIAN_PLUGINS_PATH || require('path').join(
                require('os').homedir(),
                'Library',
                'Mobile Documents',
                'iCloud~md~obsidian',
                'Documents',
                'Chengqing Notes',
                '.obsidian',
                'plugins'
            )
        }
    }
};
