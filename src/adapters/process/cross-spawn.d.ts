declare module 'cross-spawn' {
	import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'child_process';

	function spawn(command: string, args: readonly string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams;
	export default spawn;
}
