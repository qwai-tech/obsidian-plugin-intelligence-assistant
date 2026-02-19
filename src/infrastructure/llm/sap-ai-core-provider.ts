import { BaseLLMProvider } from './base-provider';
import { ChatRequest, ChatResponse, StreamChunk } from './types';
import type { ModelInfo, ModelCapability, LLMConfig } from '@/types';
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

/**
 * Full deployment information matching SAP AI Core API response
 * Based on the deployment object structure from SAP AI Core API
 */
interface DeploymentInfo {
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

export class SAPAICoreProvider extends BaseLLMProvider {
	private accessToken: string | null = null;
	private tokenExpiry: number = 0;
	private serviceKey: SAPServiceKey | null = null;
	
	// Cache for deployment IDs keyed by model name, with 5-minute TTL (matching SAP AI SDK default)
	private deploymentCache = new Map<string, { deployment: DeploymentInfo; expiry: number }>();

	constructor(config: unknown) {
		super(config as LLMConfig);
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
	 *
	 * SAP AI Core Remote Models (azure-openai executableId):
	 *   gpt-5, gpt-5-mini, gpt-5-nano, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano,
	 *   gpt-4o, gpt-4o-mini, gpt-4, gpt-35-turbo,
	 *   o4-mini, o3, o3-mini, o1, o1-mini
	 */
	private getApiVersion(executableId?: string, modelName?: string): string | null {
		// Azure OpenAI requires an api-version query param; infer when executableId is missing
		const looksLikeAzure = executableId === 'azure-openai' || (modelName
			? /^(gpt-|o[134]-|o[134]$)/.test(modelName)
			: false);
		if (!looksLikeAzure) {
			return null;
		}

		// GPT-5 family and GPT-4.1 family use the latest preview API version
		if (modelName && (modelName.includes('gpt-5') || modelName.includes('gpt-4.1'))) {
			return '2025-04-01-preview';
		}

		// o-series reasoning models (o1, o3, o4) use newer API versions
		if (modelName && /^o[134]/.test(modelName)) {
			return '2025-04-01-preview';
		}

		// GPT-4o uses a stable modern version
		if (modelName && modelName.includes('gpt-4o')) {
			return '2024-10-21';
		}

		// Default API version for older Azure OpenAI models (gpt-4, gpt-35-turbo)
		return '2024-06-01';
	}

	/**
	 * Determine if a model is a "reasoning" model that:
	 *   - uses max_completion_tokens instead of max_tokens
	 *   - does NOT support temperature, top_p, penalties, n>1, logprobs, logit_bias
	 *
	 * Reasoning models (Azure OpenAI via SAP AI Core):
	 *   gpt-5, gpt-5-mini, gpt-5-nano, o4-mini, o3, o3-mini, o1, o1-mini
	 *
	 * Non-reasoning newer models that still use max_completion_tokens:
	 *   gpt-4.1, gpt-4.1-mini, gpt-4.1-nano  (support temperature but use max_completion_tokens)
	 */
	private isReasoning(modelName?: string): boolean {
		if (!modelName) return false;
		// GPT-5 family
		if (modelName.includes('gpt-5')) return true;
		// o-series reasoning models (o1, o3, o4)
		if (/^o[134]/.test(modelName)) return true;
		return false;
	}

	private shouldUseMaxCompletionTokens(modelName?: string): boolean {
		if (!modelName) return false;
		// Reasoning models always use max_completion_tokens
		if (this.isReasoning(modelName)) return true;
		// GPT-4.1 family also uses max_completion_tokens but supports temperature
		if (modelName.includes('gpt-4.1')) return true;
		return false;
	}

	// ─── Request Body Builders (shared between chat/stream) ──────────

	/**
	 * Build Anthropic Claude request body for Bedrock /invoke or /invoke-with-response-stream
	 * Supports: system, messages, tools, metadata, stop_sequences, temperature, top_p, top_k
	 */
	private buildClaudeRequestBody(request: ChatRequest): Record<string, unknown> {
		const claudeMessages = request.messages.filter(msg => msg.role !== 'system');
		const systemMsg = request.messages.find(msg => msg.role === 'system');

		const body: Record<string, unknown> = {
			anthropic_version: 'bedrock-2023-05-31',
			max_tokens: request.maxTokens ?? 2000,
			messages: claudeMessages.map(msg => ({
				role: msg.role,
				content: msg.content
			})),
		};

		// System prompt
		if (systemMsg) body.system = systemMsg.content;

		// Sampling parameters
		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		} else {
			body.temperature = 0.7;
		}
		if (request.topP !== undefined) body.top_p = request.topP;
		if (request.topK !== undefined) body.top_k = request.topK;
		if (request.stopSequences !== undefined) body.stop_sequences = request.stopSequences;

		// Tools (function calling) — convert OpenAI format to Anthropic format
		if (request.tools?.length) {
			body.tools = request.tools.map(t => ({
				name: t.function.name,
				description: t.function.description,
				input_schema: t.function.parameters ?? { type: 'object', properties: {} },
			}));
		}
		if (request.toolChoice !== undefined) {
			if (request.toolChoice === 'auto') body.tool_choice = { type: 'auto' };
			else if (request.toolChoice === 'none') body.tool_choice = { type: 'none' };
			else if (request.toolChoice === 'required') body.tool_choice = { type: 'any' };
			else if (typeof request.toolChoice === 'object') {
				body.tool_choice = { type: 'tool', name: request.toolChoice.function.name };
			}
		}

		// Metadata
		if (request.user !== undefined) {
			body.metadata = { user_id: request.user };
		}

		return body;
	}

	/**
	 * Build Bedrock Converse request body for /converse or /invoke-with-response-stream
	 * Used for Nova Premier and other Bedrock models
	 * Supports: system, messages, tools, inferenceConfig
	 */
	private buildConverseRequestBody(request: ChatRequest): Record<string, unknown> {
		const converseMessages = request.messages.filter(msg => msg.role !== 'system');
		const sysMsg = request.messages.find(msg => msg.role === 'system');

		const inferenceConfig: Record<string, unknown> = {
			maxTokens: request.maxTokens ?? 2000,
			temperature: request.temperature ?? 0.7,
			stopSequences: request.stopSequences ?? [],
		};
		if (request.topP !== undefined) inferenceConfig.topP = request.topP;

		const body: Record<string, unknown> = {
			inferenceConfig,
			messages: converseMessages.map(msg => ({
				role: msg.role,
				content: [{ text: msg.content }]
			})),
		};

		// System prompt
		if (sysMsg) body.system = [{ text: sysMsg.content }];

		// Tools (function calling) — convert OpenAI format to Converse toolConfig
		if (request.tools?.length) {
			body.toolConfig = {
				tools: request.tools.map(t => ({
					toolSpec: {
						name: t.function.name,
						description: t.function.description,
						inputSchema: {
							json: t.function.parameters ?? { type: 'object', properties: {} },
						},
					},
				})),
			};
		}

		return body;
	}

