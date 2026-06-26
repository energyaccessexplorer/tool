import modal from '../lib/modal.js';
import Toast from './toast.js';

import {
	generate as config_gen,
} from './config.js';

import {
	extract as user_extract,
} from './user.js';

import {
	qs,
	tmpl,
} from '../lib/helpers.js';

import {
	loading,
} from './utils.js';

import bind from '../lib/bind.js';
import { t, translateNode } from './translate.js';

const url = new URL(location);

function show_save_toast(label, caption) {
	const toast = new Toast({ label, caption });
	toast.append(tmpl('#toast-save-action-template'));
	toast.show();
}

function request_authentication() {
	const template = tmpl('#request-authentication-modal-template');
	const children = Array.from(template.children);

	const content = children[0];
	const footer = document.createDocumentFragment();
	footer.append(...children.slice(1));

	translateNode(window.LOCALE, template);

	const m = new modal({
		"header":  t(window.LOCALE, 'modals.save_analysis.header'),
		"content": content,
		"footer":  footer,
	});

	m.show();
}

function saved_analysis_modal(s, updateCallback, saveAsNewCallback) {
	const lastViewedDate = new Date(s.time);
	const lastViewed = t(window.LOCALE, 'modal.save_analysis.last_viewed', { "date": lastViewedDate.toLocaleDateString() });

	const template = tmpl('#saved-analysis-modal-template');

	bind(template, {
		"title":        s.title || t(window.LOCALE, 'modal.save_analysis.untitled_analysis'),
		"last-viewed":  lastViewed,
		"update":       () => {
			m.remove();
			updateCallback();
		},
		"saveAsNew":    () => {
			m.remove();
			saveAsNewCallback();
		},
	});

	translateNode(window.LOCALE, template);

	const children = Array.from(template.children);
	const content = document.createDocumentFragment();
	content.append(children[0], children[1]);

	const footer = document.createDocumentFragment();
	footer.append(...children.slice(2));

	const m = new modal({
		"header":  t(window.LOCALE, 'modals.save_analysis.header'),
		"content": content,
		"footer":  footer,
	});

	m.show();
}

function edit_title(s, callback) {
	const template = tmpl('#edit-title-form-template');
	translateNode(window.LOCALE, template);
	const children = Array.from(template.children);

	const f = children[0];
	const i = qs('input', f);
	const x = children[1];

	i.value = s.title ?? "";
	x.disabled = i.value.trim() === '';

	i.addEventListener('input', () => {
		x.disabled = i.value.trim() === '';
	});

	const m = new modal({
		"header":  t(window.LOCALE, 'modals.save_analysis.header'),
		"content": f,
		"footer":  x,
	});

	f.onsubmit = function(e) {
		e.preventDefault();
		m.remove();

		s.title = i.value;

		callback();

		return false;
	};

	m.show();

	i.focus();
};

export function snapshot(callback) {
	const user_id = user_extract('id');

	if (!user_id) {
		request_authentication();
		return;
	}

	const snapshot_id = url.searchParams.get('snapshot');

	const config = config_gen();

	delete config.geography;

	function with_timeout(promise, ms = 10000) {
		const timeout = new Promise((_, reject) =>
			setTimeout(() => reject(new Error('Request timed out')), ms),
		);
		return Promise.race([promise, timeout]);
	}

	function patch() {
		loading(t(window.LOCALE, 'session.saving'));
		with_timeout(API.patch('snapshots', { "time": `eq.${snapshot_id}` }, { "payload": { config } }))
			.then(r => {
				if (r) show_save_toast(t(window.LOCALE, 'modal.save_analysis.updated_toast'), t(window.LOCALE, 'modal.save_analysis.updated_toast_caption'));
			})
			.catch(err => {
				const toast = new Toast({ "label": 'Save failed', "caption": err.message, "variant": 'error' });
				toast.show();
			})
			.finally(() => loading(false));

		return snapshot_id;
	};

	function post() {
		const s = {
			"time":         (new Date()).getTime(),
			"geography_id": GEOGRAPHY.id,
			"env":          ENV[0],
			user_id,
			config,
			"title":        SNAPSHOT?.title,
		};

		edit_title(s, _ => {
			SNAPSHOT = s;

			loading(t(window.LOCALE, 'session.saving'));
			with_timeout(API.post('snapshots', null, { "payload": s }))
				.then(r => {
					if (!r) return;
					show_save_toast(t(window.LOCALE, 'modal.save_analysis.saved_toast'), t(window.LOCALE, 'modal.save_analysis.saved_toast_caption'));
					url.searchParams.set('snapshot', s['time']);
					history.replaceState(null, null, url);
					if (typeof callback === 'function') callback();
				})
				.catch(err => {
					const toast = new Toast({ "label": 'Save failed', "caption": err.message, "variant": 'error' });
					toast.show();
				})
				.finally(() => loading(false));
		});

		return s['time'];
	};

	if (snapshot_id && SNAPSHOT.user_id === SELF.id) {
		saved_analysis_modal(
			SNAPSHOT,
			() => {
				patch();
			},
			() => {
				post();
			},
		);
		return snapshot_id;
	} else {
		return post();
	}
};
