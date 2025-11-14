import { BaseLLMProvider } from './base-provider';
import { ChatRequest, ChatResponse, StreamChunk } from './types';
import type { ModelInfo, ModelCapability } from '@/types';
import { requestUrl } from 'obsidian';

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

interface SAPServiceKey {
	clientid: string;
	clientsecret: string;
	url: string;
	serviceurls?: {
		AI_API_URL: string;
	};
}

interface TokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
}

interface DeploymentInfo {
	id: string;
	modelName: string;
	modelVersion?: string;
	scenarioId?: string;     // Store scenario information
	createdAt: number;
}

export class SAPAICoreProvider extends BaseLLMProvider {
	private accessToken: string | null = null;
	private tokenExpiry: number = 0;
	private serviceKey: SAPServiceKey | null = null;
	
	// Cache for deployment IDs keyed by model name, with 5-minute TTL (matching SAP AI SDK default)
	private deploymentCache = new Map<string, { deployment: DeploymentInfo; expiry: number }>();

	constructor(config: unknown) {
		super(config);
		this.parseServiceKey();
	}

	get name(): string {
		return 'SAP AI Core';
	}

	/**
	 * Parse SAP service key from config
	 */
	private parseServiceKey() {
		if (this.config.serviceKey) {
			try {
				const parsedServiceKey = (typeof this.config.serviceKey === 'string'
					? (JSON.parse(this.config.serviceKey) as { clientid?: string; clientsecret?: string; url?: string; serviceurls?: { AI_API_URL?: string } })
					: (this.config.serviceKey as { clientid?: string; clientsecret?: string; url?: string; serviceurls?: { AI_API_URL?: string } }));

				if (parsedServiceKey && typeof parsedServiceKey.clientid === 'string' && typeof parsedServiceKey.clientsecret === 'string' && typeof parsedServiceKey.url === 'string') {
					this.serviceKey = {
						clientid: parsedServiceKey.clientid,
						clientsecret: parsedServiceKey.clientsecret,
						url: parsedServiceKey.url,
						serviceurls: (parsedServiceKey.serviceurls && typeof parsedServiceKey.serviceurls.AI_API_URL === 'string')
							? { AI_API_URL: parsedServiceKey.serviceurls.AI_API_URL }
							: undefined
					};
				} else {
					console.error('Invalid SAP service key: missing required fields (clientid, clientsecret, url)');
					this.serviceKey = null;
				}

				// Validate service key structure
				if (this.serviceKey) {
					if (!this.serviceKey.clientid || !this.serviceKey.clientsecret || !this.serviceKey.url) {
						console.error('Invalid SAP service key: missing required fields (clientid, clientsecret, url)');
						this.serviceKey = null;
					}
				}
			} catch (error) {
				console.error('Failed to parse SAP service key:', error);
				console.error('Service key must be valid JSON with fields: clientid, clientsecret, url, serviceurls');
				this.serviceKey = null;
			}
		}
	}

