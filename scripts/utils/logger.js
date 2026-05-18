const pc = require('picocolors');

class Logger {
    constructor() {
        this.colors = {
            success: pc.green,
            error: pc.red,
            warning: pc.yellow,
            info: pc.blue,
            highlight: pc.cyan,
            muted: pc.gray
        };
    }

    success(message, spinner = null) {
        if (spinner) {
            spinner.succeed(pc.green(message));
        } else {
            console.log(pc.green('✅'), message);
        }
    }

    error(message, spinner = null) {
        if (spinner) {
            spinner.fail(pc.red(message));
        } else {
            console.log(pc.red('❌'), message);
        }
    }

    warning(message) {
        console.log(pc.yellow('⚠️'), message);
    }

    info(message) {
        console.log(pc.blue('ℹ️'), message);
    }

    highlight(message) {
        console.log(pc.cyan('🔸'), message);
    }

    muted(message) {
        console.log(pc.gray('   '), message);
    }

    spinner(text) {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let frameIndex = 0;
        let interval = null;
        const stream = process.stderr;

        const render = () => {
            stream.write('\r' + pc.cyan(frames[frameIndex]) + '  ' + pc.cyan(text) + '  ');
            frameIndex = (frameIndex + 1) % frames.length;
        };

        return {
            start() {
                interval = setInterval(render, 80);
                render();
                return this;
            },
            stop() {
                if (interval) { clearInterval(interval); interval = null; }
                stream.write('\r\x1b[K');
            },
            succeed(msg) {
                this.stop();
                console.log(pc.green('✔'), msg || text);
            },
            fail(msg) {
                this.stop();
                console.log(pc.red('✖'), msg || text);
            }
        };
    }

    section(title) {
        console.log('');
        console.log(pc.bold(pc.blue(`\n📋 ${title}`)));
        console.log(pc.blue('─'.repeat(50)));
    }

    step(step, message) {
        console.log(pc.cyan(`   ${step}.`), message);
    }

    file(path) {
        console.log(pc.magenta('📁'), path);
    }

    command(cmd) {
        console.log(pc.yellow('⚡'), pc.gray(cmd));
    }
}

module.exports = new Logger();
