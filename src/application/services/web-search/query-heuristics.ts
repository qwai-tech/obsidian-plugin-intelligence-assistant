/**
 * Process user input and determine if web search is needed
 */
export function preprocessQuery(userInput: string): string | null {
	if (!userInput || typeof userInput !== 'string') {
		return null;
	}

	// Clean the input
	let cleanedInput = userInput.trim();
	
	// Remove common prefixes that indicate the user wants to search
	const searchIndicators = [
		'find:', 'search:', 'google:', 'bing:', 'search for:', 
		'look up:', 'find me:', 'find information about:'
	];
	
	for (const indicator of searchIndicators) {
		if (cleanedInput.toLowerCase().startsWith(indicator)) {
			cleanedInput = cleanedInput.substring(indicator.length).trim();
			break;
		}
	}

	// Filter out potentially harmful or inappropriate queries
	if (!isValidQuery(cleanedInput)) {
		return null;
	}

	// If query is too short or lacks informational intent, return null
	if (cleanedInput.length < 2) {
		return null;
	}

	return cleanedInput;
}

/**
 * Validate if the query is appropriate for web searching
 */
function isValidQuery(query: string): boolean {
	// Check for potentially harmful patterns
	const harmfulPatterns = [
		/^\s*execut/i,
		/^\s*system\(/,
		/^\s*eval\s*\(/,
		/^\s*import\s+/,
		/\b(os|sys|subprocess|exec|eval|import|require)\b/
	];

	for (const pattern of harmfulPatterns) {
		if (pattern.test(query)) {
			return false;
		}
	}

	// Check for non-informational queries
	const nonInfoQueries = [
		'hello', 'hi', 'hey', 'ok', 'yes', 'no', 'thanks', 'thank you',
		'please', 'okay', 'cool', 'great', 'awesome', 'nice'
	];

	const lowerQuery = query.toLowerCase().trim();
	if (nonInfoQueries.includes(lowerQuery)) {
		return false; // These queries don't require web search
	}

	return true;
}

/**
 * Determine if a query would benefit from a web search
 */
export function shouldSearch(query: string): boolean {
	if (!query || typeof query !== 'string') {
		return false;
	}

	// Clean the input
	let cleanedQuery = query.trim();
	
	// Remove common prefixes that indicate search intent
	const searchIndicators = [
		'find:', 'search:', 'google:', 'bing:', 'search for:', 
		'look up:', 'find me:', 'find information about:'
	];
	
	for (const indicator of searchIndicators) {
		if (cleanedQuery.toLowerCase().startsWith(indicator)) {
			cleanedQuery = cleanedQuery.substring(indicator.length).trim();
			return true;
		}
	}

	// Check for common informational patterns that suggest search would be helpful
	const infoPattern = /(?:what is|who is|how to|why is|when is|where is|define:|explain|tell me about|show me|find|information about|details on|facts about|latest news about|current status of|research on|study on|current (events|news|status)|recent (developments|updates|trends|happenings)|best (practices|ways|methods|options|deals|prices)|most (recent|popular|effective|trending)|need to know about|looking for information on|can you tell me|do you know|what are|what do you know about|what happened|what will happen|current|latest|new|today|now|recently|upcoming|tomorrow|yesterday|last week|last month|last year|next week|next month|next year|this week|this month|this year|202[0-9]|203[0-9]|prices? of|cost of|how much does|how many people|population of|distance between|weather in|temperature in|forecast for|election results|stock price|exchange rate|exchange rates|current exchange|current stock|crypto price|cryptocurrency price|currency rate|currency rates|covid|pandemic|coronavirus|virus|outbreak|inflation|interest rate|unemployment|gdp|economic|economy|jobs|employment|real estate|housing|market|financial|finance|investment|investing|bitcoin|ethereum|crypto|cryptocurrency|nft|web3|ai|artificial intelligence|machine learning|deep learning|climate change|global warming|renewable energy|solar|wind|electric car|tesla|spacex|elon musk|apple|google|amazon|microsoft|meta|facebook|netflix|tesla stock|crypto market|stock market|financial market|olympics|world cup|championship|tournament|league|nfl|nba|mlb|nhl|epl|uefa|fifa|super bowl|world series|stanley cup|wimbledon|us open|french open|australian open)\b/i;
	
	if (infoPattern.test(cleanedQuery)) {
		return true;
	}

	// Check if query is specific and long enough
	if (cleanedQuery.length > 20) {
		return true;
	}

	return false;
}

/**
 * Determine the query type based on content for better LLM integration
 */
function analyzeQueryType(query: string): 'factual' | 'opinion' | 'instruction' | 'conversational' | 'informational' {
	const lowerQuery = query.toLowerCase();
	
	// Factual queries - seeking specific facts, dates, definitions
	if (/(what is|who is|when is|where is|define|definition|meaning|fact|facts|date|year|time|how many|number of|quantity|amount|size|count|total|population|price|cost)\b/.test(lowerQuery)) {
		return 'factual';
	}
	
	// Opinion queries - seeking opinions or reviews
	if (/(think|opinion|review|best|top|greatest|worst|favorite|recommended|should i|would you recommend)\b/.test(lowerQuery)) {
		return 'opinion';
	}
	
	// Instruction queries - seeking how-to information
	if (/(how to|steps to|guide|tutorial|instructions|how do i|how can i|method|technique|way to|do this|make|create|build|start|begin)\b/.test(lowerQuery)) {
		return 'instruction';
	}
	
	// Conversational queries - casual conversation
	if (/(hello|hi|hey|thanks|thank you|ok|okay|cool|great|awesome|nice|good|bad|well|yes|no|maybe|perhaps)\b/.test(lowerQuery)) {
		return 'conversational';
	}
	
	// Default to informational for other types
	return 'informational';
}

/**
 * Optimize the query for better search results
 */
export function optimizeQuery(query: string): string {
	// Analyze the query type to determine optimization strategy
	const queryType = analyzeQueryType(query);
	
	// Remove common stop words and phrases that might not be useful for search
	let optimizedQuery = query;
	
	// Remove common conversational phrases that don't add search value
	const conversationalPhrases = [
		'please', 'could you', 'would you', 'can you', 'i want', 'i need', 'i would like'
	];
	
	for (const phrase of conversationalPhrases) {
		const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
		optimizedQuery = optimizedQuery.replace(regex, '');
	}

	// Clean up extra whitespace and normalize
	optimizedQuery = optimizedQuery.replace(/\s+/g, ' ').trim();

	// If the query contains question words, try to restructure for search based on query type
	const questionWords = ['what', 'who', 'where', 'when', 'why', 'how'];
	const containsQuestionWord = questionWords.some(word => 
		optimizedQuery.toLowerCase().startsWith(word + ' ') || 
		optimizedQuery.toLowerCase().includes(' ' + word + ' '));

	if (containsQuestionWord) {
		// For factual queries, extract the core subject
		if (queryType === 'factual') {
			questionWords.forEach(word => {
				const regex = new RegExp(`\\b${word}\\b\\s+`, 'gi');
				optimizedQuery = optimizedQuery.replace(regex, '');
			});
		} else if (queryType === 'instruction') {
			// For instruction queries, keep "how to" structure if it's at the beginning
			if (!optimizedQuery.toLowerCase().startsWith('how to')) {
				questionWords.forEach(word => {
					const regex = new RegExp(`\\b${word}\\b\\s+`, 'gi');
					optimizedQuery = optimizedQuery.replace(regex, '');
				});
			}
		}
		
		// Clean up again after processing
		optimizedQuery = optimizedQuery.replace(/\s+/g, ' ').trim();
	}

	// Ensure we still have a meaningful query after optimization
	if (optimizedQuery.length < 2) {
		optimizedQuery = query; // Revert if optimization removed too much
	}

	return optimizedQuery;
}
