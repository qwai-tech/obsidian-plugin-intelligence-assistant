/** Keep the internal completion protocol out of the existing live reply stream. */
export class AgentStatusText {
	private pending = '';
	push(text: string, final = false): string {
		this.pending += text;
		let visible = '';
		while (this.pending) {
			const start = this.pending.indexOf('<!--');
			if (start < 0) {
				let keep = 0;
				if (!final) for (let n = 1; n <= Math.min(3, this.pending.length); n++) if ('<!--'.startsWith(this.pending.slice(-n))) keep = n;
				visible += this.pending.slice(0, this.pending.length - keep);
				this.pending = keep ? this.pending.slice(-keep) : '';
				break;
			}
			visible += this.pending.slice(0, start);
			this.pending = this.pending.slice(start);
			const end = this.pending.indexOf('-->');
			if (end >= 0) {
				const comment = this.pending.slice(0, end + 3);
				if (!/^<!--\s*AGENT_STATUS:\s*(complete|blocked|needs_input|continue)\s*-->$/i.test(comment)) visible += comment;
				this.pending = this.pending.slice(end + 3);
				continue;
			}
			const rest = this.pending.slice(4).trimStart().toUpperCase();
			const internal = 'AGENT_STATUS:'.startsWith(rest) || /^AGENT_STATUS\s*(?::|$)/.test(rest);
			if (final) { if (!/^AGENT_STATUS\s*:/.test(rest)) visible += this.pending; this.pending = ''; break; }
			if (internal) break;
			visible += '<'; this.pending = this.pending.slice(1);
		}
		return visible;
	}
}