	/**
	 * Get OAuth2 access token using Client Credentials Flow
	 * 
	 * SAP AI Core uses OAuth2 Client Credentials flow for authentication.
	 * The token is cached and refreshed automatically when it expires.
	 */
	private async getAccessToken(): Promise<string> {
		// Return cached token if valid (with 5-minute safety margin)
		if (this.accessToken && Date.now() < this.tokenExpiry) {
			return this.accessToken;
		}

		// Extract OAuth2 credentials from service key
		const clientId = this.serviceKey?.clientid;
		const clientSecret = this.serviceKey?.clientsecret;
		const tokenUrl = this.serviceKey?.url
			? `${this.serviceKey.url}/oauth/token`
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
			console.debug('Requesting OAuth2 token from SAP AI Core...');
			const response = await requestUrl({
				url: tokenUrl,
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
				const errorText = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
				throw new Error(`OAuth2 authentication failed: ${response.status} - ${errorText}`);
			}

			const tokenData = JSON.parse(typeof response.text === 'string' ? response.text : String(response.text)) as TokenResponse;

			if (!tokenData.access_token) {
				throw new Error('Invalid token response: missing access_token');
			}

			this.accessToken = tokenData.access_token;
			// Cache token with 5-minute safety margin to avoid expiration during requests
			this.tokenExpiry = Date.now() + ((tokenData.expires_in - 300) * 1000);

			console.debug('OAuth2 token obtained successfully, expires in:', tokenData.expires_in, 'seconds');
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
	private async getAuthHeaders(): Promise<Record<string, string>> {
		const token = await this.getAccessToken();
		return {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
			'AI-Resource-Group': this.config.resourceGroup || 'default',
			'Accept': 'application/json',
		};
	}

	/**
	 * Get API version query parameter for Azure OpenAI models
	 * Returns the appropriate api-version based on the model name
	 */
	private getApiVersion(executableId?: string, modelName?: string): string | null {
		if (executableId !== 'azure-openai') {
			return null; // Only Azure OpenAI requires api-version
		}

		// o1 and o3-mini use a different API version
		if (modelName && (modelName.includes('o1') || modelName.includes('o3-mini'))) {
			return '2024-12-01-preview';
		}

		// Default API version for most Azure OpenAI models
		return '2023-05-15';
	}

	/**
	 * Resolve deployment ID from model name
	 *
	 * Implements the SAP AI SDK pattern of resolving deployment ID from model name
	 * with automatic caching for 5 minutes (the default TTL in SAP AI SDK).
	 */
	private async resolveDeploymentId(modelName: string, modelVersion?: string): Promise<string> {
		const cacheKey = modelVersion ? `${modelName}:${modelVersion}` : modelName;
		const now = Date.now();

		// Check cache first
		const cached = this.deploymentCache.get(cacheKey);
		if (cached && now < cached.expiry) {
			console.debug(`Using cached deployment ID for ${cacheKey}: ${cached.deployment.id}`);
			return cached.deployment.id;
		}

		// Fetch deployment information from SAP AI Core
		const deploymentInfo = await this.fetchDeploymentId(modelName, modelVersion);

		// Cache the deployment information
		this.deploymentCache.set(cacheKey, {
			deployment: deploymentInfo,
			expiry: now + (5 * 60 * 1000) // 5 minutes in milliseconds
		});

		console.debug(`Fetched and cached deployment info for ${cacheKey}: ${JSON.stringify(deploymentInfo)}`);
		return deploymentInfo.id;
	}

	/**
	 * Fetch deployment information from SAP AI Core based on model name and version
	 * Returns complete deployment info including the deployment URL
	 */
	private async fetchDeploymentId(modelName: string, modelVersion?: string): Promise<DeploymentInfo> {
		const headers = await this.getAuthHeaders();
		const baseUrl = this.serviceKey?.serviceurls?.AI_API_URL ||
					   this.config.baseUrl ||
					   'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com';

		// Query SAP AI Core for deployments matching the model criteria
		// Using the /v2/lm/deployments endpoint with query parameters
		const url = `${baseUrl}/v2/lm/deployments?$filter=status eq 'RUNNING'`;

		const response = await requestUrl({
			url,
			method: 'GET',
			headers,
		});

		if (response.status !== 200) {
			throw new Error(`Failed to fetch deployments for model ${modelName}: ${response.status} - ${response.text || 'Unknown error'}`);
		}

		const data = response.json as {
			resources?: unknown[];
			value?: unknown[];
		};
		let deployments = Array.isArray(data.resources) ? data.resources :
						Array.isArray(data.value) ? data.value :
						Array.isArray(data) ? data : [];

		// Filter deployments by model name (this would need to check the actual configuration)
		deployments = deployments.filter((deployment: unknown) => {
			// Type guard for deployment structure
			const hasConfig = (obj: unknown): obj is {
				configuration?: { parameters?: Record<string, unknown> };
				parameters?: Record<string, unknown>;
				name?: string;
				configurationName?: string;
			} => {
				return typeof obj === 'object' && obj !== null;
			};

			if (!hasConfig(deployment)) {
				return false;
			}

			// Check if deployment configuration matches the requested model
			const config = deployment.configuration || {};
			const parameters = config.parameters || deployment.parameters || {};

			// For different model types, check their specific parameters
			// This is a simplified check - in practice, the exact configuration structure may vary
			const modelConfig = (parameters).huggingface ||
								(parameters).azureOpenai ||
								(parameters).openai || {};

			const modelConfigTyped = modelConfig as { model?: string; modelName?: string };
			const deployedModelName = modelConfigTyped.model || modelConfigTyped.modelName ||
									  deployment.name || deployment.configurationName || '';

			return String(deployedModelName).toLowerCase().includes(modelName.toLowerCase());
		});

		if (deployments.length === 0) {
			throw new Error(`No deployment found for model: ${modelName}${modelVersion ? ` version: ${modelVersion}` : ''}`);
		}

		// If multiple deployments found with the same model name, use the first one
		// (This matches SAP AI SDK behavior which uses the first deployment if multiple exist)
		const deployment = deployments[0] as {
			id: string;
			configuration?: { scenarioId?: string };
			scenarioId?: string;
			scenario_id?: string;
		};
		const deploymentId = deployment.id;

		// Extract scenario information to determine the correct endpoint path
		const config = deployment.configuration || {};
		const scenarioId = config.scenarioId || deployment.scenarioId || deployment.scenario_id || '';

		// Return complete deployment information
		return {
			id: deploymentId,
			modelName,
			modelVersion,
			scenarioId,
			createdAt: Date.now()
		};
	}

	/** 
	 * Chat completion using SAP AI Core Inference Service
	 * 
	 * Makes a synchronous chat completion request to SAP AI Core.
	 * Supports both deployment IDs and model names (with automatic resolution).
	 * 
	 * @param request The chat request containing messages and parameters
	 * @returns The chat response with content and token usage
	 */
	async chat(request: ChatRequest): Promise<ChatResponse> {
		const headers = await this.getAuthHeaders();

		// Use SAP AI Core Inference Service endpoint
		const baseUrl = this.serviceKey?.serviceurls?.AI_API_URL ||
						this.config.baseUrl ||
						'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com';

		// Extract model name from provider-prefixed ID (sap-ai-core:gpt-4o -> gpt-4o)
		const modelId = request.model;
		const unprefixedModelName = modelId.includes(':') ? modelId.split(':')[1] : modelId;

		// Look up model info from cached models using full model ID
		const modelInfo = this.config.cachedModels?.find(m => m.id === modelId);

		let deploymentId: string;
		let executableId: string | undefined;
		let modelName: string;

		if (modelInfo && modelInfo.deploymentId) {
			// Found in cached models - use the stored deployment ID
			deploymentId = modelInfo.deploymentId;
			executableId = modelInfo.executableId;
			modelName = modelInfo.name || unprefixedModelName;
			console.debug(`Using cached model info for ${modelId}, deployment: ${deploymentId}`);
		} else {
			// Not in cache or no deployment ID - try to resolve dynamically using unprefixed name
			console.debug(`Model ${modelId} not found in cache, attempting dynamic resolution`);
			deploymentId = await this.resolveDeploymentId(unprefixedModelName);
			modelName = unprefixedModelName;
		}

		// Always construct the URL with /chat/completions endpoint
		let url = `${baseUrl}/v2/inference/deployments/${deploymentId}/chat/completions`;

		// Add api-version query parameter for Azure OpenAI models
		const apiVersion = this.getApiVersion(executableId, modelName);
		if (apiVersion) {
			url += `?api-version=${apiVersion}`;
		}

		// Prepare the request body in OpenAI-compatible format
		const body = {
			messages: request.messages.map(msg => ({ role: msg.role, content: msg.content })),
			temperature: request.temperature ?? 0.7,
			max_tokens: request.maxTokens ?? 2000,
		};

		// Log deployment ID and other details for debugging
		console.debug(`SAP AI Core endpoint: ${url}`);
		console.debug(`Resource Group being used: ${this.config.resourceGroup || 'default'}`);

		// Log the request for debugging
		console.debug(`SAP AI Core request to: ${url}, deployment: ${deploymentId}, model: ${request.model}, messages: ${request.messages.length}`);

		let response;
		try {
			response = await requestUrl({
				url,
				method: 'POST',
				headers,
				body: JSON.stringify(body),
			});
		} catch (error) {
			console.error(`SAP AI Core request failed to URL: ${url}`, error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`SAP AI Core API request failed to connect: ${errorMessage}`);
		}

		if (response.status === 404) {
			// The deployment might not exist or the endpoint format might be wrong
			throw new Error(`SAP AI Core deployment not found: ${deploymentId}. Verify the deployment ID is correct and the deployment is running.`);
		} else if (response.status !== 200) {
			const errorText = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
			throw new Error(`SAP AI Core API request failed: ${response.status} - ${errorText}`);
		}

		const data = response.json as {
			choices?: Array<{ message?: { content?: string } }>;
			usage?: {
				prompt_tokens?: number;
				promptTokens?: number;
				completion_tokens?: number;
				completionTokens?: number;
				total_tokens?: number;
				totalTokens?: number;
			};
		};

		// Extract response from SAP AI Core (should follow OpenAI-compatible format)
		const content = data.choices?.[0]?.message?.content || '';
		const usage = data.usage || {};

		console.debug(`SAP AI Core response: ${String(content).substring(0, 50)}... (truncated)`);

		return {
			content,
			usage: {
				promptTokens: usage.prompt_tokens || usage.promptTokens || 0,
				completionTokens: usage.completion_tokens || usage.completionTokens || 0,
				totalTokens: usage.total_tokens || usage.totalTokens || 0,
			},
		};
	}

	/**
	 * Streaming chat using SAP AI Core Inference Service
	 * 
	 * Supports both deployment IDs and model names (with automatic resolution).
	 */
	async streamChat(request: ChatRequest, onChunk: (_chunk: StreamChunk) => void): Promise<void> {
		const headers = await this.getAuthHeaders();

		// Use SAP AI Core Inference Service endpoint
		const baseUrl = this.serviceKey?.serviceurls?.AI_API_URL ||
						this.config.baseUrl ||
						'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com';

		// Extract model name from provider-prefixed ID (sap-ai-core:gpt-4o -> gpt-4o)
		const modelId = request.model;
		const unprefixedModelName = modelId.includes(':') ? modelId.split(':')[1] : modelId;

		// Look up model info from cached models using full model ID
		const modelInfo = this.config.cachedModels?.find(m => m.id === modelId);

		let deploymentId: string;
		let executableId: string | undefined;
		let modelName: string;

		if (modelInfo && modelInfo.deploymentId) {
			// Found in cached models - use the stored deployment ID
			deploymentId = modelInfo.deploymentId;
			executableId = modelInfo.executableId;
			modelName = modelInfo.name || unprefixedModelName;
			console.debug(`Using cached model info for ${modelId}, deployment: ${deploymentId}`);
		} else {
			// Not in cache or no deployment ID - try to resolve dynamically using unprefixed name
			console.debug(`Model ${modelId} not found in cache, attempting dynamic resolution`);
			deploymentId = await this.resolveDeploymentId(unprefixedModelName);
			modelName = unprefixedModelName;
		}

		// Always construct the URL with /chat/completions endpoint
		let url = `${baseUrl}/v2/inference/deployments/${deploymentId}/chat/completions`;

		// Add api-version query parameter for Azure OpenAI models
		const apiVersion = this.getApiVersion(executableId, modelName);
		if (apiVersion) {
			url += `?api-version=${apiVersion}`;
		}

		// For direct inference, use standard OpenAI-compatible format with streaming enabled
		const body = {
			messages: request.messages.map(msg => ({ role: msg.role, content: msg.content })),
			temperature: request.temperature ?? 0.7,
			max_tokens: request.maxTokens ?? 2000,
			stream: true,
		};

		// Log deployment ID and other details for debugging
		console.debug(`SAP AI Core streaming endpoint: ${url}`);
		console.debug(`Resource Group being used: ${this.config.resourceGroup || 'default'}`);

		console.debug(`SAP AI Core streaming started for deployment: ${deploymentId}, model: ${request.model}`);

		let response;
		try {
			response = await requestUrl({
				url,
				method: 'POST',
				headers,
				body: JSON.stringify(body),
			});
		} catch (error) {
			console.error(`SAP AI Core streaming request failed to URL: ${url}`, error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`SAP AI Core streaming API request failed to connect: ${errorMessage}`);
		}

		if (response.status === 404) {
			// The deployment might not exist or the endpoint format might be wrong
			throw new Error(`SAP AI Core deployment not found for streaming: ${deploymentId}. Verify the deployment ID is correct and the deployment is running.`);
		} else if (response.status !== 200) {
			throw new Error(`SAP AI Core streaming API request failed: ${response.status} - ${response.text || 'Unknown error'}`);
		}

		// Parse SSE stream
		const text = typeof response.text === 'string' ? response.text : String(response.text);
		const lines = text.split('\n');

		for (const line of lines) {
			if (line.trim() === '') continue;

			if (line.startsWith('data: ')) {
				const data = line.slice(6).trim();

				if (data === '[DONE]') {
					console.debug('SAP AI Core streaming completed');
					onChunk({ content: '', done: true });
					return;
				}

				try {
					const parsed = JSON.parse(data) as {
						choices?: Array<{
							delta?: { content?: string };
							finish_reason?: string;
						}>;
					};

					// Handle OpenAI-compatible SSE response format from SAP AI Core
					const content = parsed.choices?.[0]?.delta?.content;
					const finishReason = parsed.choices?.[0]?.finish_reason;

					if (content) {
						onChunk({ content, done: false });
					}

					if (finishReason) {
						console.debug(`SAP AI Core streaming finished with reason: ${finishReason}`);
						onChunk({ content: '', done: true });
						return;
					}
				} catch (e) {
					console.error('Failed to parse SSE chunk:', e, 'Data:', data);
				}
			}
		}

		console.debug('SAP AI Core streaming ended');
		onChunk({ content: '', done: true });
	}

	/**
	 * Fetch available models from SAP AI Core deployments
	 *
	 * Retrieves running deployments and their configurations to get accurate model names.
	 * The model name is extracted from the configuration's parameterBindings.
	 */
	async fetchModels(): Promise<ModelInfo[]> {
		try {
			const headers = await this.getAuthHeaders();
			const baseUrl = this.serviceKey?.serviceurls?.AI_API_URL ||
						   this.config.baseUrl ||
						   'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com';

	
			// Fetch both deployments and configurations
			const deploymentsUrl = `${baseUrl}/v2/lm/deployments?$filter=status eq 'RUNNING'`;
			const configurationsUrl = `${baseUrl}/v2/lm/configurations`;

			const [deploymentsResponse, configurationsResponse] = await Promise.all([
				requestUrl({ url: deploymentsUrl, method: 'GET', headers }),
				requestUrl({ url: configurationsUrl, method: 'GET', headers })
			]);

			if (deploymentsResponse.status !== 200) {
				console.warn(`Failed to fetch deployments (status ${deploymentsResponse.status}), using default models`);
				return this.getDefaultModels();
			}

			const deploymentsData = deploymentsResponse.json as {
				resources?: unknown[];
				value?: unknown[];
			};
			const configurationsData = configurationsResponse.status === 200 ? configurationsResponse.json as {
				resources?: unknown[];
				value?: unknown[];
			} : null;

			// Build a map of configurationId -> configuration for quick lookup
			const configMap = new Map<string, { id: string; executableId?: string; parameterBindings?: Array<{ key: string; value: string }> }>();
			if (configurationsData) {
				const configs = configurationsData.resources || configurationsData.value || [];
				for (const config of configs) {
					if (Array.isArray(config)) continue;
					const typedConfig = config as { id: string; executableId?: string; parameterBindings?: Array<{ key: string; value: string }> };
					configMap.set(typedConfig.id, typedConfig);
				}
			}

			const models: ModelInfo[] = [];

			// Handle different possible response formats
			let deployments: unknown[] = [];
			if (deploymentsData.resources) {
				deployments = deploymentsData.resources;
			} else if (Array.isArray(deploymentsData)) {
				deployments = deploymentsData;
			} else if (deploymentsData.value && Array.isArray(deploymentsData.value)) {
				deployments = deploymentsData.value;
			}

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

					const capabilities = this.inferCapabilities(scenarioId, modelName);

					// Create model info with provider-prefixed ID for global uniqueness
					models.push({
						id: `sap-ai-core:${modelName}`,    // Use provider:model format for uniqueness
						name: modelName,    // Display the actual model name
						provider: 'sap-ai-core',
						capabilities,
						enabled: true,
						deploymentId: typedDeployment.id,  // Store deployment ID separately
						scenarioId,     // Save the scenario ID
						executableId: executableId || undefined,   // Save the executable ID (e.g., 'azure-openai', 'aws-bedrock')
					});

					console.debug(`SAP AI Core: Found deployment ${typedDeployment.id} -> ${modelName}${modelVersion ? ` (v${modelVersion})` : ''} [${executableId || 'unknown'}]`);
				}
			}

			// Fallback to defaults if no running deployments
			if (models.length === 0) {
				console.warn('No running deployments found in SAP AI Core, using default models');
				return this.getDefaultModels();
			}

			console.debug(`Found ${models.length} running SAP AI Core deployments`);
			return models;
		} catch (error) {
			console.error('Failed to fetch SAP AI Core models:', error);
			console.warn('Using default SAP AI Core models as fallback');
			return this.getDefaultModels();
		}
	}

