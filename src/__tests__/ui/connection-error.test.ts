import { describeConnectionError } from '@/ui/modals/connection-error';

describe('describeConnectionError', () => {
	it.each([
		[new Error('Failed to fetch models: 401'), { key: 'keyRejected', status: 401 }],
		[new Error('Failed to fetch models: 403'), { key: 'keyRejected', status: 403 }],
		[new Error('Failed to fetch models: 404'), { key: 'notFound', status: 404 }],
		[new Error('Failed to fetch models: 500'), { key: 'httpError', status: 500 }],
		[new Error('net::ERR_CONNECTION_REFUSED'), { key: 'unreachable' }],
		[new Error('getaddrinfo ENOTFOUND api.example.invalid'), { key: 'unreachable' }],
	])('classifies %s', (error, expected) => {
		expect(describeConnectionError(error)).toEqual(expected);
	});
});
