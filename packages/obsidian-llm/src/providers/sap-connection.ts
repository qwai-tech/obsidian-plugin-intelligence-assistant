
import { type HttpPort, getDefaultHttpPort } from '../http';

import type { ModelInfo, ModelCapability, LLMConfig } from '../types';
import { parseSAPServiceKey, type SAPServiceKey } from './sap-service-key';

/**
 * SAP AI Core Provider for Foundation Models
 *
 * Based on the SAP AI SDK foundation models documentation:
 * https://sap.github.io/ai-sdk/docs/js/foundation-models
 *
 * This provider follows SAP's recommended patterns for accessing
 * foundation models in SAP AI Core. It supports both model names (like 'gpt-4o')
 * and deployment IDs, with automatic deployment ID resolution and caching
 * similar to the official SAP AI SDK.
 *
 * Features:
 * - Support for both model names (e.g., 'gpt-4o') and deployment IDs
 * - Automatic deployment ID resolution and caching (5 min TTL like SAP AI SDK)
 * - OAuth2 authentication with SAP service keys
 * - Foundation model patterns with proper request/response handling
 */


interface TokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
}

/**
 * Full deployment information matching SAP AI Core API response
 * Based on the deployment object structure from SAP AI Core API
 */
export interface DeploymentInfo {
	id: string;
	modelName: string;
	modelVersion?: string;
	scenarioId?: string;
	createdAt: number;
	// Full API response fields
	status?: string;
	targetStatus?: string;
	lastOperation?: string;
	configurationId?: string;
	configurationName?: string;
	latestRunningConfigurationId?: string;
	deploymentUrl?: string;
	submissionTime?: string;
	startTime?: string;
	modifiedAt?: string;
	completionTime?: string;
	executableId?: string;
	// Deployment health tracking
	lastHealthCheck?: number;
	isHealthy?: boolean;
}

interface SapConfiguration {
	id: string;
	executableId?: string;
	parameterBindings?: Array<{ key: string; value: string }>;
}

function listOf(json: unknown): unknown[] {
	if (Array.isArray(json)) return json;
	const container = json as { resources?: unknown; value?: unknown } | null;
	if (Array.isArray(container?.resources)) return container.resources;
	if (Array.isArray(container?.value)) return container.value;
	return [];
}

export class SAPConnection {
	private accessToken: string | null = null;
	private tokenExpiry: number = 0;
	private readonly serviceKey: SAPServiceKey;

	// Cache for deployment IDs keyed by model name, with 5-minute TTL (matching SAP AI SDK default)
	private deploymentCache = new Map<string, { deployment: DeploymentInfo; expiry: number }>();

	private readonly http: HttpPort;
	constructor(private readonly config: LLMConfig, http?: HttpPort) {
		this.http = http ?? getDefaultHttpPort();
		this.serviceKey = parseSAPServiceKey(config.serviceKey, config.baseUrl);
	}

	get name(): string {
		return 'SAP AI Core';
	}

	/**
	 * Parse SAP service key from config
	 */
	get apiBaseUrl(): string {
		return this.serviceKey.serviceurls!.AI_API_URL;
	}

	private async fetchRunningDeployments(signal?: AbortSignal): Promise<{ deployments: unknown[]; configurations: Map<string, SapConfiguration> } | null> {
		const headers = await this.getAuthHeaders(signal);
		const [deploymentsResponse, configurationsResponse] = await Promise.all([
			this.http.request({ url: `${this.apiBaseUrl}/v2/lm/deployments?$filter=status eq 'RUNNING'`, method: 'GET', headers, signal }),
			this.http.request({ url: `${this.apiBaseUrl}/v2/lm/configurations`, method: 'GET', headers, signal }),
		]);
		if (deploymentsResponse.status !== 200) {
			throw new Error(`SAP AI Core deployment listing failed: HTTP ${deploymentsResponse.status}`);
		}
		if (!configurationsResponse.ok) throw new Error(`SAP AI Core configuration listing failed: HTTP ${configurationsResponse.status}`);
		const configurations = new Map<string, SapConfiguration>();
		if (configurationsResponse?.status === 200) {
			for (const config of listOf(configurationsResponse.json)) {
				const typed = config as SapConfiguration;
				if (typed?.id) {
					configurations.set(typed.id, typed);
				}
			}
		}
		return { deployments: listOf(deploymentsResponse.json), configurations };
	}

