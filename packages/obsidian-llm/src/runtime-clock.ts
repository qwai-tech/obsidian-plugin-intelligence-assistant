import { clearTimeout, setTimeout } from 'node:timers';

/** Desktop/Node deadlines survive view closure and do not use a popout's timers. */
export const runtimeClock = {
	schedule: (work: () => void, ms: number) => setTimeout(work, ms),
	cancel: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
};
