import bind from '../lib/bind.js';
import { refreshControlsUI } from './controls.js';

export function esc(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;');
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

const LOCALE_LABELS = {
	"en": "English",
	"fr": "Français",
	"zh": "中文",
};

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
	refreshControlsUI(window.LOCALE);
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

	const picker = document.createElement('div');
	picker.id = 'locale-picker';

	const current = document.createElement('span');
	current.id = 'locale-current';
	current.textContent = locale.toUpperCase();

	const dropdown = document.createElement('div');
	dropdown.id = 'locale-dropdown';

	for (const [l, label] of Object.entries(LOCALE_LABELS)) {
		const item = document.createElement('a');
		item.href = '#';
		item.textContent = label;
		item.dataset.locale = l;
		if (l === locale) item.classList.add('active');
		item.onclick = e => {
			e.preventDefault();
			window.LOCALE = l;
			localStorage.setItem('locale', l);
			current.textContent = l.toUpperCase();
			dropdown.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.locale === l));
			translateNode(l, document);
			updateDatasetTranslations();
		};
		dropdown.append(item);
	}

	picker.append(current, dropdown);
	nav.append(picker);
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

	const categoryTranslated = getTranslation(dataset?.category, fieldName, locale);
	if (categoryTranslated) return categoryTranslated;

	return attributeValue;
}

export function translateCategoryName(locale, categoryName) {
	if (!categoryName) return '';

	return t(locale, `controls.path.tab.${categoryName}`);
}

export function translateSubbranchName(locale, subranchName) {
	if (!subranchName) return '';

	const key = `controls.path.subbranch.${subranchName}`;
	const entry = window.EAE['translations']?.[key];

	if (entry) {
		return t(locale, key);
	}

	reportError(new Error(`Missing subbranch translation key: "${key}"`));
	return humanformat(subranchName);
}

function humanformat(s) {
	return s
		.replace(/_/g, ' ')
		.replace(/-/g, ' ')
		.replace(/^([a-z])/, x => x.toUpperCase())
		.replace(/ ([a-z])/g, x => x.toUpperCase());
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

export function translateNode(locale, node) {
	for (const el of node.querySelectorAll('[data-t]'))
		el.textContent = t(locale, el.dataset.t);

	for (const el of node.querySelectorAll('[data-t-placeholder]'))
		el.placeholder = t(locale, el.dataset.tPlaceholder);

	for (const el of node.querySelectorAll('[data-t-description]'))
		el.setAttribute('description', t(locale, el.dataset.tDescription));

	for (const el of node.querySelectorAll('[data-t-html]'))
		el.innerHTML = t(locale, el.dataset.tHtml);
}
