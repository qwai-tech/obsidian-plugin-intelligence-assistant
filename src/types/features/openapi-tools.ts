/**
 * OpenAPI Tool Types
 * Configuration for generating HTTP tools from OpenAPI specs
 */

export type OpenApiAuthType = 'none' | 'header' | 'query';
export type OpenApiSourceType = 'file' | 'url';

export interface OpenApiToolConfig {
	id: string;
	name: string;
	enabled: boolean;
	sourceType: OpenApiSourceType;
	specPath?: string; // For local file sources
	specUrl?: string; // For remote sources
	baseUrl?: string;
	authType?: OpenApiAuthType;
	authKey?: string;
	authValue?: string;
	lastFetchedAt?: number;
}
