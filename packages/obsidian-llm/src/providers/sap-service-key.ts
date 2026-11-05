/** The complete service binding is a credential; never include it in diagnostics. */
export interface SAPServiceKey {
	clientid: string;
	clientsecret: string;
	url: string;
	serviceurls?: { AI_API_URL: string };
}

export function parseSAPServiceKey(value: unknown, baseUrl?: string): SAPServiceKey {
	let parsed: unknown;
	try {
		parsed = typeof value === 'string' ? JSON.parse(value) : value;
	} catch {
		throw new Error('SAP AI Core Service Key must be valid JSON.');
	}
	if (!parsed || typeof parsed !== 'object') throw new Error('SAP AI Core Service Key is required.');
	const key = parsed as Partial<SAPServiceKey>;
	if (typeof key.clientid !== 'string' || !key.clientid.trim() || typeof key.clientsecret !== 'string' || !key.clientsecret.trim()) {
		throw new Error('SAP AI Core Service Key requires clientid and clientsecret.');
	}
	const oauthUrl = secureUrl(key.url);
	const aiUrl = secureUrl(baseUrl || key.serviceurls?.AI_API_URL);
	return { clientid: key.clientid, clientsecret: key.clientsecret, url: oauthUrl, serviceurls: { AI_API_URL: aiUrl } };
}

function secureUrl(value: unknown): string {
	try {
		if (typeof value !== 'string' || !value.trim()) throw new Error();
		const url = new URL(value.trim());
		if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
		return url.toString().replace(/\/$/, '');
	} catch {
		throw new Error('SAP AI Core requires valid HTTPS OAuth and AI API URLs.');
	}
}
