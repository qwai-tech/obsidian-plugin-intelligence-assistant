/**
 * Workflow System V2 - Expression Parser
 *
 * Simple expression parser for variable substitution in workflow parameters.
 * Supports basic expressions like {{input.name}} and {{node.data.value}}.
 */

/**
 * Expression parser - parses and evaluates expressions
 */
export class ExpressionParser {
	/**
	 * Parse a single expression
	 * Example: "{{input.name}}" with context {input: {name: "John"}} => "John"
	 */
	static parse(expr: string, context: Record<string, unknown>): unknown {
		const code = expr.replace(/^\{\{|\}\}$/gu, '').trim();
		const { value, resolved } = this.evaluate(code, context);
		return resolved ? value : expr;
	}

	/**
	 * Replace all expressions in a string
	 * Example: "Hello {{input.name}}!" with context {input: {name: "John"}} => "Hello John!"
	 */
	static replace(text: string, context: Record<string, unknown>): string {
		if (typeof text !== 'string') {
			return text;
		}

		return text.replace(/\{\{(.+?)\}\}/gu, (match: string, rawExpr: string) => {
			const code = rawExpr.trim();
			const { value, resolved } = this.evaluate(code, context);
			if (!resolved) {
				return match;
			}
			return typeof value === 'string' ? value : String(value);
		});
	}

	/**
	 * Replace expressions in an object recursively
	 */
	static replaceInObject(obj: unknown, context: Record<string, unknown>): unknown {
		if (typeof obj === 'string') {
			return this.replace(obj, context);
		}

		if (Array.isArray(obj)) {
			return obj.map(item => this.replaceInObject(item, context));
		}

		if (obj && typeof obj === 'object') {
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(obj)) {
				result[key] = this.replaceInObject(value, context);
			}
			return result;
		}

		return obj;
	}

	/**
	 * Check if a string contains expressions
	 */
	static hasExpressions(text: string): boolean {
		if (typeof text !== 'string') return false;
		return /\{\{.+?\}\}/u.test(text);
	}

	/**
	 * Extract all expression strings from text
	 */
	static extract(text: string): string[] {
		if (typeof text !== 'string') return [];

		const matches = text.match(/\{\{(.+?)\}\}/gu);
		return matches || [];
	}

	/**
	 * Validate an expression syntax
	 */
	static validate(expr: string): { valid: boolean; error?: string } {
		const code = expr.replace(/^\{\{|\}\}$/gu, '').trim();
		if (!code) {
			return { valid: false, error: 'Expression is empty' };
		}

		const literal = this.tryParseLiteral(code);
		if (literal.matched) {
			return { valid: true };
		}

		try {
			this.tokenizePath(code);
			return { valid: true };
		} catch (error: unknown) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : 'Invalid expression',
			};
		}
	}

	private static evaluate(code: string, context: Record<string, unknown>): { value: unknown; resolved: boolean } {
		if (!code) {
			return { value: '', resolved: true };
		}

		const literal = this.tryParseLiteral(code);
		if (literal.matched) {
			return { value: literal.value, resolved: true };
		}

		const pathResult = this.resolvePath(code, context);
		if (pathResult.found) {
			return { value: pathResult.value, resolved: true };
		}

		return { value: undefined, resolved: false };
	}

	private static tryParseLiteral(code: string): { matched: boolean; value?: unknown } {
		if (code === 'true') return { matched: true, value: true };
		if (code === 'false') return { matched: true, value: false };
		if (code === 'null') return { matched: true, value: null };
		if (code === 'undefined') return { matched: true, value: undefined };

		if (/^-?\d+(?:\.\d+)?$/u.test(code)) {
			return { matched: true, value: Number(code) };
		}

		if ((code.startsWith('"') && code.endsWith('"')) || (code.startsWith("'") && code.endsWith("'"))) {
			const inner = code.slice(1, -1);
			return { matched: true, value: inner };
		}

		return { matched: false };
	}

	private static resolvePath(
		path: string,
		context: Record<string, unknown>
	): { value: unknown; found: boolean } {
		const tokens = this.tokenizePath(path);
		let current: unknown = context;
		for (const token of tokens) {
			if (current == null) {
				return { value: undefined, found: false };
			}

			if (typeof token === 'number') {
				if (!Array.isArray(current) || token < 0 || token >= current.length) {
					return { value: undefined, found: false };
				}
				current = current[token];
				continue;
			}

			if (typeof current === 'object') {
				const record = current as Record<string, unknown>;
				if (!Object.prototype.hasOwnProperty.call(record, token)) {
					return { value: undefined, found: false };
				}
				current = record[token];
			} else {
				return { value: undefined, found: false };
			}
		}

		return { value: current, found: true };
	}

	private static tokenizePath(path: string): Array<string | number> {
		const tokens: Array<string | number> = [];
		const pathPattern = String.raw`[^.[\]]+|\[(?:'([^']+)'|"([^"]+)"|([^\]]+))\]`;
		const regex = new RegExp(pathPattern, 'gu');
		let match: RegExpExecArray | null;
		let lastIndex = 0;
		while ((match = regex.exec(path)) !== null) {
			if (match.index !== lastIndex) {
				throw new Error(`Invalid expression segment near "${path.slice(lastIndex)}"`);
			}

			lastIndex = regex.lastIndex;

			if (match[0].startsWith('[')) {
				const inner = (match[1] ?? match[2] ?? match[3])?.trim();
				if (inner == null) {
					throw new Error('Empty bracket accessor');
				}
				const numeric = Number(inner);
				tokens.push(Number.isNaN(numeric) ? inner : numeric);
			} else {
				tokens.push(match[0].trim());
			}
		}

		if (lastIndex !== path.length) {
			throw new Error(`Invalid expression: ${path}`);
		}

		return tokens;
	}
}
