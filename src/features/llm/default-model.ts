import type { ModelInfo } from './types/model';

export function defaultAfterRefresh(defaultModel: string, before: ModelInfo[], after: ModelInfo[]): string {
	const listedBefore = before.some(model => model.id === defaultModel);
	const listedAfter = after.some(model => model.id === defaultModel);
	return listedBefore && !listedAfter ? '' : defaultModel;
}