	/**
	 * Build Gemini request body for /generateContent or /streamGenerateContent
	 * Supports: system_instruction, contents, tools, generationConfig, responseFormat
	 */
	private buildGeminiRequestBody(request: ChatRequest): Record<string, unknown> {
		// Convert chat messages to Gemini contents format
		// System messages go into system_instruction, others into contents
		const geminiContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
		let systemInstruction: { parts: Array<{ text: string }> } | undefined;

		for (const msg of request.messages) {
			if (msg.role === 'system') {
				systemInstruction = { parts: [{ text: msg.content }] };
			} else {
				const role = msg.role === 'assistant' ? 'model' : 'user';
				geminiContents.push({
					role,
					parts: [{ text: msg.content }]
				});
			}
		}

		// Generation config
		const generationConfig: Record<string, unknown> = {
			maxOutputTokens: request.maxTokens ?? 2000,
			temperature: request.temperature ?? 0.7,
		};
		if (request.topP !== undefined) generationConfig.topP = request.topP;
		if (request.topK !== undefined) generationConfig.topK = request.topK;
		if (request.stopSequences !== undefined) generationConfig.stopSequences = request.stopSequences;

		// Response MIME type for JSON mode
		if (request.responseFormat?.type === 'json_object') {
			generationConfig.responseMimeType = 'application/json';
		} else if (request.responseFormat?.type === 'json_schema' && request.responseFormat.json_schema) {
			generationConfig.responseMimeType = 'application/json';
			generationConfig.responseSchema = request.responseFormat.json_schema.schema;
		}

		const body: Record<string, unknown> = {
			generationConfig,
			contents: geminiContents,
		};

		// System instruction
		if (systemInstruction) body.system_instruction = systemInstruction;

		// Tools (function calling) — convert OpenAI format to Gemini format
		if (request.tools?.length) {
			body.tools = [{
				functionDeclarations: request.tools.map(t => ({
					name: t.function.name,
					description: t.function.description,
					parameters: t.function.parameters,
				})),
			}];
		}
		if (request.toolChoice !== undefined) {
			if (request.toolChoice === 'auto') {
				body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
			} else if (request.toolChoice === 'none') {
				body.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
			} else if (request.toolChoice === 'required') {
				body.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
			} else if (typeof request.toolChoice === 'object') {
				body.toolConfig = {
					functionCallingConfig: {
						mode: 'ANY',
						allowedFunctionNames: [request.toolChoice.function.name],
					},
				};
			}
		}

		return body;
	}

	/**
	 * Resolve deployment ID from model name
	 *
	 * Implements the SAP AI SDK pattern of resolving deployment ID from model name
	 * with automatic caching for 5 minutes (the default TTL in SAP AI SDK).
	 * Now includes full deployment metadata in the cache.
	 */
	private async resolveDeploymentId(modelName: string, modelVersion?: string): Promise<string> {
		const cacheKey = modelVersion ? `${modelName}:${modelVersion}` : modelName;
		const now = Date.now();

		// Check cache first and validate deployment health
		const cached = this.deploymentCache.get(cacheKey);
		if (cached && now < cached.expiry) {
			// If cached deployment is more than 1 minute old, verify it's still healthy
			if (cached.deployment.lastHealthCheck && (now - cached.deployment.lastHealthCheck) > 60000) {
				console.debug(`Health check triggered for cached deployment ${cacheKey}`);
				const isHealthy = await this.checkDeploymentHealth(cached.deployment.id);
				if (!isHealthy) {
					console.warn(`Cached deployment ${cached.deployment.id} is no longer healthy, fetching new deployment`);
					this.deploymentCache.delete(cacheKey);
					// Fall through to fetch new deployment
				} else {
					console.debug(`Using cached deployment ID for ${cacheKey}: ${cached.deployment.id}`);
					return cached.deployment.id;
				}
			} else {
				console.debug(`Using cached deployment ID for ${cacheKey}: ${cached.deployment.id}`);
				return cached.deployment.id;
			}
		}

		// Fetch deployment information from SAP AI Core
		const deploymentInfo = await this.fetchDeploymentId(modelName, modelVersion);

		// Cache the complete deployment information with all metadata
		this.deploymentCache.set(cacheKey, {
			deployment: deploymentInfo,
			expiry: now + (5 * 60 * 1000) // 5 minutes in milliseconds
		});

		console.debug(`Fetched and cached deployment info for ${cacheKey}:`, {
			id: deploymentInfo.id,
			status: deploymentInfo.status,
			configurationName: deploymentInfo.configurationName,
			deploymentUrl: deploymentInfo.deploymentUrl
		});
		return deploymentInfo.id;
	}

