#!/usr/bin/env node

const { watch } = require('fs');
const { join } = require('path');
const { writeFileSync, existsSync } = require('fs');
const logger = require('./utils/logger');

/**
 * Hot reload utility for development
 */
class HotReload {
    constructor() {
        this.sourceDir = process.cwd();
        this.options = this.parseArgs();
        
        // Paths
        this.hotReloadFile = join(this.sourceDir, '.hotreload');
        this.mainJsPath = join(this.sourceDir, 'main.js');
        
        // Debounce settings
        this.debounceTime = 200;
        this.skipInitialChanges = 2;
        this.changeCount = 0;
        this.debounceTimer = null;
    }

    parseArgs() {
        const args = process.argv.slice(2);
        return {
            showHelp: args.includes('--help') || args.includes('-h')
        };
    }

    async start() {
        if (this.options.showHelp) {
            this.showHelp();
            return;
        }

        logger.section('🔥 Hot Reload');
        
        this.showInstructions();
        this.createInitialHotReloadFile();
        this.startWatching();
    }

    showInstructions() {
        logger.info('ℹ️  To enable hot reload in Obsidian:');
        logger.info('   • Install "Hot Reload" plugin from community plugins');
        logger.info('   • Or touch .hotreload file after each build');
        logger.info('');
        logger.highlight(`📁 Watching: ${this.mainJsPath}`);
        logger.highlight(`🎯 Trigger: ${this.hotReloadFile}`);
        logger.info('');
    }

    createInitialHotReloadFile() {
        if (!existsSync(this.hotReloadFile)) {
            writeFileSync(this.hotReloadFile, Date.now().toString());
            logger.success('📝 Created .hotreload file');
        }
    }

    startWatching() {
        logger.info('👀 Watching for changes... (Press Ctrl+C to stop)');
        logger.info('');

        watch(this.mainJsPath, (eventType) => {
            if (eventType === 'change') {
                this.handleChange();
            }
        });
    }

    handleChange() {
        this.changeCount++;

        // Skip initial changes (initial build artifacts)
        if (this.changeCount <= this.skipInitialChanges) {
            logger.muted(`⏭️  Skipping initial build change (${this.changeCount}/${this.skipInitialChanges})`);
            return;
        }

        // Debounce rapid changes
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.triggerReload();
        }, this.debounceTime);
    }

    triggerReload() {
        const timestamp = new Date().toLocaleTimeString();
        logger.success(`✅ [${timestamp}] main.js updated - triggering reload`);

        try {
            writeFileSync(this.hotReloadFile, Date.now().toString());
            logger.success('🔄 Hot reload triggered');
        } catch (error) {
            logger.error(`❌ Failed to trigger hot reload: ${error.message}`);
        }
    }

    showHelp() {
        console.log(`
🔥 Hot Reload Tool

Usage: node hot-reload.js

This tool enables hot reloading for Obsidian plugin development.

How it works:
  1. Watches main.js for changes
  2. Creates/updates .hotreload file
  3. Obsidian Hot Reload plugin detects the change and reloads

Setup:
  1. Install "Hot Reload" plugin from Obsidian community plugins
  2. Run this tool during development
  3. Make changes to your code
  4. Build the plugin (esbuild will update main.js)
  5. Hot reload will automatically trigger

Files:
  - .hotreload: Trigger file for Obsidian Hot Reload plugin
  - main.js: Built plugin file being watched

Tip: Use this in combination with build --watch for optimal workflow.
        `);
    }
}

// Command line interface
async function main() {
    const hotReload = new HotReload();
    await hotReload.start();
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    logger.info('\n👋 Hot reload stopped');
    process.exit(0);
});

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        logger.error(`Unexpected error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = HotReload;
