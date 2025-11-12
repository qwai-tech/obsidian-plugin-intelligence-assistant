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
	static parse(expr: string, context: Record<string, any>): any {
		// Remove {{ }} wrapper
		const code = expr.replace(/^\{\{|\}\}$/g, '').trim();

		try {
			// Create function with context variables
			const keys = Object.keys(context);
			const values = Object.values(context);
			const fn = new Function(...keys, `return ${code}`);

			return fn(...values);
		} catch (error) {
			console.warn('Expression evaluation failed:', expr, error);
			return expr; // Return original if evaluation fails
		}
	}

	/**
	 * Replace all expressions in a string
	 * Example: "Hello {{input.name}}!" with context {input: {name: "John"}} => "Hello John!"
	 */
	static replace(text: string, context: Record<string, any>): string {
		if (typeof text !== 'string') {
			return text;
		}

		return text.replace(/\{\{(.+?)\}\}/g, (match, expr) => {
			try {
				const result = this.parse(`{{${expr}}}`, context);
				return String(result);
			} catch (error) {
				console.warn('Expression replacement failed:', match, error);
				return match; // Return original if replacement fails
			}
		});
	}

	/**
	 * Replace expressions in an object recursively
	 */
	static replaceInObject(obj: any, context: Record<string, any>): any {
		if (typeof obj === 'string') {
			return this.replace(obj, context);
		}

		if (Array.isArray(obj)) {
			return obj.map(item => this.replaceInObject(item, context));
		}

		if (obj && typeof obj === 'object') {
			const result: any = {};
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
		return /\{\{.+?\}\}/.test(text);
	}

	/**
	 * Extract all expression strings from text
	 */
	static extract(text: string): string[] {
		if (typeof text !== 'string') return [];

		const matches = text.match(/\{\{(.+?)\}\}/g);
		return matches || [];
	}

	/**
	 * Validate an expression syntax
	 */
	static validate(expr: string): { valid: boolean; error?: string } {
		const code = expr.replace(/^\{\{|\}\}$/g, '').trim();

		try {
			// Try to create function to check syntax
			new Function(`return ${code}`);
			return { valid: true };
		} catch (error: any) {
			return {
				valid: false,
				error: error.message,
			};
		}
	}
}
