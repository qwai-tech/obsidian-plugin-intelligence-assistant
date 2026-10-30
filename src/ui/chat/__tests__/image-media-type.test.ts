import { imageMediaType } from '@/ui/chat/chat-pickers';

describe('imageMediaType', () => {
	it.each([
		['png', 'image/png'],
		['PNG', 'image/png'],
		['jpg', 'image/jpeg'],
		['JPEG', 'image/jpeg'],
		['svg', 'image/svg+xml'],
		['webp', 'image/webp'],
	])('labels .%s as %s', (extension, mediaType) => {
		expect(imageMediaType(extension)).toBe(mediaType);
	});
});
