/**
 * Workflow System V2 - Enhanced Node Definitions
 *
 * Additional node types with enhanced functionality including
 * data processing, control flow, file operations, and web services.
 */

import { ExecutionContext, NodeDef } from '../core/types';

// Helper function to safely get error message
function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

// Vault service interface for type safety
interface VaultService {
	getFileByPath: (_path: string) => unknown;
	readBinary: (_file: unknown) => Promise<ArrayBuffer>;
	read: (_file: unknown) => Promise<string>;
	getFileStat: (_file: unknown) => Promise<{ ctime: number; mtime: number; size: number } | null>;
}

// RSS feed types
interface RSSItem {
	title?: string;
	link?: string;
	description?: string;
	pubDate?: string;
	fullContent?: string;
}

interface RSSChannel {
	title?: string;
	description?: string;
	link?: string;
}

interface RSSFeedData {
	items: RSSItem[];
	channel: RSSChannel;
}

/**
 * Simple RSS/Atom feed parser
 */
function parseFeed(feedContent: string, feedUrl: string): RSSFeedData {
	try {
		// Very simplified parser - in real implementation, you'd use a proper XML parser
		const items: RSSItem[] = [];
		const channel: RSSChannel = {
			title: '',
			description: '',
			link: feedUrl,
		};

		// Extract channel/title
		const titleMatch = feedContent.match(/<title>([^<]+)<\/title>/i);
		if (titleMatch) {
			channel.title = titleMatch[1];
		}

		// Extract channel/description
		const descMatch = feedContent.match(/<description>([^<]+)<\/description>/i);
		if (descMatch) {
			channel.description = descMatch[1];
		}

		// Extract items - very simplified approach
		const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
		let itemMatch;

		while ((itemMatch = itemRegex.exec(feedContent)) !== null && items.length < 50) {
			const itemContent = itemMatch[1];
			const item: RSSItem = {};

			// Extract title
			const itemTitleMatch = itemContent.match(/<title>([^<]+)<\/title>/i);
			if (itemTitleMatch) {
				item.title = itemTitleMatch[1];
			}

			// Extract link
			const itemLinkMatch = itemContent.match(/<link>([^<]+)<\/link>|<link\s+href=["']([^"']+)["']/i);
			if (itemLinkMatch) {
				item.link = itemLinkMatch[1] || itemLinkMatch[2];
			}

			// Extract description
			const itemDescMatch = itemContent.match(/<description>([^<]+)<\/description>/i);
			if (itemDescMatch) {
				item.description = itemDescMatch[1];
			}

			// Extract pubDate
			const itemDateMatch = itemContent.match(/<(pubDate|published)>([^<]+)<\/\1>/i);
			if (itemDateMatch) {
				item.pubDate = itemDateMatch[2];
			}

			items.push(item);
		}

		// If no items found, try Atom format
		if (items.length === 0) {
			const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
			let entryMatch;

			while ((entryMatch = entryRegex.exec(feedContent)) !== null && items.length < 50) {
				const entryContent = entryMatch[1];
				const item: RSSItem = {};

				// Extract title
				const entryTitleMatch = entryContent.match(/<title[^>]*>([^<]+)<\/title>/i);
				if (entryTitleMatch) {
					item.title = entryTitleMatch[1];
				}

				// Extract link
				const entryLinkMatch = entryContent.match(/<link\s+href=["']([^"']+)["']/i);
				if (entryLinkMatch) {
					item.link = entryLinkMatch[1];
				}

				// Extract summary/content
				const entrySummaryMatch = entryContent.match(/<(summary|content)[^>]*>([^<]+)<\/\1>/i);
				if (entrySummaryMatch) {
					item.description = entrySummaryMatch[2];
				}

				// Extract published date
				const entryDateMatch = entryContent.match(/<(published|updated)>([^<]+)<\/\1>/i);
				if (entryDateMatch) {
					item.pubDate = entryDateMatch[2];
				}

				items.push(item);
			}
		}

		return { items, channel };
	} catch {
		return {
			items: [],
			channel: { title: 'Unknown Feed', description: 'Could not parse feed', link: feedUrl },
		};
	}
}

