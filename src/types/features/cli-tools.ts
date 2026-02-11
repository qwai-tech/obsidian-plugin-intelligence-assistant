/**
 * CLI Tool Types
 * Types for local command-line tool execution
 */

/**
 * Configuration for a CLI tool
 */
export interface CLIToolConfig {
	/** Unique identifier for the tool */
	id: string;
	/** Tool name exposed to LLM */
	name: string;
	/** Description for LLM to understand when to use this tool */
	description: string;
	/** Command to execute (e.g., "node", "python", "bash", "/path/to/script") */
	command: string;
	/** Default arguments with {{param}} template support */
	args?: string[];
	/** Static environment variables */
	env?: Record<string, string>;
	/** Working directory for command execution */
	cwd?: string;
	/** Whether the tool is enabled */
	enabled: boolean;
	/** Execution timeout in milliseconds (default: 30000) */
	timeout?: number;
	/** Whether to run in shell (default: true) */
	shell?: boolean;
	/** Input parameters that LLM can provide */
	parameters?: CLIToolParameter[];
}

/**
 * Parameter definition for CLI tool
 */
export interface CLIToolParameter {
	/** Parameter name */
	name: string;
	/** Parameter type */
	type: 'string' | 'number' | 'boolean';
	/** Description for LLM */
	description: string;
	/** Whether the parameter is required */
	required?: boolean;
	/** Default value if not provided */
	default?: string | number | boolean;
	/**
	 * How to pass the parameter to the command:
	 * - 'template': Replace {{param}} placeholder in args (default)
	 * - 'arg': Append as command-line argument
	 * - 'env': Pass as environment variable
	 */
	insertAs?: 'template' | 'arg' | 'env';
	/** Environment variable name (only used when insertAs is 'env') */
	envName?: string;
}

/**
 * Default timeout for CLI tool execution (30 seconds)
 */
export const DEFAULT_CLI_TIMEOUT = 30000;

/**
 * Default values for CLI tool configuration
 */
export const CLI_TOOL_DEFAULTS: Partial<CLIToolConfig> = {
	enabled: true,
	timeout: DEFAULT_CLI_TIMEOUT,
	shell: true,
	args: [],
	parameters: []
};

/**
 * CLI Tool Preset - a template for quickly adding common tools
 */
export interface CLIToolPreset {
	/** Preset identifier */
	id: string;
	/** Display name */
	name: string;
	/** Category for grouping */
	category: 'file' | 'search' | 'network' | 'code' | 'system' | 'data' | 'apps';
	/** Tool configuration template */
	config: Omit<CLIToolConfig, 'id' | 'enabled'>;
	/** Platforms this tool is available on */
	platforms: Array<'darwin' | 'linux' | 'win32'>;
}

/**
 * Built-in CLI tool presets for common operations
 */
