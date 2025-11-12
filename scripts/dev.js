#!/usr/bin/env node

const { watch } = 'fs';
const { join, basename } = 'path';
const logger = require('./utils/logger');
const FileUtils = require('./utils/file-utils');
const Builder = require('./build');
const Deployer = require('./deploy');

/**
 * Enhanced development server with hot reload and auto-deployment
 */
class DevServer {
    constructor() {
        this.sourceDir = process.cwd();
        this.mainJsPath = join(this.sourceDir, 'main.js');
        this.hotReloadFile = join(this.sourceDir, '.hotreload');
        
        // Parse command line arguments
        this.args = this.parseArgs();
        
        // Initialize components
        this.builder = new Builder();
        this.deployer = null;
        
        // State tracking
        this.isFirstBuild = true;
        this.buildCount = 0;
        this.debounceTimer = null;
        this.isBuilding = false;
    }

    parseArgs() {
        const argv = process.argv.slice(2);
        const args = {
            hot: true,           // Enable hot reload by default
            watch: true,         // Enable file watching by default
            deploy: false,       // Auto-deploy disabled by default
            deployTarget: 'local',
            showHelp: false
        };
        
        for (let i = 0; i < argv.length; i++) {
            const arg = argv[i];
            switch (arg) {
                case '--no-hot':
                    args.hot = false;
                    break;
                case '--no-watch':
                    args.watch = false;
                    break;
                case '--deploy':
                    args.deploy = true;
                    break;
                case '--production':
                case '-p':
                    args.deployTarget = 'production';
                    args.deploy = true;
                    break;
                case '--local':
                case '-l':
                    args.deployTarget = 'local';
                    break;
                case '--help':
                case '-h':
                    args.showHelp = true;
                    break;
            }
        }
        
        return args;
    }

    async start() {
        if (this.args.showHelp) {
            this.showHelp();
            return;
        }

        logger.section('🚀 Development Server');
        logger.info(`Hot Reload: ${args.hot ? '✅' : '❌'}`);
        logger.info(`File Watch: ${args.watch ? '✅' : '❌'}`);
        logger.info(`Auto Deploy: ${args.deploy ? `✅ (${args.deployTarget})` : '❌'}`);
        
        try {
            // Initialize deployer if needed
            if (this.args.deploy) {
                this.deployer = new Deployer(this.args.deployTarget);
            }

            // Initial build
            await this.performBuild(true);
            
            // Initial deployment if enabled
            if (this.args.deploy) {
                await this.performDeploy();
            }

            // Start file watching
            if (this.args.watch) {
                this.startWatching();
            } else {
                logger.info('🎯 Development server ready (no watch mode)');
            }

        } catch (error) {
            logger.error(`Development server failed to start: ${error.message}`);
            process.exit(1);
        }
    }

    async performBuild(isInitial = false) {
        if (this.isBuilding) {
            logger.warning('Build already in progress, skipping...');
            return;
        }

        this.isBuilding = true;
        const spinner = logger.spinner('Building...');
        
        try {
            // Build for development
            this.builder.isProduction = false;
            this.builder.analyze = isInitial;
            
            await this.builder.validateSource();
            await this.builder.typeCheck();
            await this.builder.runEsbuild();
            
            spinner.succeed('Build completed');
            this.buildCount++;
            
            // Show summary
            if (!isInitial) {
                logger.info(`🔄 Build #${this.buildCount} completed at ${new Date().toLocaleTimeString()}`);
            }
            
        } catch (error) {
            spinner.fail(`Build failed: ${error.message}`);
            throw error;
        } finally {
            this.isBuilding = false;
        }
    }

    async performDeploy() {
        if (!this.deployer) {
            return;
        }

        const spinner = logger.spinner('Deploying...');
        
        try {
            await this.deployer.validateSourceFiles();
            await this.deployer.prepareDestination();
            await this.deployer.deployFiles();
            await this.deployer.verifyDeployment();
            
            spinner.succeed('Deployed successfully');
            logger.info('💡 Plugin is ready in Obsidian - reload the plugin to see changes');
            
        } catch (error) {
            spinner.fail(`Deployment failed: ${error.message}`);
            throw error;
        }
    }

    startWatching() {
        logger.info('👀 Starting file watcher...');
        logger.info(`📁 Watching: ${this.mainJsPath}`);
        logger.info(`🎯 Hot reload trigger: ${this.hotReloadFile}`);
        
        // Create initial hot reload file
        if (this.args.hot) {
            this.createHotReloadFile();
        }
        
        // Watch main.js for changes
        const watcher = watch(this.mainJsPath, { persistent: true }, async (eventType) => {
            if (eventType === 'change') {
                await this.handleFileChange();
            }
        });

        // Handle cleanup
        process.on('SIGINT', () => {
            logger.info('\n👋 Stopping development server...');
            watcher.close();
            process.exit(0);
        });

        logger.info('✅ Development server started');
        logger.info('💡 Make changes to your code and they will be automatically built and deployed');
        logger.info('💡 Press Ctrl+C to stop');
    }

    async handleFileChange() {
        // Skip first few changes (initial build artifacts)
        if (this.buildCount <= 1) {
            logger.muted('⏭️  Skipping initial build change');
            return;
        }

        // Debounce rapid changes
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
            try {
                logger.info(`🔄 File changed - rebuilding...`);
                
                // Build
                await this.performBuild();
                
                // Deploy if enabled
                if (this.args.deploy) {
                    await this.performDeploy();
                }
                
                // Trigger hot reload
                if (this.args.hot) {
                    this.triggerHotReload();
                }
                
            } catch (error) {
                logger.error(`Development cycle failed: ${error.message}`);
            }
        }, 300);
    }

    createHotReloadFile() {
        try {
            FileUtils.ensureDirectory(dirname(this.hotReloadFile));
            require('fs').writeFileSync(this.hotReloadFile, Date.now().toString());
            logger.muted('📝 Created hot reload trigger file');
        } catch (error) {
            logger.warning(`Could not create hot reload file: ${error.message}`);
        }
    }

    triggerHotReload() {
        try {
            require('fs').writeFileSync(this.hotReloadFile, Date.now().toString());
            logger.success('🔥 Hot reload triggered');
        } catch (error) {
            logger.error(`Failed to trigger hot reload: ${error.message}`);
        }
    }

    showHelp() {
        console.log(`
🚀 Obsidian Plugin Development Server

Usage: node dev.js [options]

Options:
  --hot          Enable hot reload (default: true)
  --no-hot       Disable hot reload
  --watch        Enable file watching (default: true)
  --no-watch     Disable file watching
  --deploy       Enable auto-deployment after builds
  --local        Deploy to local Obsidian (when --deploy is used)
  --production   Deploy to production (when --deploy is used)
  --help         Show this help message

Examples:
  node dev.js                    # Development with hot reload and watch
  node dev.js --deploy           # Development with auto-deployment
  node dev.js --no-hot           # Development without hot reload
  node dev.js --deploy --production # Development with production deployment

Environment Variables:
  OBSIDIAN_LOCAL_PATH     Override local deployment path
  OBSIDIAN_PRODUCTION_PATH Override production deployment path

Workflow:
  1. Code changes are detected automatically
  2. TypeScript compilation is performed
  3. Plugin is built with esbuild
  4. If --deploy is enabled, plugin is deployed
  5. If --hot is enabled, hot reload is triggered

Configuration:
  Development options can be customized in scripts.config.js
        `);
    }
}

// Command line interface
async function main() {
    const devServer = new DevServer();
    await devServer.start();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        logger.error(`Unexpected error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = DevServer;
