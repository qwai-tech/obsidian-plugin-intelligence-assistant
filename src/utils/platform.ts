/**
 * Returns true only on macOS (darwin).
 * CLI agent features rely on macOS login-shell PATH resolution
 * and are not supported on other platforms.
 */
export function isCliAgentSupported(): boolean {
	return process.platform === 'darwin';
}
