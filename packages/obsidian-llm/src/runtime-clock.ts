/* eslint-disable obsidianmd/prefer-window-timers -- Application-owned deadlines must run in both Node and Obsidian, independently of a view's window. */
/** Shared runtime clock, deliberately separate from any UI window lifecycle. */
export const runtimeClock = {
	schedule: (work: () => void, ms: number) => setTimeout(work, ms),
	cancel: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
};
/* eslint-enable obsidianmd/prefer-window-timers -- End of platform-independent clock. */