	/**
	 * Get default recommended models
	 */
	private getDefaultModels(): ModelInfo[] {
		return [
			{ id: 'sap-ai-core:gpt-4o', name: 'GPT-4o', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:gpt-4o-mini', name: 'GPT-4o Mini', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:gpt-35-turbo', name: 'GPT-3.5 Turbo', provider: 'sap-ai-core', capabilities: ['chat', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:text-embedding-3-large', name: 'Text Embedding 3 Large', provider: 'sap-ai-core', capabilities: ['embedding'], enabled: true },
		];
	}

	/**
	 * Infer model capabilities from scenario ID and model name
	 */
	private inferCapabilities(scenarioId: string, modelName: string): ModelCapability[] {
		const scenarioLower = scenarioId.toLowerCase();
		const modelLower = modelName.toLowerCase();
		const capabilities: ModelCapability[] = ['chat', 'streaming', 'json_mode'];

		// Embedding models
		if (modelLower.includes('embedding') || modelLower.includes('embed') || scenarioLower.includes('embedding')) {
			return ['embedding'];
		}

		// Check for specific model capabilities
		if (modelLower.includes('gpt-4o')) {
			capabilities.push('vision', 'audio', 'function_calling');
		} else if (modelLower.includes('gpt-4')) {
			capabilities.push('vision', 'function_calling');
		} else if (modelLower.includes('gpt-35') || modelLower.includes('gpt-3.5')) {
			capabilities.push('function_calling');
		} else if (modelLower.includes('gemini')) {
			capabilities.push('vision', 'function_calling');
		} else if (modelLower.includes('claude')) {
			capabilities.push('vision', 'function_calling');
		} else if (scenarioLower.includes('azure-openai') || scenarioLower.includes('openai')) {
			// Default Azure OpenAI models likely support function calling
			capabilities.push('function_calling');
		}

		return capabilities;
	}
}
