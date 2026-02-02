/**
 * WebdriverIO Configuration for Chrome Browser Testing
 * Extends base configuration for Chrome-specific settings
 */

import { config as baseConfig } from './wdio.conf';
import type { Options } from '@wdio/types';

export const config: Options.Testrunner = {
	...baseConfig,

	// Override capabilities for Chrome
	capabilities: [
		{
			browserName: 'chrome',
			'goog:chromeOptions': {
				args: [
					'--disable-gpu',
					'--no-sandbox',
					'--disable-dev-shm-usage',
					'--window-size=1280,800',
				],
			},
		},
	],

	// Chrome-specific services
	services: [
		...(baseConfig.services || []),
		[
			'chromedriver',
			{
				logFileName: 'wdio-chromedriver.log',
				outputDir: 'tests/e2e/logs',
			},
		],
	],

	// Reporter configuration for Chrome
	reporters: [
		'spec',
		[
			'allure',
			{
				outputDir: 'tests/e2e/reports/allure-chrome',
				disableWebdriverStepsReporting: true,
				disableWebdriverScreenshotsReporting: false,
			},
		],
	],
};