// ============================================================================
// DATA PROCESSING NODES
// ============================================================================

/**
 * Parse CSV Node - Parse CSV data into structured objects
 */
export const parseCSVNode: NodeDef = {
  type: 'parseCSV',
  name: 'Parse CSV',
  icon: '📊',
  color: '#8b5cf6',
  description: 'Parse CSV formatted data into structured objects',
  category: 'data',
  io: {
    inputs: [
      {
        type: 'string',
        description: 'CSV formatted text to parse',
        optional: false
      }
    ],
    outputs: [
      {
        type: 'array',
        description: 'Array of parsed CSV records as objects',
      },
      {
        type: 'array',
        description: 'Array of header/column names',
      }
    ],
    multipleInputs: false,
    multipleOutputs: false,
  },
  parameters: [
    {
      name: 'delimiter',
      label: 'Delimiter',
      type: 'select',
      default: ',',
      options: [
        { label: 'Comma (,)', value: ',' },
        { label: 'Semicolon (;)', value: ';' },
        { label: 'Tab', value: '\t' },
        { label: 'Pipe (|)', value: '|' },
      ],
      description: 'Character used to separate values in CSV',
    },
    {
      name: 'hasHeader',
      label: 'Has Header Row',
      type: 'boolean',
      default: true,
      description: 'Whether the first row contains column headers',
    },
    {
      name: 'trimFields',
      label: 'Trim Fields',
      type: 'boolean',
      default: true,
      description: 'Whether to trim whitespace from field values',
    }
  ],
  execute(inputs, config, _context: ExecutionContext) {
    const { delimiter = ',', hasHeader = true, trimFields = true } = config;
    
    try {
      const textInput = inputs[0]?.json?.text;
      const csvInput = inputs[0]?.json?.csv;
      const csvText = typeof textInput === 'string' ? textInput : (typeof csvInput === 'string' ? csvInput : '');
      if (!csvText) {
        throw new Error('No CSV input provided');
      }

      // Split lines
      const lines = csvText.split(/\r?\n/).filter((line: string) => line.trim() !== '');
      if (lines.length === 0) {
        return [{ json: { records: [], headers: [] } }];
      }

      // Parse CSV - this is a simplified parser for demonstration
      const parsedLines = lines.map((line: string) => {
        // Basic CSV parsing - handles quoted fields
        const fields: string[] = [];
        let currentField = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
          const char = line[i];
          
          if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
              // Double quotes - escaped quote
              currentField += '"';
              i += 2;
              continue;
            }
            // Toggle quote state
            inQuotes = !inQuotes;
          } else if (char === delimiter && !inQuotes) {
            // Field delimiter
            fields.push(trimFields ? currentField.trim() : currentField);
            currentField = '';
          } else {
            // Regular character
            currentField += char;
          }
          
          i++;
        }
        
        // Add last field
        fields.push(trimFields ? currentField.trim() : currentField);
        
        return fields;
      });

      let headers: string[] = [];
      let records: unknown[] = [];

      if (parsedLines.length === 0) {
        return [{ json: { records: [], headers: [] } }];
      }

      if (hasHeader && parsedLines.length > 0) {
        headers = parsedLines[0];
        // Process data rows
        for (let i = 1; i < parsedLines.length; i++) {
          const row = parsedLines[i];
          const record: Record<string, unknown> = {};

          for (let j = 0; j < headers.length; j++) {
            record[headers[j]] = row[j] || '';
          }
          
          records.push(record);
        }
      } else {
        // No headers - use indices as keys
        for (const row of parsedLines) {
          const record: Record<string, unknown> = {};
          row.forEach((value: string, index: number) => {
            record[`col_${index}`] = value;
          });
          records.push(record);
        }
      }

      return [{
        json: {
          records,
          headers,
          rowCount: records.length,
        }
      }];
    } catch (error) {
      throw new Error(`CSV parsing failed: ${getErrorMessage(error)}`);
    }
  },
};

