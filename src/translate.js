import bind from '../lib/bind.js';

export function esc(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;');
}

// Inverse of esc() — for plain-text contexts (native dialogs like confirm()/alert())
// that must not receive HTML-escaped entities.
export function unesc(str) {
	return String(str)
		.replace(/&#x27;/g, '\'')
		.replace(/&quot;/g, '"')
		.replace(/&gt;/g, '>')
		.replace(/&lt;/g, '<')
		.replace(/&amp;/g, '&');
}

function applyVars(template, vars) {
	return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
		const v = vars[k];
		return v != null ? esc(String(v)) : `{{${k}}}`;
	});
}

export function t(locale, key, vars = {}) {
	const entry = window.EAE['translations']?.[key];

	if (!entry || !(locale in entry)) {
		reportError(new Error(!entry
			? `Missing translation key: "${key}"`
			: `Missing "${locale}" translation for key: "${key}"`));

		return applyVars(entry?.en ?? key, vars);
	}

	return applyVars(entry[locale], vars);
}

export function tbind(locale, template, obj, opts = { "final": false }) {
	const resolved = {};
	for (const [bindKey, spec] of Object.entries(obj)) {
		if (Array.isArray(spec)) {
			const [key, vars = {}] = spec;
			resolved[bindKey] = t(locale, key, vars);
		} else if (typeof spec === 'string') {
			resolved[bindKey] = t(locale, spec);
		} else {
			resolved[bindKey] = spec;
		}
	}
	bind(template, resolved, opts);
}

export function translateIndexName(locale, index) {
	return t(locale, 'left_panel.output.index.' + index);
}

const LOCALE_LABELS = {
	"en": "English",
	"fr": "Français",
	"zh": "中文",
};

export function resolveLocale() {
	const lang = new URLSearchParams(location.search).get('lang');
	if (LOCALE_LABELS[lang]) localStorage.setItem('locale', lang);

	return [
		lang,
		localStorage.getItem('locale'),
		navigator.language.split('-')[0],
	].find(l => LOCALE_LABELS[l]) ?? 'en';
}

const _uiUpdaters = new Set();

export function registerUIUpdater(fn) {
	_uiUpdaters.add(fn);
}

export function replayable(fn) {
	let lastArgs = null;

	function wrapped(...args) {
		lastArgs = args;
		return fn(...args);
	}

	registerUIUpdater(() => { if (lastArgs) fn(...lastArgs); });

	return wrapped;
}

function updateDatasetTranslations() {
	if (typeof DST === 'undefined') return;

	for (const ds of DST.values()) {
		if (ds.card) {
			ds.card.bind();
		}
		if (ds.controls) {
			ds.controls.bind();
		}
	}

	updateCategoryTabLabels();
}

function updateNavTranslations() {
	const myEae = document.querySelector('#my-eae');
	if (myEae && myEae.dataset.t) {
		myEae.textContent = t(window.LOCALE, myEae.dataset.t);
	}

	const navItems = document.querySelectorAll('#my-eae-dropdown a[data-t]');
	for (const item of navItems) {
		item.textContent = t(window.LOCALE, item.dataset.t);
	}
}

function updateCategoryTabLabels() {
	const allTab = document.querySelector('#controls-tab-all');
	if (allTab) {
		allTab.textContent = t(window.LOCALE, 'controls.path.tab.all');
	}
}

export function initLocalePicker(locale) {
	const nav = document.querySelector('nav');
	if (!nav) return;

	const show = new URLSearchParams(location.search).has('lang') || window.ENV.includes('protected') || localStorage.getItem('locale');
	if (!show) {
		window.addEventListener('storage', function onStorage(e) {
			if (e.key !== 'locale' || !LOCALE_LABELS[e.newValue]) return;
			window.removeEventListener('storage', onStorage);
			window.LOCALE = e.newValue;
			initLocalePicker(e.newValue);
			document.querySelector('#locale-dropdown a.active')?.click();
		});
		return;
	}

	const picker = document.createElement('div');
	picker.id = 'locale-picker';

	const current = document.createElement('span');
	current.id = 'locale-current';
	current.textContent = locale.toUpperCase();

	const dropdown = document.createElement('div');
	dropdown.id = 'locale-dropdown';

	for (const [l, label] of Object.entries(LOCALE_LABELS)) {
		if (['zh'].includes(l) && l !== locale) continue;

		const item = document.createElement('a');
		item.href = '#';
		item.textContent = label;
		item.dataset.locale = l;
		if (l === locale) item.classList.add('active');
		function applyLocale(code) {
			window.LOCALE = code;
			localStorage.setItem('locale', code);
			current.textContent = code.toUpperCase();
			dropdown.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.locale === code));
			translateNode(code, document);
			updateDatasetTranslations();
			updateNavTranslations();
			_uiUpdaters.forEach(fn => {
				try {
					fn();
				} catch (err) {
					reportError(err);
				}
			});

			if (window.Transifex?.live?.translateTo) {
				window.Transifex.live.translateTo(code);
			}
		}

		item.onclick = e => {
			e.preventDefault();
			applyLocale(l);
		};
		dropdown.append(item);
	}

	picker.append(current, dropdown);
	nav.append(picker);

	window.addEventListener('storage', e => {
		if (e.key === 'locale' && e.newValue && e.newValue !== window.LOCALE) {
			const item = dropdown.querySelector(`a[data-locale="${e.newValue}"]`);
			if (item) item.click();
		}
	});

	updateNavTranslations();
}