	/**
	 * Get OAuth2 access token using Client Credentials Flow
	 *
	 * SAP AI Core uses OAuth2 Client Credentials flow for authentication.
	 * The token is cached and refreshed automatically when it expires.
	 */
	private async getAccessToken(signal?: AbortSignal): Promise<string> {
		// Return cached token if valid (with 5-minute safety margin)
		if (this.accessToken && Date.now() < this.tokenExpiry) {
			return this.accessToken;
		}

		// Extract OAuth2 credentials from service key
		const clientId = this.serviceKey?.clientid;
		const clientSecret = this.serviceKey?.clientsecret;
		const tokenUrl = this.serviceKey?.url
			? `${this.serviceKey.url.replace(/\/oauth\/token$/, '')}/oauth/token`
			: undefined;

		// Validate that we have all required OAuth2 credentials from service key
		if (!clientId || !clientSecret || !tokenUrl) {
			const missingFields = [];
			if (!clientId) missingFields.push('clientid');
			if (!clientSecret) missingFields.push('clientsecret');
			if (!tokenUrl) missingFields.push('url');

			throw new Error(
				`SAP AI Core service key is incomplete or invalid. Missing fields: ${missingFields.join(', ')}. ` +
				`Please provide a complete service key JSON.`
			);
		}

		try {
			const response = await this.http.request({
				url: tokenUrl,
				signal,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json',
				},
				body: new URLSearchParams({
					grant_type: 'client_credentials',
					client_id: clientId,
					client_secret: clientSecret,
				}).toString(),
			});

			if (response.status !== 200) {
				throw new Error(`OAuth2 authentication failed: HTTP ${response.status}`);
			}

			const tokenData = response.json as TokenResponse;

			if (!tokenData || typeof tokenData.access_token !== 'string' || !tokenData.access_token || !Number.isFinite(tokenData.expires_in) || tokenData.expires_in <= 0) {
				throw new Error('Invalid token response: missing access_token');
			}

			this.accessToken = tokenData.access_token;
			// Cache token with 5-minute safety margin to avoid expiration during requests
			this.tokenExpiry = Date.now() + (Math.max(0, tokenData.expires_in - Math.min(300, tokenData.expires_in * 0.1)) * 1000);
			return this.accessToken;
		} catch (error) {
			console.error('SAP AI Core OAuth2 authentication failed:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(
				`SAP AI Core authentication failed: ${errorMessage}. ` +
				`Please verify your OAuth2 credentials (Client ID, Client Secret, Token URL).`
			);
		}
	}

	/**
	 * Get API headers with authentication (async version for SAP AI Core)
	 *
	 * Sets the required headers for SAP AI Core API calls including:
	 * - Authorization header with Bearer token
	 * - Content-Type for JSON requests
	 * - AI-Resource-Group for deployment isolation
	 */
	async getAuthHeaders(signal?: AbortSignal): Promise<Record<string, string>> {
		const token = await this.getAccessToken(signal);
		return {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
			'AI-Resource-Group': this.config.resourceGroup || 'default',
			'Accept': 'application/json',
		};
	}

	async resolveDeploymentId(modelName: string, modelVersion?: string, signal?: AbortSignal): Promise<string> {
		const cacheKey = modelVersion ? `${modelName}:${modelVersion}` : modelName;
		const now = Date.now();

		// Check cache first and validate deployment health
		const cached = this.deploymentCache.get(cacheKey);
		if (cached && now < cached.expiry) {
			// If cached deployment is more than 1 minute old, verify it's still healthy
			if (cached.deployment.lastHealthCheck && (now - cached.deployment.lastHealthCheck) > 60000) {
				const isHealthy = await this.checkDeploymentHealth(cached.deployment.id, signal);
				if (!isHealthy) {
					console.warn(`Cached deployment ${cached.deployment.id} is no longer healthy, fetching new deployment`);
					this.deploymentCache.delete(cacheKey);
					// Fall through to fetch new deployment
				} else {
					return cached.deployment.id;
				}
			} else {
				return cached.deployment.id;
			}
		}

		// Fetch deployment information from SAP AI Core
		const deploymentInfo = await this.fetchDeploymentId(modelName, modelVersion, signal);

		// Cache the complete deployment information with all metadata
		this.deploymentCache.set(cacheKey, {
			deployment: deploymentInfo,
			expiry: now + (5 * 60 * 1000) // 5 minutes in milliseconds
		});
		return deploymentInfo.id;
	}

	/**
	 * Fetch deployment information from SAP AI Core based on model name and version
	 * Returns complete deployment info including the deployment URL and all metadata
	 */
	private async fetchDeploymentId(modelName: string, modelVersion?: string, signal?: AbortSignal): Promise<DeploymentInfo> {
		const running = await this.fetchRunningDeployments(signal);
		if (!running) {
			throw new Error(`Failed to fetch deployments for model ${modelName}`);
		}
		const configMap = running.configurations;
		let deployments = running.deployments;

		// Filter deployments by model name
		deployments = deployments.filter((deployment: unknown) => {
			// Type guard for deployment structure matching the API example
			const hasConfig = (obj: unknown): obj is {
				details?: {
					resources?: {
						backendDetails?: { model?: { name?: string; version?: string } };
						backend_details?: { model?: { name?: string; version?: string } };
					};
				};
				configurationName?: string;
				name?: string;
			} => {
				return typeof obj === 'object' && obj !== null;
			};

			if (!hasConfig(deployment)) {
				return false;
			}

			// Extract model name from details.resources.backendDetails.model.name (preferred)
			const backendModel = deployment.details?.resources?.backendDetails?.model?.name ||
								deployment.details?.resources?.backend_details?.model?.name;

			// Also check configurationName as fallback
			const config = configMap.get((deployment as { configurationId?: string }).configurationId ?? '');
			const boundModel = config?.parameterBindings?.find(binding => binding.key === 'modelName')?.value;
			const deployedModelName = boundModel || backendModel || deployment.configurationName || deployment.name || '';
			const version = config?.parameterBindings?.find(binding => binding.key === 'modelVersion')?.value;

			return (String(deployedModelName).toLowerCase() === modelName.toLowerCase() || (deployment as { id?: string }).id === modelName) && (!modelVersion || version === modelVersion);
		});

		if (deployments.length === 0) {
			throw new Error(`No deployment found for model: ${modelName}${modelVersion ? ` version: ${modelVersion}` : ''}`);
		}

		// If multiple deployments found with the same model name, use the first one
		// (This matches SAP AI SDK behavior which uses the first deployment if multiple exist)
		const deployment = deployments[0] as {
			id: string;
			status?: string;
			targetStatus?: string;
			lastOperation?: string;
			scenarioId?: string;
			configurationId?: string;
			configurationName?: string;
			latestRunningConfigurationId?: string;
			deploymentUrl?: string;
			createdAt?: string;
			modifiedAt?: string;
			submissionTime?: string;
			startTime?: string;
			completionTime?: string;
			details?: {
				resources?: {
					backendDetails?: { model?: { name?: string; version?: string } };
					backend_details?: { model?: { name?: string; version?: string } };
				};
			};
		};

		// Extract model information from the deployment details
		const backendModel = deployment.details?.resources?.backendDetails?.model ||
							deployment.details?.resources?.backend_details?.model;

		// Get executableId from configuration
		const configId = deployment.configurationId || deployment.latestRunningConfigurationId;
		const executableId = configId && configMap.has(configId)
			? configMap.get(configId)!.executableId
			: undefined;

		// Return complete deployment information with all metadata
		return {
			id: deployment.id,
			modelName: configId ? configMap.get(configId)?.parameterBindings?.find(binding => binding.key === 'modelName')?.value || backendModel?.name || modelName : backendModel?.name || modelName,
			modelVersion: backendModel?.version || modelVersion,
			scenarioId: deployment.scenarioId,
			createdAt: Date.now(),
			status: deployment.status,
			targetStatus: deployment.targetStatus,
			lastOperation: deployment.lastOperation,
			configurationId: deployment.configurationId,
			configurationName: deployment.configurationName,
			latestRunningConfigurationId: deployment.latestRunningConfigurationId,
			deploymentUrl: deployment.deploymentUrl,
			submissionTime: deployment.submissionTime,
			startTime: deployment.startTime,
			modifiedAt: deployment.modifiedAt,
			completionTime: deployment.completionTime,
			executableId,
			lastHealthCheck: Date.now(),
			isHealthy: deployment.status === 'RUNNING'
		};
	}

	/**
	 * Get detailed information for a specific deployment by ID
	 *
	 * @param deploymentId The deployment ID to fetch details for
	 * @returns Complete deployment information including status and metadata
	 */
	async getDeploymentDetails(deploymentId: string, signal?: AbortSignal): Promise<DeploymentInfo | null> {
		try {
			const headers = await this.getAuthHeaders(signal);
			const baseUrl = this.apiBaseUrl;

			const url = `${baseUrl}/v2/lm/deployments/${deploymentId}`;

			const response = await this.http.request({
				url,
				method: 'GET',
				signal,
				headers,
			});

			if (response.status !== 200) {
				console.warn(`Failed to fetch deployment details for ${deploymentId}: ${response.status}`);
				return null;
			}

			const deployment = response.json as {
				id: string;
				status?: string;
				targetStatus?: string;
				lastOperation?: string;
				scenarioId?: string;
				configurationId?: string;
				configurationName?: string;
				latestRunningConfigurationId?: string;
				deploymentUrl?: string;
				createdAt?: string;
				modifiedAt?: string;
				submissionTime?: string;
				startTime?: string;
				completionTime?: string;
				details?: {
					resources?: {
						backendDetails?: { model?: { name?: string; version?: string } };
						backend_details?: { model?: { name?: string; version?: string } };
					};
				};
			};

			const backendModel = deployment.details?.resources?.backendDetails?.model ||
								deployment.details?.resources?.backend_details?.model;

			return {
				id: deployment.id,
				modelName: backendModel?.name || deployment.configurationName || '',
				modelVersion: backendModel?.version,
				scenarioId: deployment.scenarioId,
				createdAt: Date.now(),
				status: deployment.status,
				targetStatus: deployment.targetStatus,
				lastOperation: deployment.lastOperation,
				configurationId: deployment.configurationId,
				configurationName: deployment.configurationName,
				latestRunningConfigurationId: deployment.latestRunningConfigurationId,
				deploymentUrl: deployment.deploymentUrl,
				submissionTime: deployment.submissionTime,
				startTime: deployment.startTime,
				modifiedAt: deployment.modifiedAt,
				completionTime: deployment.completionTime,
				lastHealthCheck: Date.now(),
				isHealthy: deployment.status === 'RUNNING'
			};
		} catch (error) {
			console.error(`Error fetching deployment details for ${deploymentId}:`, error);
			return null;
		}
	}

	/**
	 * Check deployment health and update cache
	 *
	 * @param deploymentId The deployment ID to check
	 * @returns True if deployment is healthy and running
	 */
	async checkDeploymentHealth(deploymentId: string, signal?: AbortSignal): Promise<boolean> {
		const deploymentInfo = await this.getDeploymentDetails(deploymentId, signal);

		if (!deploymentInfo) {
			return false;
		}

		// Update cache with health check results
		const cacheKey = deploymentInfo.modelName + (deploymentInfo.modelVersion ? `:${deploymentInfo.modelVersion}` : '');
		const cached = this.deploymentCache.get(cacheKey);
		if (cached) {
			cached.deployment.lastHealthCheck = Date.now();
			cached.deployment.isHealthy = deploymentInfo.status === 'RUNNING';
			cached.deployment.status = deploymentInfo.status;
		}

		return deploymentInfo.status === 'RUNNING';
	}

	/**
	 * List all deployments with optional filtering
	 *
	 * @param statusFilter Optional status filter (e.g., 'RUNNING', 'STOPPED')
	 * @returns Array of deployment information
	 */
	async listDeployments(statusFilter?: string, signal?: AbortSignal): Promise<DeploymentInfo[]> {
		try {
			const headers = await this.getAuthHeaders(signal);
			const baseUrl = this.apiBaseUrl;

			// Build URL with optional status filter
			let url = `${baseUrl}/v2/lm/deployments`;
			if (statusFilter) {
				url += `?$filter=status eq '${statusFilter}'`;
			}

			const response = await this.http.request({
				url,
				method: 'GET',
				signal,
				headers,
			});

			if (response.status !== 200) {
				console.warn(`Failed to list deployments: ${response.status}`);
				return [];
			}

			const data = response.json as {
				resources?: unknown[];
				value?: unknown[];
			};

			const deployments = Array.isArray(data.resources) ? data.resources :
							   Array.isArray(data.value) ? data.value :
							   Array.isArray(data) ? data : [];

			const deploymentInfos: DeploymentInfo[] = [];

			for (const deployment of deployments) {
				const typedDeployment = deployment as {
					id: string;
					status?: string;
					targetStatus?: string;
					lastOperation?: string;
					scenarioId?: string;
					configurationId?: string;
					configurationName?: string;
					latestRunningConfigurationId?: string;
					deploymentUrl?: string;
					createdAt?: string;
					modifiedAt?: string;
					submissionTime?: string;
					startTime?: string;
					completionTime?: string;
					details?: {
						resources?: {
							backendDetails?: { model?: { name?: string; version?: string } };
							backend_details?: { model?: { name?: string; version?: string } };
						};
					};
				};

				const backendModel = typedDeployment.details?.resources?.backendDetails?.model ||
									typedDeployment.details?.resources?.backend_details?.model;

				deploymentInfos.push({
					id: typedDeployment.id,
					modelName: backendModel?.name || typedDeployment.configurationName || '',
					modelVersion: backendModel?.version,
					scenarioId: typedDeployment.scenarioId,
					createdAt: Date.now(),
					status: typedDeployment.status,
					targetStatus: typedDeployment.targetStatus,
					lastOperation: typedDeployment.lastOperation,
					configurationId: typedDeployment.configurationId,
					configurationName: typedDeployment.configurationName,
					latestRunningConfigurationId: typedDeployment.latestRunningConfigurationId,
					deploymentUrl: typedDeployment.deploymentUrl,
					submissionTime: typedDeployment.submissionTime,
					startTime: typedDeployment.startTime,
					modifiedAt: typedDeployment.modifiedAt,
					completionTime: typedDeployment.completionTime,
					lastHealthCheck: Date.now(),
					isHealthy: typedDeployment.status === 'RUNNING'
				});
			}
			return deploymentInfos;
		} catch (error) {
			console.error('Error listing deployments:', error);
			throw error;
		}
	}

	private isReasoning(modelName?: string): boolean {
		if (!modelName) return false;
		// GPT-5 family
		if (modelName.includes('gpt-5')) return true;
		// o-series reasoning models (o1, o3, o4)
		if (/^o[134]/.test(modelName)) return true;
		return false;
	}

	async fetchModels(signal?: AbortSignal): Promise<ModelInfo[]> {
		try {
			const running = await this.fetchRunningDeployments(signal);
			if (!running) {
				throw new Error('Failed to fetch SAP AI Core deployments.');
			}
			const configMap = running.configurations;
			const deployments = running.deployments;
			const models: ModelInfo[] = [];

			for (const deployment of deployments) {
				// Type guard for deployment structure
				const typedDeployment: {
					status?: string;
					deploymentStatus?: string;
					state?: string;
					id: string;
					configurationId?: string;
					configuration?: { id?: string };
					details?: {
						resources?: {
							backendDetails?: { model?: { name?: string; version?: string } };
							backend_details?: { model?: { name?: string; version?: string } };
						};
					};
					configurationName?: string;
					name?: string;
					scenarioId?: string;
					scenario_id?: string;
					deploymentUrl?: string;
					targetStatus?: string;
					createdAt?: string;
					modifiedAt?: string;
					submissionTime?: string;
					startTime?: string;
					completionTime?: string;
				} = deployment as {
					status?: string;
					deploymentStatus?: string;
					state?: string;
					id: string;
					configurationId?: string;
					configuration?: { id?: string };
					details?: {
						resources?: {
							backendDetails?: { model?: { name?: string; version?: string } };
							backend_details?: { model?: { name?: string; version?: string } };
						};
					};
					configurationName?: string;
					name?: string;
					scenarioId?: string;
					scenario_id?: string;
					deploymentUrl?: string;
					targetStatus?: string;
					createdAt?: string;
					modifiedAt?: string;
					submissionTime?: string;
					startTime?: string;
					completionTime?: string;
				};

				// Check if deployment is running
				const isRunning = typedDeployment.status === 'RUNNING' ||
							   typedDeployment.deploymentStatus === 'RUNNING' ||
							   typedDeployment.state === 'RUNNING';

				if (isRunning) {
					// Get the actual model name from multiple sources (priority order):
					let modelName: string | null = null;
					let modelVersion: string | null = null;
					let executableId: string | null = null;

					// 1. Try to get from configuration's parameterBindings (most accurate)
					const configId = typedDeployment.configurationId || typedDeployment.configuration?.id;
					if (configId && configMap.has(configId)) {
						const config: { id: string; executableId?: string; parameterBindings?: Array<{ key: string; value: string }> } = configMap.get(configId)!;
						// Extract executableId from configuration
						executableId = config.executableId || null;

						if (config.parameterBindings && Array.isArray(config.parameterBindings)) {
							for (const binding of config.parameterBindings) {
								if (binding.key === 'modelName') {
									modelName = binding.value;
								} else if (binding.key === 'modelVersion') {
									modelVersion = binding.value;
								}
							}
						}
					}

					// 2. Try from deployment's details.resources.backendDetails.model.name
					if (!modelName && typedDeployment.details?.resources?.backendDetails?.model?.name) {
						modelName = typedDeployment.details.resources.backendDetails.model.name;
						modelVersion = typedDeployment.details.resources.backendDetails.model.version || null;
					}

					// 3. Fallback to deployment.details.resources.backend_details (alternative format)
					if (!modelName && typedDeployment.details?.resources?.backend_details?.model?.name) {
						modelName = typedDeployment.details.resources.backend_details.model.name;
						modelVersion = typedDeployment.details.resources.backend_details.model.version || null;
					}

					// 4. Fallback to configurationName
					if (!modelName) {
						modelName = typedDeployment.configurationName || typedDeployment.name || `Deployment ${typedDeployment.id}`;
					}

					// Extract scenario to determine capabilities
					const scenarioId = typedDeployment.scenarioId || typedDeployment.scenario_id || '';

					const capabilities = this.inferCapabilities(scenarioId, modelName, executableId || undefined);
					if (capabilities.length === 0) continue;

					// Create model info with provider-prefixed ID for global uniqueness
					models.push({
						id: `sap-ai-core:${modelName}`,    // Use provider:model format for uniqueness
						name: modelName,    // Display the actual model name
						provider: 'sap-ai-core',
						modelVersion: modelVersion || undefined,
						capabilities,
						enabled: true,
						deploymentId: typedDeployment.id,  // Store deployment ID separately
						deploymentUrl: typedDeployment.deploymentUrl,  // Full deployment URL
						configurationId: typedDeployment.configurationId || typedDeployment.configuration?.id,  // Configuration ID
						configurationName: typedDeployment.configurationName,  // Configuration name
						scenarioId,     // Save the scenario ID
						executableId: executableId || undefined,   // Save the executable ID (e.g., 'azure-openai', 'aws-bedrock')
						status: typedDeployment.status,  // Deployment status (e.g., 'RUNNING')
						targetStatus: typedDeployment.targetStatus,  // Target status
						createdAt: typedDeployment.createdAt,  // Creation timestamp
						modifiedAt: typedDeployment.modifiedAt,  // Last modification timestamp
						submissionTime: typedDeployment.submissionTime,  // Submission timestamp
						startTime: typedDeployment.startTime,  // Start timestamp
						completionTime: typedDeployment.completionTime,  // Completion timestamp (if completed)
					});
				}
			}

			return models.filter((model, index) => models.findIndex(other => other.id === model.id) === index);
		} catch (error) {
			console.error('Failed to fetch SAP AI Core models:', error);
			throw error;
		}
	}

	/**
	 * Infer model capabilities from scenario ID and model name
	 *
	 * SAP AI Core Remote Models:
	 *   Azure OpenAI: gpt-5/5-mini/5-nano, gpt-4.1/4.1-mini/4.1-nano, gpt-4o/4o-mini,
	 *                 gpt-4, gpt-35-turbo, o4-mini, o3, o3-mini, o1, o1-mini
	 *   AWS Bedrock:  Claude 4 Sonnet/Opus, Claude 4.5 Haiku/Opus, Nova Premier
	 *   GCP Vertex:   Gemini 2.0 Flash/Flash Lite, Gemini 2.5 Flash/Flash Lite
	 */
	private inferCapabilities(scenarioId: string, modelName: string, executableId?: string): ModelCapability[] {
		const scenarioLower = scenarioId.toLowerCase();
		const modelLower = modelName.toLowerCase();

		// Embedding models
		if (modelLower.includes('embedding') || modelLower.includes('embed') || scenarioLower.includes('embedding')) {
			return executableId === 'azure-openai' ? ['embedding'] : [];
		}

		const capabilities: ModelCapability[] = executableId === 'aws-bedrock' ? ['chat'] : ['chat', 'streaming'];

		// Reasoning models (o-series, gpt-5)
		if (this.isReasoning(modelName)) {
			capabilities.push('reasoning', 'function_calling');
			// GPT-5 family supports vision
			if (modelLower.includes('gpt-5')) {
				capabilities.push('vision', 'json_mode');
			}
			return capabilities;
		}

		// Add json_mode for non-reasoning chat models
		if (executableId !== 'aws-bedrock') capabilities.push('json_mode');

		// GPT-4.1 family — vision + function calling
		if (modelLower.includes('gpt-4.1')) {
			capabilities.push('vision', 'function_calling');
		}
		// GPT-4o — vision + audio + function calling
		else if (modelLower.includes('gpt-4o')) {
			capabilities.push('vision', 'audio', 'function_calling');
		}
		// GPT-4 (non-4o, non-4.1) — vision + function calling
		else if (modelLower.includes('gpt-4')) {
			capabilities.push('vision', 'function_calling');
		}
		// GPT-3.5 — function calling only
		else if (modelLower.includes('gpt-35') || modelLower.includes('gpt-3.5')) {
			capabilities.push('function_calling');
		}
		// Gemini models — vision + function calling
		else if (modelLower.includes('gemini')) {
			capabilities.push('vision', 'function_calling');
		}
		// Claude models — vision + function calling
		else if (modelLower.includes('claude')) {
			capabilities.push('vision', 'function_calling');
		}
		// Nova Premier — vision + function calling
		else if (modelLower.includes('nova')) {
			capabilities.push('vision', 'function_calling');
		}
		// Fallback for other Azure OpenAI models
		else if (scenarioLower.includes('azure-openai') || scenarioLower.includes('openai')) {
			capabilities.push('function_calling');
		}

		return capabilities;
	}
	async resolve(modelId: string, signal?: AbortSignal): Promise<DeploymentInfo> {
		const name = modelId.includes(':') ? modelId.slice(modelId.indexOf(':') + 1) : modelId;
		await this.resolveDeploymentId(name, undefined, signal);
		const deployment = this.deploymentCache.get(name)?.deployment;
		if (!deployment) throw new Error('SAP deployment could not be resolved');
		return { ...deployment };
	}
}