/**
 * Format JSON Node - Format or transform JSON data
 */
export const formatJSONNode: NodeDef = {
  type: 'formatJSON',
  name: 'Format JSON',
  icon: '📄',
  color: '#10b981',
  description: 'Format, transform, or validate JSON data',
  category: 'data',
  io: {
    inputs: [
      {
        type: 'string',
        description: 'JSON text or object to process',
        optional: false
      }
    ],
    outputs: [
      {
        type: 'string',
        description: 'Formatted JSON text',
      },
      {
        type: 'object',
        description: 'Parsed JSON object',
      }
    ],
    multipleInputs: false,
    multipleOutputs: false,
  },
  parameters: [
    {
      name: 'operation',
      label: 'Operation',
      type: 'select',
      default: 'format',
      options: [
        { label: 'Format/Pretty Print', value: 'format' },
        { label: 'Validate Only', value: 'validate' },
        { label: 'Minify', value: 'minify' },
        { label: 'Convert to CSV', value: 'toCSV' },
        { label: 'Extract Property', value: 'extract' },
      ],
      description: 'What operation to perform on the JSON data',
    },
    {
      name: 'indent',
      label: 'Indent Size',
      type: 'number',
      default: 2,
      description: 'Number of spaces for indentation (when formatting)',
    },
    {
      name: 'propertyName',
      label: 'Property Name',
      type: 'string',
      default: '',
      description: 'Property to extract (when operation is "extract")',
      placeholder: 'e.g., user.profile.name',
    },
    {
      name: 'strictValidation',
      label: 'Strict Validation',
      type: 'boolean',
      default: true,
      description: 'Whether to enforce strict JSON validation',
    }
  ],
  execute(inputs, config, _context: ExecutionContext) {
    const { operation = 'format', indent = 2, propertyName = '', strictValidation = true } = config;
    
    try {
      const inputJSON = inputs[0]?.json?.text || inputs[0]?.json?.json || inputs[0]?.json;
      
      if (!inputJSON) {
        throw new Error('No JSON input provided');
      }

      let jsonObj: unknown;
      
      // Parse JSON
      if (typeof inputJSON === 'string') {
        jsonObj = JSON.parse(inputJSON);
      } else {
        jsonObj = inputJSON;
      }

      // Validate
      if (strictValidation && typeof jsonObj !== 'object' && !Array.isArray(jsonObj)) {
        throw new Error('Input is not valid JSON object or array');
      }

      switch (operation) {
        case 'validate': {
          // Just validation - return original
          return [{
            json: {
              isValid: true,
              original: jsonObj,
              type: typeof jsonObj,
            }
          }];
        }

        case 'format': {
          // Pretty print with indentation
          const formatted = JSON.stringify(jsonObj, null, Number(indent));
          return [{
            json: {
              formatted,
              object: jsonObj,
            }
          }];
        }

        case 'minify': {
          // Remove whitespace
          const minified = JSON.stringify(jsonObj);
          return [{
            json: {
              minified,
              object: jsonObj,
            }
          }];
        }

        case 'toCSV': {
          // Convert array of objects to CSV
          if (!Array.isArray(jsonObj) || jsonObj.length === 0) {
            throw new Error('Cannot convert to CSV: input must be a non-empty array');
          }
          
          // Extract headers from first object
          const headers = Object.keys(jsonObj[0] as Record<string, unknown>);

          // Convert to CSV rows
          const csvRows = [headers.join(',')];
          for (const obj of jsonObj) {
            const row = headers.map(header => {
              const value = (obj as Record<string, unknown>)[header];
              // Handle special characters in CSV
              if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return String(value);
            }).join(',');
            csvRows.push(row);
          }
          
          const csvString = csvRows.join('\n');
          return [{
            json: {
              csv: csvString,
              headers,
              rowCount: jsonObj.length,
            }
          }];
        }

        case 'extract': {
          // Extract specific property using dot notation
          if (!propertyName) {
            throw new Error('Property name required for extraction');
          }
          if (typeof propertyName !== 'string') {
            throw new Error('Property name must be a string');
          }

          // Simple dot notation extraction
          const pathParts = propertyName.split('.');
          let currentValue: unknown = jsonObj;

          for (const part of pathParts) {
            if (currentValue === null || currentValue === undefined) {
              throw new Error(`Path does not exist: ${String(propertyName)}`);
            }
            currentValue = (currentValue as Record<string, unknown>)[part];
          }
          
          return [{
            json: {
              extracted: currentValue,
              path: propertyName,
              original: jsonObj,
            }
          }];
        }

        default:
          throw new Error(`Unknown operation: ${String(operation)}`);
      }
    } catch (error) {
      throw new Error(`JSON operation failed: ${getErrorMessage(error)}`);
    }
  },
};

