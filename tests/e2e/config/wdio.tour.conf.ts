import * as path from 'path';
import type { Options } from '@wdio/types';
import { config as ciConfig } from './wdio.ci.conf';

export const config: Options.Testrunner = {
	...ciConfig,
	specs: [path.resolve('tests/e2e/tour/**/*.spec.ts')],
	exclude: [],
	specFileRetries: 0,
};