export const CLI_TOOL_PRESETS: CLIToolPreset[] = [
	// File Operations
	{
		id: 'preset-cat',
		name: 'Read File (cat)',
		category: 'file',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'cat_file',
			description: 'Read and display the contents of a file',
			command: 'cat',
			args: ['{{file_path}}'],
			parameters: [
				{
					name: 'file_path',
					type: 'string',
					description: 'Path to the file to read',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-ls',
		name: 'List Directory (ls)',
		category: 'file',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'list_directory',
			description: 'List files and directories in a path',
			command: 'ls',
			args: ['-la', '{{path}}'],
			parameters: [
				{
					name: 'path',
					type: 'string',
					description: 'Directory path to list (default: current directory)',
					required: false,
					default: '.',
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-find',
		name: 'Find Files (find)',
		category: 'search',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'find_files',
			description: 'Find files matching a pattern in a directory',
			command: 'find',
			args: ['{{directory}}', '-name', '{{pattern}}'],
			parameters: [
				{
					name: 'directory',
					type: 'string',
					description: 'Directory to search in',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'pattern',
					type: 'string',
					description: 'File name pattern (e.g., "*.txt", "*.md")',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	// Search Operations
	{
		id: 'preset-grep',
		name: 'Search Text (grep)',
		category: 'search',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'grep_search',
			description: 'Search for a pattern in files',
			command: 'grep',
			args: ['-rn', '{{pattern}}', '{{path}}'],
			parameters: [
				{
					name: 'pattern',
					type: 'string',
					description: 'Text pattern to search for',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'path',
					type: 'string',
					description: 'File or directory to search in',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-ripgrep',
		name: 'Fast Search (rg)',
		category: 'search',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'ripgrep_search',
			description: 'Fast text search using ripgrep',
			command: 'rg',
			args: ['--line-number', '{{pattern}}', '{{path}}'],
			parameters: [
				{
					name: 'pattern',
					type: 'string',
					description: 'Text pattern to search for (regex supported)',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'path',
					type: 'string',
					description: 'File or directory to search in',
					required: false,
					default: '.',
					insertAs: 'template'
				}
			]
		}
	},
	// Network Operations
	{
		id: 'preset-curl',
		name: 'HTTP Request (curl)',
		category: 'network',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'http_request',
			description: 'Make an HTTP request to a URL',
			command: 'curl',
			args: ['-s', '{{url}}'],
			parameters: [
				{
					name: 'url',
					type: 'string',
					description: 'URL to fetch',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-curl-post',
		name: 'HTTP POST (curl)',
		category: 'network',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'http_post',
			description: 'Make an HTTP POST request with JSON data',
			command: 'curl',
			args: ['-s', '-X', 'POST', '-H', 'Content-Type: application/json', '-d', '{{data}}', '{{url}}'],
			parameters: [
				{
					name: 'url',
					type: 'string',
					description: 'URL to post to',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'data',
					type: 'string',
					description: 'JSON data to send',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	// Code Execution
	{
		id: 'preset-python',
		name: 'Run Python Code',
		category: 'code',
		platforms: ['darwin', 'linux', 'win32'],
		config: {
			name: 'run_python',
			description: 'Execute Python code and return the output',
			command: 'python3',
			args: ['-c', '{{code}}'],
			timeout: 60000,
			parameters: [
				{
					name: 'code',
					type: 'string',
					description: 'Python code to execute',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-node',
		name: 'Run JavaScript (Node)',
		category: 'code',
		platforms: ['darwin', 'linux', 'win32'],
		config: {
			name: 'run_javascript',
			description: 'Execute JavaScript code using Node.js',
			command: 'node',
			args: ['-e', '{{code}}'],
			timeout: 60000,
			parameters: [
				{
					name: 'code',
					type: 'string',
					description: 'JavaScript code to execute',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-bash',
		name: 'Run Shell Script',
		category: 'code',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'run_shell',
			description: 'Execute a shell command or script',
			command: 'bash',
			args: ['-c', '{{script}}'],
			parameters: [
				{
					name: 'script',
					type: 'string',
					description: 'Shell command or script to execute',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	// Data Processing
	{
		id: 'preset-jq',
		name: 'JSON Processor (jq)',
		category: 'data',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'process_json',
			description: 'Process JSON data using jq',
			command: 'jq',
			args: ['{{filter}}', '{{file}}'],
			parameters: [
				{
					name: 'filter',
					type: 'string',
					description: 'jq filter expression (e.g., ".name", ".items[]")',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'file',
					type: 'string',
					description: 'JSON file path (use "-" for stdin)',
					required: false,
					default: '-',
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-wc',
		name: 'Word Count (wc)',
		category: 'data',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'word_count',
			description: 'Count lines, words, and characters in a file',
			command: 'wc',
			args: ['{{file}}'],
			parameters: [
				{
					name: 'file',
					type: 'string',
					description: 'File to count',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	// System Information
	{
		id: 'preset-date',
		name: 'Current Date/Time',
		category: 'system',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'get_datetime',
			description: 'Get the current date and time',
			command: 'date',
			args: [],
			parameters: []
		}
	},
	{
		id: 'preset-pwd',
		name: 'Current Directory (pwd)',
		category: 'system',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'get_cwd',
			description: 'Get the current working directory',
			command: 'pwd',
			args: [],
			parameters: []
		}
	},
	{
		id: 'preset-whoami',
		name: 'Current User',
		category: 'system',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'get_user',
			description: 'Get the current username',
			command: 'whoami',
			args: [],
			parameters: []
		}
	},
	{
		id: 'preset-uname',
		name: 'System Info (uname)',
		category: 'system',
		platforms: ['darwin', 'linux'],
		config: {
			name: 'system_info',
			description: 'Get system information (OS, kernel version, etc.)',
			command: 'uname',
			args: ['-a'],
			parameters: []
		}
	},
	// macOS Apps & Desktop
	{
		id: 'preset-open',
		name: 'Open File/URL (open)',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'open_target',
			description: 'Open a file, directory, or URL with the default application on macOS',
			command: 'open',
			args: ['{{target}}'],
			parameters: [
				{
					name: 'target',
					type: 'string',
					description: 'File path, directory path, or URL to open',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-open-app',
		name: 'Launch App (open -a)',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'launch_app',
			description: 'Launch a macOS application by name (e.g., "Safari", "Finder", "Terminal", "Calculator")',
			command: 'open',
			args: ['-a', '{{app_name}}'],
			parameters: [
				{
					name: 'app_name',
					type: 'string',
					description: 'Name of the macOS application to launch',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-safari',
		name: 'Open in Safari',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'open_safari',
			description: 'Open a URL in Safari browser',
			command: 'open',
			args: ['-a', 'Safari', '{{url}}'],
			parameters: [
				{
					name: 'url',
					type: 'string',
					description: 'URL to open in Safari',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-chrome',
		name: 'Open in Chrome',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'open_chrome',
			description: 'Open a URL in Google Chrome browser',
			command: 'open',
			args: ['-a', 'Google Chrome', '{{url}}'],
			parameters: [
				{
					name: 'url',
					type: 'string',
					description: 'URL to open in Google Chrome',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-firefox',
		name: 'Open in Firefox',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'open_firefox',
			description: 'Open a URL in Firefox browser',
			command: 'open',
			args: ['-a', 'Firefox', '{{url}}'],
			parameters: [
				{
					name: 'url',
					type: 'string',
					description: 'URL to open in Firefox',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-pbcopy',
		name: 'Copy to Clipboard',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'clipboard_copy',
			description: 'Copy text to the macOS clipboard using pbcopy',
			command: 'bash',
			args: ['-c', 'echo -n "{{text}}" | pbcopy'],
			parameters: [
				{
					name: 'text',
					type: 'string',
					description: 'Text to copy to clipboard',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-pbpaste',
		name: 'Paste from Clipboard',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'clipboard_paste',
			description: 'Read the current contents of the macOS clipboard using pbpaste',
			command: 'pbpaste',
			args: [],
			parameters: []
		}
	},
	{
		id: 'preset-say',
		name: 'Text-to-Speech (say)',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'text_to_speech',
			description: 'Speak text aloud using macOS text-to-speech',
			command: 'say',
			args: ['{{text}}'],
			parameters: [
				{
					name: 'text',
					type: 'string',
					description: 'Text to speak aloud',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-osascript',
		name: 'AppleScript Runner',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'run_applescript',
			description: 'Execute an AppleScript snippet for macOS automation (e.g., control apps, send notifications)',
			command: 'osascript',
			args: ['-e', '{{script}}'],
			timeout: 15000,
			parameters: [
				{
					name: 'script',
					type: 'string',
					description: 'AppleScript code to execute',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-notify',
		name: 'Desktop Notification',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'desktop_notify',
			description: 'Show a macOS desktop notification with a title and body',
			command: 'osascript',
			args: ['-e', 'display notification "{{body}}" with title "{{title}}"'],
			parameters: [
				{
					name: 'title',
					type: 'string',
					description: 'Notification title',
					required: true,
					insertAs: 'template'
				},
				{
					name: 'body',
					type: 'string',
					description: 'Notification body text',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-screencapture',
		name: 'Screenshot',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'take_screenshot',
			description: 'Capture the entire screen and save to a file on macOS',
			command: 'screencapture',
			args: ['{{output_path}}'],
			parameters: [
				{
					name: 'output_path',
					type: 'string',
					description: 'File path to save the screenshot (e.g., "/tmp/screenshot.png")',
					required: true,
					insertAs: 'template'
				}
			]
		}
	},
	{
		id: 'preset-applescript-list-apps',
		name: 'List Running Apps',
		category: 'apps',
		platforms: ['darwin'],
		config: {
			name: 'list_running_apps',
			description: 'List all currently running macOS applications',
			command: 'osascript',
			args: ['-e', 'on run\n\tset appList to {}\n\ttell application "System Events"\n\t\tset allApps to name of every process whose visible is true\n\t\tset appList to allApps\n\tend tell\n\treturn appList as text\nend run'],
			parameters: []
		}
	}
];

/**
 * Get presets filtered by current platform
 */
export function getAvailablePresets(): CLIToolPreset[] {
	const platform = process.platform as 'darwin' | 'linux' | 'win32';
	return CLI_TOOL_PRESETS.filter(preset => preset.platforms.includes(platform));
}

/**
 * Get preset categories with their display names
 */
export const PRESET_CATEGORIES: Record<CLIToolPreset['category'], string> = {
	file: 'File Operations',
	search: 'Search',
	network: 'Network',
	code: 'Code Execution',
	data: 'Data Processing',
	system: 'System Information',
	apps: 'macOS Apps & Desktop'
};