// ============================================================================
// CONTROL FLOW NODES
// ============================================================================

/**
 * Switch Node - Route based on conditions
 */
export const switchNode: NodeDef = {
  type: 'switch',
  name: 'Switch',
  icon: '🔀',
  color: '#f59e0b',
  description: 'Route data based on conditions (multiple branches)',
  category: 'logic',
  io: {
    inputs: [
      {
        type: 'any',
        description: 'Input data to route',
        optional: false
      }
    ],
    outputs: [
      {
        type: 'any',
        description: 'Output routed to first matching condition',
      }
    ],
    multipleInputs: false,
    multipleOutputs: false, // Actually routes to one specific output based on condition
  },
  parameters: [
    {
      name: 'conditions',
      label: 'Conditions',
      type: 'json',
      default: [
        { name: 'Case 1', condition: 'input.value > 0', output: 'true' },
        { name: 'Case 2', condition: 'input.value <= 0', output: 'false' },
      ],
      description: 'Array of routing conditions with their outputs',
    },
    {
      name: 'defaultOutput',
      label: 'Default Output',
      type: 'string',
      default: 'default',
      description: 'Output to use when no conditions match',
      placeholder: 'e.g., default, fallback',
    },
    {
      name: 'matchAll',
      label: 'Match All Conditions',
      type: 'boolean',
      default: false,
      description: 'Whether to route to all matching conditions (vs first match)',
    }
  ],
  async execute(inputs, config, context: ExecutionContext) {
    const { conditions = [], defaultOutput = 'default', matchAll = false } = config;
    const inputData = inputs[0]?.json || {};
    
    try {
      const matchedOutputs: string[] = [];
      
      // Import secure execution service
      const { SecureCodeExecutionService } = await import('../services/secure-execution');
      const secureExecutor = SecureCodeExecutionService.getInstance();
      
      // Evaluate conditions using secure execution
      interface ConditionDef {
        condition: string;
        output?: string;
        name: string;
      }
      for (const condition of conditions as ConditionDef[]) {
        try {
          const executionResult = await secureExecutor.executeCode(
            `return ${condition.condition};`,
            { input: inputData, data: inputs, context },
            context.services,
            {
              timeout: 2000,
              builtinModules: [],
              allowAsync: false,
            }
          );

          if (executionResult.result) {
            matchedOutputs.push(condition.output || condition.name);
            
            // If not matching all, break on first match
            if (!matchAll) {
              break;
            }
          }
        } catch (error) {
          context.log(`Condition evaluation failed for "${condition.name}": ${getErrorMessage(error)}`);
        }
      }
      
      // If no matches, use default
      if (matchedOutputs.length === 0) {
        matchedOutputs.push(defaultOutput);
      }
      
      return [{
        json: {
          routes: matchedOutputs,
          input: inputData,
          matchedFirst: matchedOutputs[0],
        }
      }];
    } catch (error) {
      throw new Error(`Secure switch evaluation failed: ${getErrorMessage(error)}`);
    }
  },
};

