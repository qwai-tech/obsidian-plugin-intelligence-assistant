/**
 * WebdriverIO Configuration for Firefox Browser Testing
 * Extends base configuration for Firefox-specific settings
 */

import { config as baseConfig } from './wdio.conf';
import type { Options } from '@wdio/types';

export const config: Options.Testrunner = {
	...baseConfig,

	// Override capabilities for Firefox
	capabilities: [
		{
			browserName: 'firefox',
			'moz:firefoxOptions': {
				args: [
					'-headless',
					'-width=1280',
					'-height=800',
				],
				prefs: {
					// Firefox preferences
					'dom.webdriver.enabled': false,
					'useAutomationExtension': false,
				},
			},
		},
	],

	// Firefox-specific services
	services: [
		...(baseConfig.services || []),
		[
			'geckodriver',
			{
				logFileName: 'wdio-geckodriver.log',
				outputDir: 'tests/e2e/logs',
			},
		],
	],

	// Reporter configuration for Firefox
	reporters: [
		'spec',
		[
			'allure',
			{
				outputDir: 'tests/e2e/reports/allure-firefox',
				disableWebdriverStepsReporting: true,
				disableWebdriverScreenshotsReporting: false,
			},
		],
	],
};