	/**
	 * Fetch deployment information from SAP AI Core based on model name and version
	 * Returns complete deployment info including the deployment URL and all metadata
	 */
	private async fetchDeploymentId(modelName: string, modelVersion?: string): Promise<DeploymentInfo> {
		const headers = await this.getAuthHeaders();
		const baseUrl = this.serviceKey?.serviceurls?.AI_API_URL ||
					   this.config.baseUrl ||
					   'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com';

		// Fetch both deployments and configurations to get executableId
		const deploymentsUrl = `${baseUrl}/v2/lm/deployments?$filter=status eq 'RUNNING'`;
		const configurationsUrl = `${baseUrl}/v2/lm/configurations`;

		const [deploymentsResponse, configurationsResponse] = await Promise.all([
			requestUrl({ url: deploymentsUrl, method: 'GET', headers }),
			requestUrl({ url: configurationsUrl, method: 'GET', headers }).catch(() => null)
		]);

		if (deploymentsResponse.status !== 200) {
			throw new Error(`Failed to fetch deployments for model ${modelName}: ${deploymentsResponse.status} - ${deploymentsResponse.text || 'Unknown error'}`);
		}

		// Build configuration map for executableId lookup
		const configMap = new Map<string, { executableId?: string }>();
		if (configurationsResponse && configurationsResponse.status === 200) {
			const configurationsData = configurationsResponse.json as {
				resources?: unknown[];
				value?: unknown[];
			};
			const configs = configurationsData.resources || configurationsData.value || [];
			for (const config of configs) {
				if (Array.isArray(config)) continue;
				const typedConfig = config as { id: string; executableId?: string };
				if (typedConfig.id) {
					configMap.set(typedConfig.id, { executableId: typedConfig.executableId });
				}
			}
		}

		const data = deploymentsResponse.json as {
			resources?: unknown[];
			value?: unknown[];
		};
		let deployments = Array.isArray(data.resources) ? data.resources :
						Array.isArray(data.value) ? data.value :
						Array.isArray(data) ? data : [];

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
			const deployedModelName = backendModel || deployment.configurationName || deployment.name || '';

			return String(deployedModelName).toLowerCase().includes(modelName.toLowerCase());
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
			modelName: backendModel?.name || modelName,
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
	async getDeploymentDetails(deploymentId: string): Promise<DeploymentInfo | null> {
		try {
			const headers = await this.getAuthHeaders();
			const baseUrl = this.serviceKey?.serviceurls?.AI_API_URL ||
						   this.config.baseUrl ||
						   'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com';

			const url = `${baseUrl}/v2/lm/deployments/${deploymentId}`;

			const response = await requestUrl({
				url,
				method: 'GET',
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
	async checkDeploymentHealth(deploymentId: string): Promise<boolean> {
		const deploymentInfo = await this.getDeploymentDetails(deploymentId);

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
	async listDeployments(statusFilter?: string): Promise<DeploymentInfo[]> {
		try {
			const headers = await this.getAuthHeaders();
			const baseUrl = this.serviceKey?.serviceurls?.AI_API_URL ||
						   this.config.baseUrl ||
						   'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com';

			// Build URL with optional status filter
			let url = `${baseUrl}/v2/lm/deployments`;
			if (statusFilter) {
				url += `?$filter=status eq '${statusFilter}'`;
			}

			const response = await requestUrl({
				url,
				method: 'GET',
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

			console.debug(`Listed ${deploymentInfos.length} deployments${statusFilter ? ` with status ${statusFilter}` : ''}`);
			return deploymentInfos;
		} catch (error) {
			console.error('Error listing deployments:', error);
			return [];
		}
	}

	/**
	 * Chat completion using SAP AI Core Inference Service
	 *
	 * Makes a synchronous chat completion request to SAP AI Core.
	 * Supports both deployment IDs and model names (with automatic resolution).
	 * Handles different executable types (AWS Bedrock, Azure OpenAI, etc.) with
	 * appropriate endpoint formats and request/response structures.
	 *
	 * @param request The chat request containing messages and parameters
	 * @returns The chat response with content and token usage
	 */
	async chat(request: ChatRequest): Promise<ChatResponse> {
		const headers = await this.getAuthHeaders();

		// Extract model name from provider-prefixed ID (sap-ai-core:gpt-4o -> gpt-4o)
		const modelId = request.model;
		const unprefixedModelName = modelId.includes(':') ? modelId.split(':')[1] : modelId;

		// Look up model info from cached models using full model ID
		const modelInfo = this.config.cachedModels?.find(m => m.id === modelId);

		let deploymentId: string;
		let deploymentUrl: string | undefined;
		let executableId: string | undefined;
		let modelName: string;

		if (modelInfo && modelInfo.deploymentId) {
			// Found in cached models - use the stored deployment ID and URL
			deploymentId = modelInfo.deploymentId;
			deploymentUrl = modelInfo.deploymentUrl;
			executableId = modelInfo.executableId;
			modelName = modelInfo.name || unprefixedModelName;
			console.debug(`Using cached model info for ${modelId}, deployment: ${deploymentId}, deploymentUrl: ${deploymentUrl || 'not available'}, executableId: ${executableId ?? 'unknown'}`);
		} else {
			// Not in cache or no deployment ID - try to resolve dynamically using unprefixed name
			console.debug(`Model ${modelId} not found in cache, attempting dynamic resolution`);
			const cacheKey = unprefixedModelName;
			deploymentId = await this.resolveDeploymentId(unprefixedModelName);
			modelName = unprefixedModelName;

			// Try to get deploymentUrl from deployment cache
			const cached = this.deploymentCache.get(cacheKey);
			if (cached) {
				deploymentUrl = cached.deployment.deploymentUrl;
				executableId = cached.deployment.executableId;
			}
		}

		// Use deploymentUrl if available, otherwise construct from baseUrl
		const baseUrl = deploymentUrl ||
						this.serviceKey?.serviceurls?.AI_API_URL ||
						this.config.baseUrl ||
						'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com';

		// Determine endpoint and request format based on executableId
		let url: string;
		let body: unknown;

		if (executableId === 'aws-bedrock') {
			// AWS Bedrock models - use appropriate endpoint and format
			if (modelName.toLowerCase().includes('claude')) {
				// Claude models: Use /invoke with Anthropic native format
				// Extract system message separately (Anthropic API uses a top-level `system` field)
				url = deploymentUrl ? `${deploymentUrl}/invoke` : `${baseUrl}/v2/inference/deployments/${deploymentId}/invoke`;
				body = this.buildClaudeRequestBody(request);
			} else if (modelName.toLowerCase().includes('titan')) {
				// Amazon Titan models: Use /invoke with Titan format
				url = deploymentUrl ? `${deploymentUrl}/invoke` : `${baseUrl}/v2/inference/deployments/${deploymentId}/invoke`;
				// Convert messages to single inputText for Titan
				const inputText = request.messages.map(m => m.content).join('\n');
				body = {
					inputText,
					textGenerationConfig: {
						maxTokenCount: request.maxTokens ?? 2000,
						temperature: request.temperature ?? 0.7,
						topP: request.topP ?? 1,
						stopSequences: request.stopSequences ?? [],
					}
				};
			} else {
				// Other Bedrock models (Nova, etc.): Use /converse with unified Bedrock format
				url = deploymentUrl ? `${deploymentUrl}/converse` : `${baseUrl}/v2/inference/deployments/${deploymentId}/converse`;
				body = this.buildConverseRequestBody(request);
			}
		} else if (executableId === 'gcp-vertexai') {
			// GCP Vertex AI models - use Gemini API format
			url = deploymentUrl ? `${deploymentUrl}/models/${modelName}:generateContent` : `${baseUrl}/v2/inference/deployments/${deploymentId}/models/${modelName}:generateContent`;
			body = this.buildGeminiRequestBody(request);
		} else {
			// Azure OpenAI and other providers - use /chat/completions endpoint
			url = deploymentUrl ? `${deploymentUrl}/chat/completions` : `${baseUrl}/v2/inference/deployments/${deploymentId}/chat/completions`;

			// Add api-version query parameter for Azure OpenAI models
			const apiVersion = this.getApiVersion(executableId, modelName);
			if (apiVersion) {
				url += `?api-version=${apiVersion}`;
			}

			// Azure OpenAI chat completions request body following latest API specification
			// Reference: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/reference-preview
			const requestBody: Record<string, unknown> = {
				// Required parameters
				messages: request.messages.map(msg => ({ role: msg.role, content: msg.content })),
			};

			// Determine model capabilities
			const isReasoning = this.isReasoning(modelName);
			const usesMaxCompletionTokens = this.shouldUseMaxCompletionTokens(modelName);

			// Core sampling parameters
			// Reasoning models (GPT-5, o1, o3, o4) do not support temperature — omit entirely
			if (!isReasoning) {
				requestBody.temperature = request.temperature ?? 0.7;
			}

			// Token limits - newer models use max_completion_tokens, older models use max_tokens
			if (usesMaxCompletionTokens) {
				requestBody.max_completion_tokens = request.maxCompletionTokens ?? request.maxTokens ?? 2000;
			} else {
				// Older models use max_tokens
				requestBody.max_tokens = request.maxTokens ?? 2000;

				// Also include max_completion_tokens if explicitly provided
				if (request.maxCompletionTokens !== undefined) {
					requestBody.max_completion_tokens = request.maxCompletionTokens;
				}
			}

			// Sampling parameters — not supported by reasoning models
			if (!isReasoning && request.topP !== undefined) {
				requestBody.top_p = request.topP;
			}

			// Penalty parameters — not supported by reasoning models
			if (!isReasoning) {
				if (request.frequencyPenalty !== undefined) {
					requestBody.frequency_penalty = request.frequencyPenalty;
				}
				if (request.presencePenalty !== undefined) {
					requestBody.presence_penalty = request.presencePenalty;
				}
			}

			// Stop sequences (Azure OpenAI supports up to 4 sequences)
			if (request.stop !== undefined) {
				requestBody.stop = request.stop;
			} else if (request.stopSequences !== undefined) {
				requestBody.stop = request.stopSequences.slice(0, 4);
			}

			// Number of completions — reasoning models only support n=1
			if (!isReasoning) {
				requestBody.n = request.n ?? 1;
			}

			// Logit bias — not supported by reasoning models
			if (!isReasoning && request.logitBias !== undefined) {
				requestBody.logit_bias = request.logitBias;
			}

			// Log probabilities — not supported by reasoning models
			if (!isReasoning) {
				if (request.logprobs !== undefined) {
					requestBody.logprobs = request.logprobs;
				}
				if (request.topLogprobs !== undefined) {
					// Must be between 0 and 20
					requestBody.top_logprobs = Math.min(Math.max(request.topLogprobs, 0), 20);
				}
			}

			// User identifier for monitoring and abuse detection
			if (request.user !== undefined) {
				requestBody.user = request.user;
			}

			// Response format (JSON mode, structured outputs)
			if (request.responseFormat !== undefined) {
				requestBody.response_format = request.responseFormat;
			}

			// Deterministic sampling seed
			if (request.seed !== undefined) {
				requestBody.seed = request.seed;
			}

			// Function calling / Tools
			if (request.tools !== undefined) {
				requestBody.tools = request.tools;
			}
			if (request.toolChoice !== undefined) {
				requestBody.tool_choice = request.toolChoice;
			}
			if (request.parallelToolCalls !== undefined) {
				requestBody.parallel_tool_calls = request.parallelToolCalls;
			}

			// Azure OpenAI specific: chat extensions
			if (request.dataSources !== undefined) {
				requestBody.data_sources = request.dataSources;
			}

			// Audio output configuration
			if (request.audio !== undefined) {
				requestBody.audio = request.audio;
			}
			if (request.modalities !== undefined) {
				requestBody.modalities = request.modalities;
			}

			// Advanced features
			if (request.prediction !== undefined) {
				requestBody.prediction = request.prediction;
			}
			if (request.metadata !== undefined) {
				requestBody.metadata = request.metadata;
			}
			if (request.store !== undefined) {
				requestBody.store = request.store;
			}

			// Reasoning effort (for o1 models)
			if (request.reasoningEffort !== undefined) {
				requestBody.reasoning_effort = request.reasoningEffort;
			}

			// User security context
			if (request.userSecurityContext !== undefined) {
				requestBody.user_security_context = request.userSecurityContext;
			}

			body = requestBody;
		}

		// Log deployment ID and other details for debugging
		console.debug(`SAP AI Core endpoint: ${url}`);
		console.debug(`SAP AI Core request params:`, {
			deploymentId,
			deploymentUrl,
			model: request.model,
			executableId: executableId ?? 'unknown',
			apiVersion: this.getApiVersion(executableId, modelName),
			resourceGroup: this.config.resourceGroup || 'default'
		});

		let response;
		try {
			response = await requestUrl({
				url,
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				throw: false
			});
		} catch (error) {
			console.error(`SAP AI Core request failed to URL: ${url}`, error);

			// Extract response body from Obsidian requestUrl error if available
			const errObj = error as Record<string, unknown>;
			const responseBody = typeof errObj.response === 'string'
				? errObj.response
				: (typeof errObj.text === 'string' ? errObj.text : null);
			const errorMessage = error instanceof Error ? error.message : String(error);
			const fullError = responseBody
				? `${errorMessage}\nResponse: ${responseBody}`
				: errorMessage;

			console.error(`SAP AI Core error details:`, { responseBody, model: modelName, apiVersion: this.getApiVersion(executableId, modelName) });

			// Try to get deployment status for better error message
			const deploymentDetails = await this.getDeploymentDetails(deploymentId);
			if (deploymentDetails) {
				throw new Error(
					`SAP AI Core API request failed: ${fullError}\n` +
					`Deployment Status: ${deploymentDetails.status || 'UNKNOWN'}\n` +
					`Deployment ID: ${deploymentId}\n` +
					`Model: ${modelName}`
				);
			}

			throw new Error(`SAP AI Core API request failed: ${fullError}`);
		}

		if (response.status === 404) {
			// Check deployment status when getting 404
			const deploymentDetails = await this.getDeploymentDetails(deploymentId);
			if (deploymentDetails) {
				throw new Error(
					`SAP AI Core deployment not found: ${deploymentId}.\n` +
					`Current Status: ${deploymentDetails.status || 'UNKNOWN'}\n` +
					`Target Status: ${deploymentDetails.targetStatus || 'UNKNOWN'}\n` +
					`Last Operation: ${deploymentDetails.lastOperation || 'UNKNOWN'}\n` +
					`Verify the deployment is running and accessible.`
				);
			}
			throw new Error(`SAP AI Core deployment not found: ${deploymentId}. Verify the deployment ID is correct and the deployment is running.`);
		} else if (response.status !== 200) {
			const errorText = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
			console.error(`SAP AI Core API error ${response.status}:`, {
				response: errorText,
				model: modelName,
				apiVersion: this.getApiVersion(executableId, modelName),
				requestBody: body
			});

			// Get deployment status for better diagnostics
			const deploymentDetails = await this.getDeploymentDetails(deploymentId);
			if (deploymentDetails && deploymentDetails.status !== 'RUNNING') {
				throw new Error(
					`SAP AI Core API request failed: ${response.status} - ${errorText}\n` +
					`Deployment Status: ${deploymentDetails.status || 'UNKNOWN'} (expected RUNNING)\n` +
					`Deployment ID: ${deploymentId}\n` +
					`Model: ${modelName}`
				);
			}

			throw new Error(`SAP AI Core API request failed: ${response.status} - ${errorText}`);
		}

		// Parse response based on executableId
		let content: string;
		let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

		if (executableId === 'aws-bedrock') {
			if (modelName.toLowerCase().includes('claude')) {
				// Anthropic Claude response format
				const data = response.json as {
					content?: Array<{ text?: string }>;
					usage?: {
						input_tokens?: number;
						output_tokens?: number;
					};
				};
				content = data.content?.[0]?.text || '';
				if (data.usage) {
					usage = {
						promptTokens: data.usage.input_tokens || 0,
						completionTokens: data.usage.output_tokens || 0,
						totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
					};
				}
			} else if (modelName.toLowerCase().includes('titan')) {
				// Amazon Titan response format
				const data = response.json as {
					results?: Array<{ outputText?: string }>;
					inputTextTokenCount?: number;
				};
				content = data.results?.[0]?.outputText || '';
				// Titan doesn't provide detailed token usage
				usage = {
					promptTokens: data.inputTextTokenCount || 0,
					completionTokens: 0,
					totalTokens: data.inputTextTokenCount || 0,
				};
			} else {
				// Bedrock Converse response format
				const data = response.json as {
					output?: {
						message?: {
							content?: Array<{ text?: string }>;
						};
					};
					usage?: {
						inputTokens?: number;
						outputTokens?: number;
						totalTokens?: number;
					};
				};
				content = data.output?.message?.content?.[0]?.text || '';
				if (data.usage) {
					usage = {
						promptTokens: data.usage.inputTokens || 0,
						completionTokens: data.usage.outputTokens || 0,
						totalTokens: data.usage.totalTokens || 0,
					};
				}
			}
		} else if (executableId === 'gcp-vertexai') {
			// GCP Vertex AI Gemini response format
			const data = response.json as {
				candidates?: Array<{
					content?: {
						parts?: Array<{ text?: string }>;
					};
				}>;
				usageMetadata?: {
					promptTokenCount?: number;
					candidatesTokenCount?: number;
					totalTokenCount?: number;
				};
			};
			// Extract text from the first candidate's first part
			content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
			if (data.usageMetadata) {
				usage = {
					promptTokens: data.usageMetadata.promptTokenCount || 0,
					completionTokens: data.usageMetadata.candidatesTokenCount || 0,
					totalTokens: data.usageMetadata.totalTokenCount || 0,
				};
			}
		} else {
			// OpenAI-compatible response format
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
			content = data.choices?.[0]?.message?.content || '';
			const responseUsage = data.usage || {};
			usage = {
				promptTokens: responseUsage.prompt_tokens || responseUsage.promptTokens || 0,
				completionTokens: responseUsage.completion_tokens || responseUsage.completionTokens || 0,
				totalTokens: responseUsage.total_tokens || responseUsage.totalTokens || 0,
			};
		}

		console.debug(`SAP AI Core response: ${String(content).substring(0, 50)}... (truncated)`);

		return {
			content,
			usage,
		};
	}

	/**
	 * Streaming chat using SAP AI Core Inference Service
	 *
	 * Supports both deployment IDs and model names (with automatic resolution).
	 * Handles different executable types with appropriate streaming endpoints.
	 */
	async streamChat(request: ChatRequest, onChunk: (_chunk: StreamChunk) => void): Promise<void> {
		const headers = await this.getAuthHeaders();
		headers['Accept'] = 'text/event-stream';

		// Extract model name from provider-prefixed ID (sap-ai-core:gpt-4o -> gpt-4o)
		const modelId = request.model;
		const unprefixedModelName = modelId.includes(':') ? modelId.split(':')[1] : modelId;

		// Look up model info from cached models using full model ID
		const modelInfo = this.config.cachedModels?.find(m => m.id === modelId);

		let deploymentId: string;
		let deploymentUrl: string | undefined;
		let executableId: string | undefined;
		let modelName: string;

		if (modelInfo && modelInfo.deploymentId) {
			// Found in cached models - use the stored deployment ID and URL
			deploymentId = modelInfo.deploymentId;
			deploymentUrl = modelInfo.deploymentUrl;
			executableId = modelInfo.executableId;
			modelName = modelInfo.name || unprefixedModelName;
			console.debug(`Using cached model info for ${modelId}, deployment: ${deploymentId}, deploymentUrl: ${deploymentUrl || 'not available'}, executableId: ${executableId ?? 'unknown'}`);
		} else {
			// Not in cache or no deployment ID - try to resolve dynamically using unprefixed name
			console.debug(`Model ${modelId} not found in cache, attempting dynamic resolution`);
			const cacheKey = unprefixedModelName;
			deploymentId = await this.resolveDeploymentId(unprefixedModelName);
			modelName = unprefixedModelName;

			// Try to get deploymentUrl from deployment cache
			const cached = this.deploymentCache.get(cacheKey);
			if (cached) {
				deploymentUrl = cached.deployment.deploymentUrl;
				executableId = cached.deployment.executableId;
			}
		}

		// Use deploymentUrl if available, otherwise construct from baseUrl
		const baseUrl = deploymentUrl ||
						this.serviceKey?.serviceurls?.AI_API_URL ||
						this.config.baseUrl ||
						'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com';

		// Handle AWS Bedrock streaming separately
		if (executableId === 'aws-bedrock') {
			return this.streamBedrockChat(request, onChunk, baseUrl, deploymentId, modelName, deploymentUrl);
		}

		// Handle GCP Vertex AI streaming separately
		if (executableId === 'gcp-vertexai') {
			return this.streamVertexAIChat(request, onChunk, baseUrl, deploymentId, modelName, deploymentUrl);
		}

		// Azure OpenAI and other providers - use /chat/completions with streaming
		let url = deploymentUrl ? `${deploymentUrl}/chat/completions` : `${baseUrl}/v2/inference/deployments/${deploymentId}/chat/completions`;

		// Add api-version query parameter for Azure OpenAI models
		const apiVersion = this.getApiVersion(executableId, modelName);
		if (apiVersion) {
			url += `?api-version=${apiVersion}`;
		}

		// Azure OpenAI streaming request body following latest API specification
		// Reference: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/reference-preview
		const requestBody: Record<string, unknown> = {
			// Required parameters
			messages: request.messages.map(msg => ({ role: msg.role, content: msg.content })),

			// Streaming enabled
			stream: true,
		};

		// Determine model capabilities
		const isReasoning = this.isReasoning(modelName);
		const usesMaxCompletionTokens = this.shouldUseMaxCompletionTokens(modelName);

		// Core sampling parameters
		// Reasoning models (GPT-5, o1, o3, o4) do not support temperature — omit entirely
		if (!isReasoning) {
			requestBody.temperature = request.temperature ?? 0.7;
		}

		// Token limits - newer models use max_completion_tokens, older models use max_tokens
		if (usesMaxCompletionTokens) {
			requestBody.max_completion_tokens = request.maxCompletionTokens ?? request.maxTokens ?? 2000;
		} else {
			// Older models use max_tokens
			requestBody.max_tokens = request.maxTokens ?? 2000;

			// Also include max_completion_tokens if explicitly provided
			if (request.maxCompletionTokens !== undefined) {
				requestBody.max_completion_tokens = request.maxCompletionTokens;
			}
		}

		// Streaming options
		if (request.streamOptions !== undefined) {
			requestBody.stream_options = request.streamOptions;
		}

		// Sampling parameters — not supported by reasoning models
		if (!isReasoning && request.topP !== undefined) {
			requestBody.top_p = request.topP;
		}

		// Penalty parameters — not supported by reasoning models
		if (!isReasoning) {
			if (request.frequencyPenalty !== undefined) {
				requestBody.frequency_penalty = request.frequencyPenalty;
			}
			if (request.presencePenalty !== undefined) {
				requestBody.presence_penalty = request.presencePenalty;
			}
		}

		// Stop sequences (Azure OpenAI supports up to 4 sequences)
		if (request.stop !== undefined) {
			requestBody.stop = request.stop;
		} else if (request.stopSequences !== undefined) {
			requestBody.stop = request.stopSequences.slice(0, 4);
		}

		// Number of completions — reasoning models only support n=1
		if (!isReasoning) {
			requestBody.n = request.n ?? 1;
		}

		// Logit bias — not supported by reasoning models
		if (!isReasoning && request.logitBias !== undefined) {
			requestBody.logit_bias = request.logitBias;
		}

		// Log probabilities — not supported by reasoning models
		if (!isReasoning) {
			if (request.logprobs !== undefined) {
				requestBody.logprobs = request.logprobs;
			}
			if (request.topLogprobs !== undefined) {
				requestBody.top_logprobs = Math.min(Math.max(request.topLogprobs, 0), 20);
			}
		}

		// User identifier for monitoring and abuse detection
		if (request.user !== undefined) {
			requestBody.user = request.user;
		}

		// Response format (JSON mode, structured outputs)
		if (request.responseFormat !== undefined) {
			requestBody.response_format = request.responseFormat;
		}

		// Deterministic sampling seed
		if (request.seed !== undefined) {
			requestBody.seed = request.seed;
		}

		// Function calling / Tools
		if (request.tools !== undefined) {
			requestBody.tools = request.tools;
		}
		if (request.toolChoice !== undefined) {
			requestBody.tool_choice = request.toolChoice;
		}
		if (request.parallelToolCalls !== undefined) {
			requestBody.parallel_tool_calls = request.parallelToolCalls;
		}

		// Azure OpenAI specific: chat extensions
		if (request.dataSources !== undefined) {
			requestBody.data_sources = request.dataSources;
		}

		// Audio output configuration
		if (request.audio !== undefined) {
			requestBody.audio = request.audio;
		}
		if (request.modalities !== undefined) {
			requestBody.modalities = request.modalities;
		}

		// Advanced features
		if (request.prediction !== undefined) {
			requestBody.prediction = request.prediction;
		}
		if (request.metadata !== undefined) {
			requestBody.metadata = request.metadata;
		}
		if (request.store !== undefined) {
			requestBody.store = request.store;
		}

		// Reasoning effort (for o1 models)
		if (request.reasoningEffort !== undefined) {
			requestBody.reasoning_effort = request.reasoningEffort;
		}

		// User security context
		if (request.userSecurityContext !== undefined) {
			requestBody.user_security_context = request.userSecurityContext;
		}

		const body = requestBody;

		console.debug(`SAP AI Core streaming endpoint: ${url}`);
		console.debug(`SAP AI Core streaming params:`, {
			deploymentId,
			deploymentUrl,
			model: request.model,
			executableId: executableId ?? 'unknown',
			apiVersion: this.getApiVersion(executableId, modelName)
		});

		let response;
		try {
			response = await requestUrl({
				url,
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				throw: false,
			});
		} catch (error) {
			console.error(`SAP AI Core streaming request failed to URL: ${url}`, error);

			// Extract response body from Obsidian requestUrl error if available
			const errObj = error as Record<string, unknown>;
			const responseBody = typeof errObj.response === 'string'
				? errObj.response
				: (typeof errObj.text === 'string' ? errObj.text : null);
			const errorMessage = error instanceof Error ? error.message : String(error);
			const fullError = responseBody
				? `${errorMessage}\nResponse: ${responseBody}`
				: errorMessage;

			console.error(`SAP AI Core streaming error details:`, { responseBody, model: modelName });

			throw new Error(`SAP AI Core streaming API request failed: ${fullError}`);
		}

		if (response.status === 404) {
			// Check deployment status for better error diagnostics
			const deploymentDetails = await this.getDeploymentDetails(deploymentId);
			let errorMsg = `SAP AI Core deployment not found for streaming: ${deploymentId}\n`;
			errorMsg += `URL attempted: ${url}\n`;

			if (deploymentDetails) {
				errorMsg += `Deployment Status: ${deploymentDetails.status || 'UNKNOWN'}\n`;
				errorMsg += `Target Status: ${deploymentDetails.targetStatus || 'UNKNOWN'}\n`;
				errorMsg += `Deployment URL: ${deploymentDetails.deploymentUrl || 'Not available'}\n`;
				errorMsg += `Configuration: ${deploymentDetails.configurationName || 'Unknown'}\n`;

				if (deploymentDetails.status !== 'RUNNING') {
					errorMsg += `\nThe deployment exists but is not in RUNNING status. `;
					errorMsg += `Current status is '${deploymentDetails.status || 'UNKNOWN'}'. `;
					errorMsg += `Please wait for the deployment to reach RUNNING status before making requests.`;
				} else {
					errorMsg += `\nThe deployment is RUNNING but the endpoint was not found. `;
					errorMsg += `This may indicate an incorrect API path or version.`;
				}
			} else {
				errorMsg += `\nCould not fetch deployment details. The deployment may not exist or you may not have access to it.`;
			}

			console.error(errorMsg);
			throw new Error(errorMsg);
		} else if (response.status !== 200) {
			const errorText = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
			console.warn(`SAP AI Core streaming failed (status ${response.status}), falling back to non-streaming`, errorText);

			// Fallback to non-streaming
			const fallbackResponse = await requestUrl({
				url,
				method: 'POST',
				headers: { ...headers, Accept: 'application/json' },
				body: JSON.stringify({ ...body, stream: false }),
			});

			if (fallbackResponse.status !== 200) {
				throw new Error(`SAP AI Core API request failed: ${fallbackResponse.status} - ${fallbackResponse.text}`);
			}

			const data = fallbackResponse.json as { choices?: Array<{ message?: { content?: string } }> };
			const content = data.choices?.[0]?.message?.content || '';
			if (content) {
				onChunk({ content, done: false });
			}
			onChunk({ content: '', done: true });
			return;
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
	 * Handle streaming for GCP Vertex AI (Gemini) models
	 * Uses the :streamGenerateContent endpoint for Gemini models
	 */
	private async streamVertexAIChat(
		request: ChatRequest,
		onChunk: (_chunk: StreamChunk) => void,
		baseUrl: string,
		deploymentId: string,
		modelName: string,
		deploymentUrl?: string
	): Promise<void> {
		const headers = await this.getAuthHeaders();
		headers['Accept'] = 'text/event-stream';

		// Gemini streaming endpoint: /models/<modelName>:streamGenerateContent
		const url = deploymentUrl
			? `${deploymentUrl}/models/${modelName}:streamGenerateContent`
			: `${baseUrl}/v2/inference/deployments/${deploymentId}/models/${modelName}:streamGenerateContent`;

		const body = this.buildGeminiRequestBody(request);

		console.debug(`SAP AI Core Vertex AI streaming endpoint: ${url}`);
		console.debug(`SAP AI Core Vertex AI streaming started for deployment: ${deploymentId}, model: ${modelName}`);

		let response;
		try {
			response = await requestUrl({
				url,
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				throw: false,
			});
		} catch (error) {
			console.error(`SAP AI Core Vertex AI streaming request failed to URL: ${url}`, error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`SAP AI Core Vertex AI streaming API request failed to connect: ${errorMessage}`);
		}

		if (response.status === 404) {
			throw new Error(`SAP AI Core deployment not found for Vertex AI streaming: ${deploymentId}. Verify the deployment ID is correct and the deployment is running.`);
		} else if (response.status !== 200) {
			const errorText = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
			console.warn(`SAP AI Core Vertex AI streaming failed (status ${response.status}), falling back to non-streaming`, errorText);

			// Fallback to non-streaming
			const fallbackUrl = url.replace(':streamGenerateContent', ':generateContent');
			const fallbackResponse = await requestUrl({
				url: fallbackUrl,
				method: 'POST',
				headers: { ...headers, Accept: 'application/json' },
				body: JSON.stringify(body),
			});

			if (fallbackResponse.status !== 200) {
				throw new Error(`SAP AI Core Vertex AI API request failed: ${fallbackResponse.status} - ${fallbackResponse.text}`);
			}

			// Parse non-streaming response
			const data = fallbackResponse.json as {
				candidates?: Array<{
					content?: {
						parts?: Array<{ text?: string }>;
					};
				}>;
			};
			const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
			if (content) onChunk({ content, done: false });
			onChunk({ content: '', done: true });
			return;
		}

		// Parse SSE stream for Vertex AI
		const text = typeof response.text === 'string' ? response.text : String(response.text);
		const lines = text.split('\n');

		for (const line of lines) {
			if (line.trim() === '') continue;

			if (line.startsWith('data: ')) {
				const data = line.slice(6).trim();

				if (data === '[DONE]') {
					console.debug('SAP AI Core Vertex AI streaming completed');
					onChunk({ content: '', done: true });
					return;
				}

				try {
					const parsed = JSON.parse(data) as {
						candidates?: Array<{
							content?: {
								parts?: Array<{ text?: string }>;
							};
							finishReason?: string;
						}>;
					};

					// Extract text from candidates
					const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
					if (content) {
						onChunk({ content, done: false });
					}

					const finishReason = parsed.candidates?.[0]?.finishReason;
					if (finishReason && finishReason !== 'STOP') {
						console.debug(`SAP AI Core Vertex AI streaming finished with reason: ${finishReason}`);
					}
					if (finishReason) {
						onChunk({ content: '', done: true });
						return;
					}
				} catch (e) {
					console.error('Failed to parse Vertex AI SSE chunk:', e, 'Data:', data);
				}
			}
		}

		console.debug('SAP AI Core Vertex AI streaming ended');
		onChunk({ content: '', done: true });
	}

	/**
	 * Handle streaming for AWS Bedrock models
	 * Uses the /invoke-with-response-stream endpoint for Bedrock models
	 */
	private async streamBedrockChat(
		request: ChatRequest,
		onChunk: (_chunk: StreamChunk) => void,
		baseUrl: string,
		deploymentId: string,
		modelName: string,
		deploymentUrl?: string
	): Promise<void> {
		const headers = await this.getAuthHeaders();
		headers['Accept'] = 'text/event-stream';

		// Determine endpoint and request format based on model type
		let url: string;
		let body: unknown;

		if (modelName.toLowerCase().includes('claude')) {
			// Claude models: Use /invoke-with-response-stream with Anthropic native format
			url = deploymentUrl
				? `${deploymentUrl}/invoke-with-response-stream`
				: `${baseUrl}/v2/inference/deployments/${deploymentId}/invoke-with-response-stream`;
			body = { ...this.buildClaudeRequestBody(request), stream: true };
		} else if (modelName.toLowerCase().includes('titan')) {
			// Amazon Titan models: Streaming not commonly supported, fallback to non-streaming
			console.warn('Titan models may not support streaming, attempting non-streaming request');
			url = deploymentUrl
				? `${deploymentUrl}/invoke`
				: `${baseUrl}/v2/inference/deployments/${deploymentId}/invoke`;
			const inputText = request.messages.map(m => m.content).join('\n');
			body = {
				inputText,
				textGenerationConfig: {
					maxTokenCount: request.maxTokens ?? 2000,
					temperature: request.temperature ?? 0.7,
					topP: request.topP ?? 1,
					stopSequences: request.stopSequences ?? [],
				}
			};
		} else {
			// Other Bedrock models (Nova, etc.): Use /invoke-with-response-stream with converse format
			url = deploymentUrl
				? `${deploymentUrl}/invoke-with-response-stream`
				: `${baseUrl}/v2/inference/deployments/${deploymentId}/invoke-with-response-stream`;
			body = this.buildConverseRequestBody(request);
		}

		console.debug(`SAP AI Core Bedrock streaming endpoint: ${url}`);
		console.debug(`SAP AI Core Bedrock streaming started for deployment: ${deploymentId}, model: ${modelName}`);

		let response;
		try {
			response = await requestUrl({
				url,
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				throw: false,
			});
		} catch (error) {
			console.error(`SAP AI Core Bedrock streaming request failed to URL: ${url}`, error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`SAP AI Core Bedrock streaming API request failed to connect: ${errorMessage}`);
		}

		if (response.status === 404) {
			throw new Error(`SAP AI Core deployment not found for Bedrock streaming: ${deploymentId}. Verify the deployment ID is correct and the deployment is running.`);
		} else if (response.status !== 200) {
			const errorText = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
			console.warn(`SAP AI Core Bedrock streaming failed (status ${response.status}), falling back to non-streaming`, errorText);

			// Fallback to non-streaming for Titan or if streaming fails
			const fallbackResponse = await requestUrl({
				url: url.replace('/invoke-with-response-stream', '/invoke').replace('/converse-stream', '/converse'),
				method: 'POST',
				headers: { ...headers, Accept: 'application/json' },
				body: JSON.stringify(body),
			});

			if (fallbackResponse.status !== 200) {
				throw new Error(`SAP AI Core Bedrock API request failed: ${fallbackResponse.status} - ${fallbackResponse.text}`);
			}

			// Parse non-streaming response
			if (modelName.toLowerCase().includes('claude')) {
				const data = fallbackResponse.json as { content?: Array<{ text?: string }> };
				const content = data.content?.[0]?.text || '';
				if (content) onChunk({ content, done: false });
			} else if (modelName.toLowerCase().includes('titan')) {
				const data = fallbackResponse.json as { results?: Array<{ outputText?: string }> };
				const content = data.results?.[0]?.outputText || '';
				if (content) onChunk({ content, done: false });
			} else {
				const data = fallbackResponse.json as { output?: { message?: { content?: Array<{ text?: string }> } } };
				const content = data.output?.message?.content?.[0]?.text || '';
				if (content) onChunk({ content, done: false });
			}
			onChunk({ content: '', done: true });
			return;
		}

		// Parse SSE stream for Bedrock
		const text = typeof response.text === 'string' ? response.text : String(response.text);
		const lines = text.split('\n');

		for (const line of lines) {
			if (line.trim() === '') continue;

			if (line.startsWith('data: ')) {
				const data = line.slice(6).trim();

				if (data === '[DONE]') {
					console.debug('SAP AI Core Bedrock streaming completed');
					onChunk({ content: '', done: true });
					return;
				}

				try {
					// Handle different Bedrock streaming response formats
					if (modelName.toLowerCase().includes('claude')) {
						// Anthropic Claude streaming format
						const chunk = JSON.parse(data) as { type?: string; delta?: { text?: string }; content_block?: { text?: string } };
						const content = chunk.delta?.text || chunk.content_block?.text;
						if (content) {
							onChunk({ content, done: false });
						}
						if (chunk.type === 'message_stop' || chunk.type === 'content_block_stop') {
							console.debug('SAP AI Core Claude streaming finished');
							onChunk({ content: '', done: true });
							return;
						}
					} else {
						// Bedrock Converse streaming format
						const chunk = JSON.parse(data) as {
							contentBlockDelta?: { delta?: { text?: string } };
							messageStop?: unknown;
						};
						const content = chunk.contentBlockDelta?.delta?.text;
						if (content) {
							onChunk({ content, done: false });
						}
						if (chunk.messageStop) {
							console.debug('SAP AI Core Bedrock streaming finished');
							onChunk({ content: '', done: true });
							return;
						}
					}
				} catch (e) {
					console.error('Failed to parse Bedrock SSE chunk:', e, 'Data:', data);
				}
			}
		}

		console.debug('SAP AI Core Bedrock streaming ended');
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

					const capabilities = this.inferCapabilities(scenarioId, modelName);

					// Create model info with provider-prefixed ID for global uniqueness
					models.push({
						id: `sap-ai-core:${modelName}`,    // Use provider:model format for uniqueness
						name: modelName,    // Display the actual model name
						provider: 'sap-ai-core',
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
	 * Based on SAP AI Core Remote Model documentation
	 */
	private getDefaultModels(): ModelInfo[] {
		return [
			// Azure OpenAI — GPT models
			{ id: 'sap-ai-core:gpt-5', name: 'GPT-5', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'reasoning', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:gpt-4.1', name: 'GPT-4.1', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:gpt-4o', name: 'GPT-4o', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:gpt-4o-mini', name: 'GPT-4o Mini', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'audio', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			// Azure OpenAI — Reasoning models
			{ id: 'sap-ai-core:o4-mini', name: 'o4-mini', provider: 'sap-ai-core', capabilities: ['chat', 'reasoning', 'function_calling', 'streaming'], enabled: true },
			{ id: 'sap-ai-core:o3', name: 'o3', provider: 'sap-ai-core', capabilities: ['chat', 'reasoning', 'function_calling', 'streaming'], enabled: true },
			// AWS Bedrock — Claude models
			{ id: 'sap-ai-core:anthropic--claude-4-sonnet', name: 'Claude 4 Sonnet', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			{ id: 'sap-ai-core:anthropic--claude-4.5-haiku', name: 'Claude 4.5 Haiku', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			// GCP Vertex AI — Gemini models
			{ id: 'sap-ai-core:gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'sap-ai-core', capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'json_mode'], enabled: true },
			// Embeddings
			{ id: 'sap-ai-core:text-embedding-3-large', name: 'Text Embedding 3 Large', provider: 'sap-ai-core', capabilities: ['embedding'], enabled: true },
		];
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
	private inferCapabilities(scenarioId: string, modelName: string): ModelCapability[] {
		const scenarioLower = scenarioId.toLowerCase();
		const modelLower = modelName.toLowerCase();

		// Embedding models
		if (modelLower.includes('embedding') || modelLower.includes('embed') || scenarioLower.includes('embedding')) {
			return ['embedding'];
		}

		const capabilities: ModelCapability[] = ['chat', 'streaming'];

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
		capabilities.push('json_mode');

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
}