// ============================================================================
// FILE OPERATION NODES
// ============================================================================

/**
 * Read File Node - Read file content from Obsidian vault
 */
export const readFileNode: NodeDef = {
  type: 'readFile',
  name: 'Read File',
  icon: '📖',
  color: '#3b82f6',
  description: 'Read content from a file in Obsidian vault',
  category: 'tools',
  io: {
    inputs: [
      {
        type: 'string',
        description: 'File path to read',
        optional: false
      }
    ],
    outputs: [
      {
        type: 'string',
        description: 'File content as text',
      },
      {
        type: 'object',
        description: 'File metadata and stats',
      }
    ],
    multipleInputs: false,
    multipleOutputs: false,
  },
  parameters: [
    {
      name: 'encoding',
      label: 'Encoding',
      type: 'select',
      default: 'utf-8',
      options: [
        { label: 'UTF-8', value: 'utf-8' },
        { label: 'UTF-16', value: 'utf-16' },
        { label: 'ASCII', value: 'ascii' },
        { label: 'Base64', value: 'base64' },
      ],
      description: 'Text encoding for reading the file',
    },
    {
      name: 'readAsBinary',
      label: 'Read as Binary',
      type: 'boolean',
      default: false,
      description: 'Whether to read the file as binary data',
    },
    {
      name: 'parseJSON',
      label: 'Parse as JSON',
      type: 'boolean',
      default: false,
      description: 'Whether to parse the content as JSON automatically',
    },
    {
      name: 'fallbackContent',
      label: 'Fallback Content',
      type: 'textarea',
      default: '',
      description: 'Content to return if file does not exist',
      placeholder: 'Default content when file is missing...',
    }
  ],
  async execute(inputs, config, context: ExecutionContext) {
    const { encoding = 'utf-8', readAsBinary = false, parseJSON = false, fallbackContent = '' } = config;
    const filePathRaw = inputs[0]?.json?.path || inputs[0]?.json?.text || inputs[0]?.json?.filePath;
    if (!filePathRaw) {
      throw new Error('No file path provided');
    }
    if (typeof filePathRaw !== 'string') {
      throw new Error('File path must be a string');
    }
    const filePath = filePathRaw;

    if (!context.services.vault) {
      throw new Error('Vault service is not available');
    }

    try {
      const vault = context.services.vault as VaultService;
      // Check if file exists
      const file = vault.getFileByPath(filePath);
      if (!file) {
        if (fallbackContent) {
          return [{
            json: {
              content: fallbackContent,
              path: filePath,
              exists: false,
              fallbackUsed: true,
            }
          }];
        } else {
          throw new Error(`File not found: ${String(filePath)}`);
        }
      }

      // Read file content
      let content: string | ArrayBuffer;
      if (readAsBinary) {
        const arrayBuffer = await vault.readBinary(file);
        content = arrayBuffer;
      } else {
        content = await vault.read(file);
      }

      // Parse as JSON if requested
      let parsedContent: unknown = content;
      if (parseJSON && typeof content === 'string') {
        try {
          parsedContent = JSON.parse(content);
        } catch (parseError) {
          context.log(`Warning: Could not parse file as JSON: ${getErrorMessage(parseError)}`);
        }
      }

      // Get file stats
      const stat = await vault.getFileStat(file);

      return [{
        json: {
          content: parsedContent,
          path: filePath,
          exists: true,
          stat: stat ? {
            ctime: stat.ctime,
            mtime: stat.mtime,
            size: stat.size,
          } : undefined,
          encoding,
        }
      }];
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${getErrorMessage(error)}`);
    }
  },
};

// ============================================================================
// WEB SERVICE NODES
// ============================================================================

/**
 * RSS Feed Reader Node - Read and parse RSS feeds
 */
export const rssFeedReaderNode: NodeDef = {
  type: 'rssReader',
  name: 'RSS Reader',
  icon: '📡',
  color: '#ec4899',
  description: 'Read and parse RSS or Atom feeds',
  category: 'tools',
  io: {
    inputs: [
      {
        type: 'string',
        description: 'RSS feed URL',
        optional: false
      }
    ],
    outputs: [
      {
        type: 'array',
        description: 'Array of parsed feed items',
      },
      {
        type: 'object',
        description: 'Feed metadata and channel information',
      }
    ],
    multipleInputs: false,
    multipleOutputs: false,
  },
  parameters: [
    {
      name: 'maxItems',
      label: 'Max Items',
      type: 'number',
      default: 20,
      description: 'Maximum number of items to retrieve from feed',
    },
    {
      name: 'includeContent',
      label: 'Include Full Content',
      type: 'boolean',
      default: false,
      description: 'Whether to fetch and include full article content',
    },
    {
      name: 'timeout',
      label: 'Timeout (seconds)',
      type: 'number',
      default: 30,
      description: 'HTTP request timeout in seconds',
    },
    {
      name: 'userAgent',
      label: 'User Agent',
      type: 'string',
      default: 'WorkflowV2 RSS Reader (+https://github.com/your-repo)',
      description: 'User agent string for HTTP requests',
      placeholder: 'Custom user agent string...',
    }
  ],
  async execute(inputs, config, context: ExecutionContext) {
    const { maxItems = 20, includeContent = false, timeout = 30, userAgent = '' } = config;
    const feedUrl = inputs[0]?.json?.url || inputs[0]?.json?.feedUrl || '';
    
    if (!feedUrl) {
      throw new Error('No feed URL provided');
    }
    
    if (!context.services.http) {
      throw new Error('HTTP service is not available');
    }
    
    try {
      // Fetch RSS feed
      const headers: Record<string, string> = {
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      };
      
      if (userAgent) {
        headers['User-Agent'] = userAgent;
      }
      
      const response = await context.services.http.request(feedUrl, {
        method: 'GET',
        headers,
        timeout: timeout * 1000,
      }) as { headers?: Record<string, string>; data?: unknown; text?: string };

      const feedContent: string = typeof response.data === 'string' ? response.data : (response.text || '');

      if (typeof feedUrl !== 'string') {
        throw new Error('Feed URL must be a string');
      }

      // Simple RSS/Atom parsing - in a real implementation you'd use a proper parser
      const feedData = parseFeed(feedContent, feedUrl);

      // Limit items
      if (feedData.items.length > maxItems) {
        feedData.items = feedData.items.slice(0, maxItems);
      }

      // Optionally fetch full content for each item
      if (includeContent) {
        for (const item of feedData.items) {
          if (item.link && !item.fullContent) {
            try {
              // Fetch full content
              const contentResponse = await context.services.http.request(item.link, {
                method: 'GET',
                headers,
                timeout: timeout * 1000,
              }) as { data?: unknown; text?: string };

              // Extract text content (very simplified)
              const htmlContent: string = typeof contentResponse.data === 'string' ? contentResponse.data : (contentResponse.text || '');
              const textContent = htmlContent.replace(/<[^>]*>/g, '').substring(0, 1000);
              item.fullContent = textContent;
            } catch (error) {
              context.log(`Warning: Failed to fetch full content for ${item.link}: ${getErrorMessage(error)}`);
            }
          }
        }
      }

      return [{
        json: {
          items: feedData.items,
          channel: feedData.channel,
          feedUrl,
          itemCount: feedData.items.length,
          fetchedAt: new Date().toISOString(),
        }
      }];
    } catch (error) {
      const feedUrlStr = typeof feedUrl === 'string' ? feedUrl : 'unknown';
      throw new Error(`Failed to read RSS feed ${feedUrlStr}: ${getErrorMessage(error)}`);
    }
  }
};

/**
 * Export enhanced node definitions
 */
export function registerEnhancedNodes(): NodeDef[] {
  return [
    parseCSVNode,
    formatJSONNode,
    switchNode,
    readFileNode,
    rssFeedReaderNode,
  ];
}
