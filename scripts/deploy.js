#!/usr/bin/env node

const { join } = require('path');
const logger = require('./utils/logger');
const FileUtils = require('./utils/file-utils');
const { getDeploymentConfig, validateConfig, config: deploymentConfig } = require('./config/deployment');

/**
 * Enhanced deployment script with better error handling and configuration
 */
class Deployer {
    constructor(target = 'local') {
        this.target = target;
        this.sourceDir = process.cwd();

        // Validate global configuration before selecting target
        const errors = validateConfig(deploymentConfig);
        if (errors.length > 0) {
            logger.error('Configuration validation failed:');
            errors.forEach(error => logger.error(`  - ${error}`));
            process.exit(1);
        }

        this.config = getDeploymentConfig(target);
    }

    async deploy() {
        logger.section('🚀 Plugin Deployment');
        logger.info(`Target: ${this.target}`);
        logger.info(`Destination: ${this.config.path}`);
        
        try {
            // Step 1: Validate source files
            await this.validateSourceFiles();
            
            // Step 2: Prepare destination
            await this.prepareDestination();
            
            // Step 3: Create backup if enabled
            if (this.config.options.createBackup) {
                await this.createBackup();
            }
            
            // Step 4: Deploy files
            await this.deployFiles();
            
            // Step 5: Verify deployment
            await this.verifyDeployment();
            
            logger.success(`🎉 Plugin deployed successfully to ${this.config.path}`);
            logger.info('💡 Remember to reload plugin in Obsidian or restart Obsidian');
            
        } catch (error) {
            logger.error(`Deployment failed: ${error.message}`);
            process.exit(1);
        }
    }

    async validateSourceFiles() {
        logger.step('1', 'Validating source files');
        
        const validation = FileUtils.validateFiles(this.config.files, this.sourceDir);
        
        if (validation.missing.length > 0) {
            logger.error('Missing required files:');
            validation.missing.forEach(file => logger.error(`  - ${file}`));
            throw new Error('Required files are missing');
        }
        
        logger.success(`All ${validation.valid.length} files validated`);
        
        // Show file sizes
        if (this.config.options.showProgress) {
            logger.muted('File details:');
            validation.valid.forEach(file => {
                logger.muted(`  ${file.path}: ${FileUtils.formatFileSize(file.size)}`);
            });
        }
    }

    async prepareDestination() {
        logger.step('2', 'Preparing destination directory');
        
        if (!FileUtils.ensureDirectory(this.config.path)) {
            logger.muted('Destination directory already exists');
        }
        
        const destConfigPath = join(this.config.path, this.config.pluginId);
        this.pluginDestPath = destConfigPath;
        FileUtils.ensureDirectory(destConfigPath);
        
        logger.file(`Destination ready: ${destConfigPath}`);
    }

    async createBackup() {
        logger.step('3', 'Creating backup');

        const backupDir = join(this.pluginDestPath, '.backups');

        try {
            FileUtils.ensureDirectory(backupDir);

            for (const fileName of this.config.files) {
                const sourcePath = join(this.pluginDestPath, fileName);
                if (FileUtils.getFileInfo(sourcePath).exists) {
                    try {
                        FileUtils.createBackup(sourcePath, backupDir);
                    } catch (error) {
                        logger.warning(`Skipping backup for ${fileName}: ${error.message}`);
                    }
                }
            }

            logger.success('Backup completed');
        } catch (error) {
            logger.warning(`Backup skipped: ${error.message}`);
        }
    }

    async deployFiles() {
        logger.step('4', 'Deploying files');
        
        let successCount = 0;
        let skipCount = 0;
        
        for (const fileName of this.config.files) {
            const sourcePath = join(this.sourceDir, fileName);
            const destPath = join(this.pluginDestPath, fileName);
            
            if (FileUtils.copyFile(sourcePath, destPath, { required: false })) {
                successCount++;
            } else {
                skipCount++;
            }
        }
        
        logger.success(`Deployed: ${successCount} files`);
        if (skipCount > 0) {
            logger.warning(`Skipped: ${skipCount} files`);
        }
    }

    async verifyDeployment() {
        if (!this.config.options.verifyFiles) {
            logger.step('5', 'Skipping verification (disabled in config)');
            return;
        }
        
        logger.step('5', 'Verifying deployment');
        
        const validation = FileUtils.validateFiles(this.config.files, this.pluginDestPath);
        
        if (validation.missing.length > 0) {
            logger.error('Verification failed - missing files:');
            validation.missing.forEach(file => logger.error(`  - ${file}`));
            throw new Error('Deployment verification failed');
        }
        
        logger.success(`Verification passed: ${validation.valid.length} files`);
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    let target = 'local';
    let showHelp = false;
    
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--production' || arg === '-p') {
            target = 'production';
        } else if (arg === '--local' || arg === '-l') {
            target = 'local';
        } else if (arg === '--help' || arg === '-h') {
            showHelp = true;
        }
    }
    
    if (showHelp) {
        console.log(`
🚀 Obsidian Plugin Deployment Tool

Usage: node deploy.js [options]

Options:
  -l, --local     Deploy to local Obsidian (default)
  -p, --production Deploy to production environment
  -h, --help       Show this help message

Examples:
  node deploy.js              # Deploy to local
  node deploy.js --local       # Deploy to local
  node deploy.js --production   # Deploy to production

Environment Variables:
  OBSIDIAN_LOCAL_PATH     Override local deployment path
  OBSIDIAN_PRODUCTION_PATH Override production deployment path

Configuration:
  Create scripts.config.js to customize deployment settings
        `);
        return;
    }
    
    const deployer = new Deployer(target);
    await deployer.deploy();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        logger.error(`Unexpected error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = Deployer;
