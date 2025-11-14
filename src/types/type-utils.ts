/**
 * Enhanced Type Definitions
 *
 * This file provides strongly-typed interfaces for common patterns
 * to eliminate unsafe type access throughout the codebase.
 */

import type { App } from 'obsidian';
import type { PluginSettings } from '@/types/settings';

/**
 * Enhanced plugin interface with proper typing for settings access
 */
export interface PluginWithSettings {
	app: App;
	settings: PluginSettings;
	saveSettings(): Promise<void>;
	vault: App['vault'];
}

/**
 * Obsidian Vault Adapter with complete typing
 */
export interface VaultAdapter {
	read(_path: string): Promise<string>;
	write(_path: string, _data: string): Promise<void>;
	exists(_path: string): Promise<boolean>;
	list(_path: string): Promise<{
		files: string[];
		folders: string[];
	}>;
	mkdir(_path: string): Promise<void>;
	remove(_path: string): Promise<void>;
	rmdir(_path: string, _recursive: boolean): Promise<void>;
	stat(_path: string): Promise<{ type: 'file' | 'folder'; ctime: number; mtime: number; size: number } | null>;
}

/**
 * Error object with message property
 */
export interface ErrorWithMessage {
	message: string;
	name?: string;
	stack?: string;
}

/**
 * Type guard to check if an unknown error has a message property
 */
export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
	return (
		typeof error === 'object' &&
		error !== null &&
		'message' in error &&
		typeof (error as Record<string, unknown>).message === 'string'
	);
}

/**
 * Safely extract error message from unknown error type
 *
 * @param error - Unknown error value
 * @returns Error message as string
 */
export function getErrorMessage(error: unknown): string {
	if (isErrorWithMessage(error)) return error.message;
	if (typeof error === 'string') return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

/**
 * OpenAI-compatible API response format
 */
export interface OpenAICompatibleResponse {
	choices?: Array<{
		message?: {
			content?: string;
			role?: string;
		};
		delta?: {
			content?: string;
			role?: string;
		};
		finish_reason?: string;
		index?: number;
	}>;
	usage?: {
		prompt_tokens?: number;
		promptTokens?: number;
		completion_tokens?: number;
		completionTokens?: number;
		total_tokens?: number;
		totalTokens?: number;
	};
	model?: string;
	created?: number;
	id?: string;
	object?: string;
}

/**
 * Ollama-specific API response format
 */
export interface OllamaResponse {
	message?: {
		content?: string;
		role?: string;
	};
	prompt_eval_count?: number;
	eval_count?: number;
	done?: boolean;
	total_duration?: number;
	load_duration?: number;
	prompt_eval_duration?: number;
	eval_duration?: number;
}

/**
 * Workflow execution context with proper typing
 */
export interface WorkflowExecutionContext {
	log: (_message: string) => void;
	vault: VaultAdapter;
	[key: string]: unknown;
}

/**
 * Node configuration data
 */
export interface NodeConfigData {
	nodeId: string;
	config: Record<string, unknown>;
	nodeType: string;
	label?: string;
}

/**
 * Workflow node data with proper typing
 */
export interface WorkflowNodeData {
	id: string;
	type: string;
	data: Record<string, unknown>;
	position?: { x: number; y: number };
}

/**
 * Canvas node with proper typing
 */
export interface CanvasNode {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	data?: Record<string, unknown>;
}

/**
 * Canvas edge/connection
 */
export interface CanvasEdge {
	id: string;
	from: string;
	to: string;
	fromSide?: string;
	toSide?: string;
}

/**
 * JSON parse with type assertion helper
 */
export function parseJSON<T>(jsonString: string): T {
	return JSON.parse(jsonString) as T;
}

/**
 * Safe JSON parse with error handling
 */
export function safeParseJSON<T>(jsonString: string, fallback: T): T {
	try {
		return JSON.parse(jsonString) as T;
	} catch (error) {
		console.error('Failed to parse JSON:', getErrorMessage(error));
		return fallback;
	}
}

/**
 * Type guard for checking if value is a record
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard for checking if value is an array
 */
export function isArray<T>(value: unknown): value is T[] {
	return Array.isArray(value);
}

/**
 * Safely get property from unknown object
 */
export function getProperty<T>(
	obj: unknown,
	key: string,
	fallback: T
): T {
	if (isRecord(obj) && key in obj) {
		return obj[key] as T;
	}
	return fallback;
}
