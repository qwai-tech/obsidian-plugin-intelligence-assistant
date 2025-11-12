const chalk = require('chalk');
const ora = require('ora');

class Logger {
    constructor() {
        this.colors = {
            success: chalk.green,
            error: chalk.red,
            warning: chalk.yellow,
            info: chalk.blue,
            highlight: chalk.cyan,
            muted: chalk.gray
        };
    }

    success(message, spinner = null) {
        if (spinner) {
            spinner.succeed(chalk.green(message));
        } else {
            console.log(chalk.green('✅'), message);
        }
    }

    error(message, spinner = null) {
        if (spinner) {
            spinner.fail(chalk.red(message));
        } else {
            console.log(chalk.red('❌'), message);
        }
    }

    warning(message) {
        console.log(chalk.yellow('⚠️'), message);
    }

    info(message) {
        console.log(chalk.blue('ℹ️'), message);
    }

    highlight(message) {
        console.log(chalk.cyan('🔸'), message);
    }

    muted(message) {
        console.log(chalk.gray('   '), message);
    }

    spinner(text) {
        return ora({
            text: chalk.cyan(text),
            color: 'cyan'
        });
    }

    section(title) {
        console.log('');
        console.log(chalk.bold.blue(`\n📋 ${title}`));
        console.log(chalk.blue('─'.repeat(50)));
    }

    step(step, message) {
        console.log(chalk.cyan(`   ${step}.`), message);
    }

    file(path) {
        console.log(chalk.magenta('📁'), path);
    }

    command(cmd) {
        console.log(chalk.yellow('⚡'), chalk.gray(cmd));
    }
}

module.exports = new Logger();
