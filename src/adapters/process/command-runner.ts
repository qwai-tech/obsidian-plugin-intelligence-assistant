import { runtimeClock } from '@qwai/obsidian-llm';
import { spawn } from 'child_process';
import type { CommandRunner } from '@/features/tools';

const MAX_OUTPUT_CHARS = 1_000_000;
export const runCommand: CommandRunner = ({ command, args, env, cwd, shell, timeoutMs, signal }) =>
	new Promise((resolve, reject) => {
		if (signal?.aborted) { reject(signal.reason instanceof Error ? signal.reason : new Error('Operation aborted')); return; }
		// A process group lets Stop terminate a shell and its children together.
		const grouped = process.platform !== 'win32';
		const proc = spawn(command, args, { shell, cwd: cwd || process.cwd(), env, detached: grouped });
		let stdout = '';
		let stderr = '';
		let stopped: Error | undefined;
		let forceKill: ReturnType<typeof runtimeClock.schedule> | undefined;
		const kill = (force = false) => {
			try { if (grouped && proc.pid) process.kill(-proc.pid, force ? 'SIGKILL' : 'SIGTERM'); else proc.kill(force ? 'SIGKILL' : 'SIGTERM'); } catch { /* The process may already have exited. */ }
		};
		const stop = (reason: Error) => {
			stopped ??= reason;
			kill();
			forceKill ??= runtimeClock.schedule(() => kill(true), 1000);
		};
		const abort = () => stop(new Error('Command aborted'));
		const timeout = runtimeClock.schedule(() => stop(new Error(`Command timed out after ${timeoutMs} ms`)), timeoutMs);
		signal?.addEventListener('abort', abort, { once: true });
		const append = (current: string, data: Buffer): string => {
			const next = current + data.toString();
			if (next.length > MAX_OUTPUT_CHARS) stop(new Error('Command output exceeded the size limit'));
			return next.slice(0, MAX_OUTPUT_CHARS);
		};
		proc.stdout?.on('data', (data: Buffer) => { stdout = append(stdout, data); });
		proc.stderr?.on('data', (data: Buffer) => { stderr = append(stderr, data); });
		const cleanup = () => { runtimeClock.cancel(timeout); if (forceKill) runtimeClock.cancel(forceKill); signal?.removeEventListener('abort', abort); };
		proc.on('close', (exitCode) => { if (stopped) kill(true); cleanup(); if (stopped) reject(stopped); else resolve({ exitCode, stdout, stderr }); });
		proc.on('error', (error) => { cleanup(); reject(new Error(`Failed to execute command: ${error.message}`)); });
	});
