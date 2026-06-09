import bind from '../lib/bind.js';

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
};

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
		};
		dropdown.append(item);
	}

	picker.append(current, dropdown);
	nav.append(picker);
}

export function translateDatasetName(_locale, dataset) {
	return dataset?.name ?? '';
}

export function translateDatasetAttribute(_locale, _dataset, attribute) {
	return attribute ?? '';
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
