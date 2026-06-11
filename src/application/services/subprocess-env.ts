/**
 * Builds the environment handed to spawned subprocesses (CLI tools and MCP
 * stdio servers).
 *
 * Forwarding the entire parent `process.env` would leak unrelated secrets and
 * identity variables (API keys, USER, HOSTNAME, SSH_*, ...) into every
 * user-configured subprocess. Instead only an execution-essential allowlist is
 * inherited. Anything a specific tool/server needs beyond this list must be set
 * explicitly through its own `env` configuration.
 */
const INHERITED_ENV_KEYS: readonly string[] = [
	// Executable lookup
	'PATH', 'Path', 'PATHEXT',
	// Home / user-install locations (needed to resolve ~/.local/bin, caches, ...)
	'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
	// Locale
	'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES',
	// Temporary directories
	'TMPDIR', 'TEMP', 'TMP',
	// Shell / terminal
	'SHELL', 'TERM', 'ComSpec',
	// Windows system directories
	'SystemRoot', 'SystemDrive', 'windir', 'APPDATA', 'LOCALAPPDATA',
	'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
	// Node toolchain
	'NODE_PATH', 'NVM_DIR', 'NVM_BIN',
	// Python toolchain
	'PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV', 'PYENV_ROOT', 'CONDA_PREFIX', 'CONDA_DEFAULT_ENV',
	// Rust / cargo toolchain (uv is often installed via cargo)
	'CARGO_HOME', 'RUSTUP_HOME',
	// Proxy configuration for tools that make network calls
	'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
	'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
];

/**
 * Returns an allowlisted copy of the parent environment merged with any
 * caller-supplied variables. Caller-supplied values take precedence and are
 * always passed through, since they were configured explicitly by the user.
 */
export function buildSubprocessEnv(
	extraEnv?: Record<string, string | undefined>
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const key of INHERITED_ENV_KEYS) {
		const value = process.env[key];
		if (value !== undefined) {
			env[key] = value;
		}
	}
	if (extraEnv) {
		for (const [key, value] of Object.entries(extraEnv)) {
			if (value !== undefined) {
				env[key] = value;
			}
		}
	}
	return env;
}
