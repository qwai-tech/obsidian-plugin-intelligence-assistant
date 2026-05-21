import i18next from 'i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';
import af from './locales/af.json';
import ar from './locales/ar.json';
import be from './locales/be.json';
import bg from './locales/bg.json';
import bn from './locales/bn.json';
import ca from './locales/ca.json';
import cs from './locales/cs.json';
import da from './locales/da.json';
import de from './locales/de.json';
import el from './locales/el.json';
import enGB from './locales/en-GB.json';
import eo from './locales/eo.json';
import es from './locales/es.json';
import eu from './locales/eu.json';
import fa from './locales/fa.json';
import fi from './locales/fi.json';
import fr from './locales/fr.json';
import gl from './locales/gl.json';
import he from './locales/he.json';
import hr from './locales/hr.json';
import hu from './locales/hu.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import lt from './locales/lt.json';
import lv from './locales/lv.json';
import ml from './locales/ml.json';
import ms from './locales/ms.json';
import nl from './locales/nl.json';
import nn from './locales/nn.json';
import no from './locales/no.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ptBR from './locales/pt-BR.json';
import ro from './locales/ro.json';
import ru from './locales/ru.json';
import sk from './locales/sk.json';
import sr from './locales/sr.json';
import sv from './locales/sv.json';
import ta from './locales/ta.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import ur from './locales/ur.json';
import vi from './locales/vi.json';
import zhTW from './locales/zh-TW.json';

const i18n = i18next.createInstance();

// Map from Obsidian/moment locale codes → registered i18next language key
const LOCALE_MAP: Record<string, string> = {
	'af': 'af',
	'ar': 'ar',
	'be': 'be',
	'bg': 'bg',
	'bn': 'bn',
	'ca': 'ca',
	'cs': 'cs',
	'da': 'da',
	'de': 'de',
	'el': 'el',
	'en': 'en',
	'en-gb': 'en-GB',
	'en-GB': 'en-GB',
	'eo': 'eo',
	'es': 'es',
	'eu': 'eu',
	'fa': 'fa',
	'fi': 'fi',
	'fr': 'fr',
	'gl': 'gl',
	'he': 'he',
	'hr': 'hr',
	'hu': 'hu',
	'id': 'id',
	'it': 'it',
	'ja': 'ja',
	'ko': 'ko',
	'lt': 'lt',
	'lv': 'lv',
	'ml': 'ml',
	'ms': 'ms',
	'nl': 'nl',
	'nn': 'nn',
	'no': 'no',
	'pl': 'pl',
	'pt': 'pt',
	'pt-br': 'pt-BR',
	'pt-BR': 'pt-BR',
	'ro': 'ro',
	'ru': 'ru',
	'sk': 'sk',
	'sr': 'sr',
	'sv': 'sv',
	'ta': 'ta',
	'th': 'th',
	'tr': 'tr',
	'uk': 'uk',
	'ur': 'ur',
	'vi': 'vi',
	'zh': 'zh',
	'zh-cn': 'zh',
	'zh-CN': 'zh',
	'zh-hans': 'zh',
	'zh-Hans': 'zh',
	'zh-tw': 'zh-TW',
	'zh-TW': 'zh-TW',
	'zh-hant': 'zh-TW',
	'zh-Hant': 'zh-TW',
	'zh-hk': 'zh-TW',
	'zh-HK': 'zh-TW',
};

function resolveLocale(raw: string): string {
	if (raw in LOCALE_MAP) return LOCALE_MAP[raw];
	// Language prefix fallback (e.g. 'de-AT' → 'de')
	const prefix = raw.split('-')[0];
	if (prefix in LOCALE_MAP) return LOCALE_MAP[prefix];
	return 'en';
}

export function initI18n(langOverride?: string): void {
	const raw: string = langOverride ??
		(window as Window & { moment?: { locale(): string } }).moment?.locale() ?? 'en';
	const lang = resolveLocale(raw);

	void i18n.init({
		lng: lang,
		fallbackLng: {
			'zh-TW': ['zh', 'en'],
			'pt-BR': ['pt', 'en'],
			'en-GB': ['en'],
			'default': ['en'],
		},
		initAsync: false,
		resources: {
			af: { translation: af as Record<string, unknown> },
			ar: { translation: ar as Record<string, unknown> },
			be: { translation: be as Record<string, unknown> },
			bg: { translation: bg as Record<string, unknown> },
			bn: { translation: bn as Record<string, unknown> },
			ca: { translation: ca as Record<string, unknown> },
			cs: { translation: cs as Record<string, unknown> },
			da: { translation: da as Record<string, unknown> },
			de: { translation: de as Record<string, unknown> },
			el: { translation: el as Record<string, unknown> },
			en: { translation: en as Record<string, unknown> },
			'en-GB': { translation: enGB as Record<string, unknown> },
			eo: { translation: eo as Record<string, unknown> },
			es: { translation: es as Record<string, unknown> },
			eu: { translation: eu as Record<string, unknown> },
			fa: { translation: fa as Record<string, unknown> },
			fi: { translation: fi as Record<string, unknown> },
			fr: { translation: fr as Record<string, unknown> },
			gl: { translation: gl as Record<string, unknown> },
			he: { translation: he as Record<string, unknown> },
			hr: { translation: hr as Record<string, unknown> },
			hu: { translation: hu as Record<string, unknown> },
			id: { translation: id as Record<string, unknown> },
			it: { translation: it as Record<string, unknown> },
			ja: { translation: ja as Record<string, unknown> },
			ko: { translation: ko as Record<string, unknown> },
			lt: { translation: lt as Record<string, unknown> },
			lv: { translation: lv as Record<string, unknown> },
			ml: { translation: ml as Record<string, unknown> },
			ms: { translation: ms as Record<string, unknown> },
			nl: { translation: nl as Record<string, unknown> },
			nn: { translation: nn as Record<string, unknown> },
			no: { translation: no as Record<string, unknown> },
			pl: { translation: pl as Record<string, unknown> },
			pt: { translation: pt as Record<string, unknown> },
			'pt-BR': { translation: ptBR as Record<string, unknown> },
			ro: { translation: ro as Record<string, unknown> },
			ru: { translation: ru as Record<string, unknown> },
			sk: { translation: sk as Record<string, unknown> },
			sr: { translation: sr as Record<string, unknown> },
			sv: { translation: sv as Record<string, unknown> },
			ta: { translation: ta as Record<string, unknown> },
			th: { translation: th as Record<string, unknown> },
			tr: { translation: tr as Record<string, unknown> },
			uk: { translation: uk as Record<string, unknown> },
			ur: { translation: ur as Record<string, unknown> },
			vi: { translation: vi as Record<string, unknown> },
			zh: { translation: zh as Record<string, unknown> },
			'zh-TW': { translation: zhTW as Record<string, unknown> },
		},
		interpolation: { escapeValue: false },
	});
}

export function t(key: string, options?: Record<string, unknown>): string {
	return i18n.t(key, options);
}
