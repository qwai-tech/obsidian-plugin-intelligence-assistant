import { errorMessage } from '@/core/utils/errors';

export type ConnectionErrorKind = 'keyRejected' | 'notFound' | 'httpError' | 'unreachable';

export function describeConnectionError(error: unknown): { key: ConnectionErrorKind; status?: number } {
	const status = Number(/Failed to fetch models: (\d{3})/.exec(errorMessage(error))?.[1]);
	if (!status) return { key: 'unreachable' };
	if (status === 401 || status === 403) return { key: 'keyRejected', status };
	if (status === 404) return { key: 'notFound', status };
	return { key: 'httpError', status };
}