function getTranslation(obj, fieldName, locale) {
	if (!obj || !fieldName) return null;

	const translationFieldName = fieldName.replace(/\./g, '_') + '_translations';
	if (obj[translationFieldName] && typeof obj[translationFieldName] === 'object') {
		const translated = obj[translationFieldName][locale];
		if (translated) return translated;
	}

	return null;
}

export function translateDatasetName(locale, dataset) {
	if (!dataset) return '';

	const translated = getTranslation(dataset, 'name_long', locale);
	if (translated) return translated;

	const categoryTranslated = getTranslation(dataset.category, 'name_long', locale);
	if (categoryTranslated) return categoryTranslated;

	return dataset?.name_long ?? dataset?.name ?? dataset?.category?.name_long ?? dataset?.category?.name ?? '';
}

export function translateDatasetAttribute(locale, dataset, attributeValue, fieldName) {
	if (!attributeValue) return '';

	if (!fieldName) return attributeValue;

	const translated = getTranslation(dataset, fieldName, locale);
	if (translated) return translated;

	return attributeValue;
}

export function translateInheritableAttribute(locale, dataset, attributeValue, fieldName) {
	if (!attributeValue) return '';

	if (!fieldName) return attributeValue;

	const translated = getTranslation(dataset, fieldName, locale);
	if (translated) return translated;

	const categoryTranslated = getTranslation(dataset?.category, fieldName, locale);
	if (categoryTranslated) return categoryTranslated;

	return attributeValue;
}

// Controls-tree tab/subbranch labels are translated from the category's
// `controls.path_translations` ({ en, fr, zh } per path element), backfilled
// alongside `controls.path` in the database. Falls back to a humanized slug.
function pathLabel(locale, translations) {
	if (translations && typeof translations === 'object') {
		const v = translations[locale] ?? translations['en'];
		if (v) return v;
	}
	return null;
}

const _reportedMissingPaths = new Set();

function reportMissingPathOnce(message) {
	if (_reportedMissingPaths.has(message)) return;
	_reportedMissingPaths.add(message);
	reportError(new Error(message));
}

export function translateCategoryName(locale, categoryName, translations) {
	if (!categoryName) return '';

	const label = pathLabel(locale, translations);
	if (label) return label;

	reportMissingPathOnce(`Missing path_translations for tab: "${categoryName}"`);
	return humanformat(categoryName);
}

export function translateSubbranchName(locale, subranchName, translations) {
	if (!subranchName) return '';

	const label = pathLabel(locale, translations);
	if (label) return label;

	reportMissingPathOnce(`Missing path_translations for subbranch: "${subranchName}"`);
	return humanformat(subranchName);
}

function humanformat(s) {
	return s
		.replace(/_/g, ' ')
		.replace(/-/g, ' ')
		.replace(/^([a-z])/, x => x.toUpperCase())
		.replace(/ ([a-z])/g, x => x.toUpperCase());
}

// Division tier labels ("District", "Ward", ...) are geography config, not DB
// rows; translated via admin_areas.<slug> keys in the UI translations CSV.
// Falls back to the raw name.
export function translateDivisionName(locale, name) {
	if (!name) return name;

	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
	const entry = window.EAE['translations']?.[`admin_areas.${slug}`];
	if (entry && locale in entry) return entry[locale];

	reportMissingPathOnce(`Missing admin_areas translation for division: "${name}"`);
	return name;
}

export function translateUnit(locale, unit) {
	if (!unit || locale === 'en') return unit;
	const entry = window.EAE['units']?.[unit];
	if (!entry || !(locale in entry)) {
		reportError(new Error(!entry
			? `Missing unit key: "${unit}"`
			: `Missing "${locale}" translation for unit: "${unit}"`,
		));
		return unit;
	}
	return entry[locale];
}

export function getScaleLabels(locale) {
	return [
		t(locale, 'left_panel.output.ramp.low'),
		t(locale, 'left_panel.output.ramp.low_medium'),
		t(locale, 'left_panel.output.ramp.medium'),
		t(locale, 'left_panel.output.ramp.medium_high'),
		t(locale, 'left_panel.output.ramp.high'),
	];
}

export function translateNode(locale, node) {
	for (const el of node.querySelectorAll('[data-t]'))
		el.textContent = t(locale, el.dataset.t);

	for (const el of node.querySelectorAll('[data-t-placeholder]'))
		el.placeholder = t(locale, el.dataset.tPlaceholder);

	for (const el of node.querySelectorAll('[data-t-description]'))
		el.setAttribute('description', t(locale, el.dataset.tDescription));

	for (const el of node.querySelectorAll('[data-t-title]'))
		el.setAttribute('title', t(locale, el.dataset.tTitle));

	for (const el of node.querySelectorAll('[data-t-html]'))
		el.innerHTML = t(locale, el.dataset.tHtml);

	if (node === document) document.documentElement.classList.add('i18n-ready');
}
