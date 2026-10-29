import type { CLIToolPreset } from '@/features/tools/types/cli-tools';

export const MACOS_APP_PRESETS: CLIToolPreset[] = [
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
