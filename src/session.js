import modal from '../lib/modal.js';

import {
	generate as config_gen,
} from './config.js';

import {
	extract as user_extract,
	register_login,
} from './user.js';

const url = new URL(location);

function saved_analysis_modal(s, updateCallback, saveAsNewCallback) {
	const content = document.createDocumentFragment();

	const message = document.createElement('p');
	message.textContent = 'You are currently viewing an analysis already saved to your My EAE account. You can either update your existing saved analysis, or save your changes as a new analysis.';

	const infoBox = document.createElement('div');
	infoBox.className = 'saved-analysis-info';

	const nameRow = document.createElement('div');
	nameRow.className = 'saved-analysis-name';

	const bookmarkIcon = document.createElement('i');
	bookmarkIcon.className = 'bi bi-bookmark-fill';

	const nameText = document.createElement('span');
	nameText.textContent = s.title || 'Untitled Analysis';

	nameRow.append(bookmarkIcon, nameText);

	const lastViewedText = document.createElement('div');
	lastViewedText.className = 'saved-analysis-last-viewed';
	const lastViewedDate = new Date(s.time);
	lastViewedText.textContent = `Last viewed on ${lastViewedDate.toLocaleDateString()}.`;

	infoBox.append(nameRow, lastViewedText);

	content.append(message, infoBox);

	const updateButton = document.createElement('button');
	updateButton.className = 'button primary-button';
	updateButton.textContent = 'Update saved analysis';

	const saveAsNewButton = document.createElement('button');
	saveAsNewButton.className = 'button secondary-button';
	saveAsNewButton.textContent = 'Save as new analysis';

	const footer = document.createDocumentFragment();
	footer.append(updateButton, saveAsNewButton);

	const m = new modal({
		"header":  "Save analysis to My EAE",
		"content": content,
		"footer":  footer,
	});

	updateButton.onclick = () => {
		m.remove();
		updateCallback();
	};

	saveAsNewButton.onclick = () => {
		m.remove();
		saveAsNewCallback();
	};

	m.show();
}

function edit_title(s, callback) {
	const i = document.createElement('input');
	const f = document.createElement('form');
	const x = document.createElement('button');

	i.value = s.title ?? "";
	i.setAttribute('required', '');
	i.className = 'text-input';

	const label = document.createElement('label');
	label.className = 'text-input-label required';
	label.textContent = 'Analysis title';

	const hint = document.createElement('div');
	hint.className = 'text-input-hint';
	hint.textContent = 'Enter a memorable name for the current configuration.';

	const labelWrapper = document.createElement('div');
	labelWrapper.className = 'text-input-wrapper';
	labelWrapper.append(label, hint);

	const fieldWrapper = document.createElement('div');
	fieldWrapper.className = 'field-wrapper';
	fieldWrapper.append(i);

	f.id = "save-analysis";
	f.className = 'save-analysis-form';
	f.append(labelWrapper, fieldWrapper);

	x.type = "submit";
	x.innerText = "Save analysis";
	x.className = 'primary-button';
	x.setAttribute('form', 'save-analysis');
	x.disabled = i.value.trim() === '';

	i.addEventListener('input', () => {
		x.disabled = i.value.trim() === '';
	});

	const m = new modal({
		"header":  "Save analysis to My EAE",
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
		register_login();
		return;
	}

	const snapshot_id = url.searchParams.get('snapshot');

	const config = config_gen();

	delete config.geography;

	function patch() {
		API.patch('snapshots', { "time": `eq.${snapshot_id}` }, { "payload": { config } })
			.then(_ => FLASH.push({ "title": "Updated Analysis", "type": "success" }));

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

			API.post('snapshots', null, { "payload": s })
				.then(_ => FLASH.push({ "title": "Created Analysis", "type": "success" }))
				.then(_ => url.searchParams.set('snapshot', s['time']))
				.then(_ => history.replaceState(null, null, url))
				.then(_ => typeof callback === 'function' ? callback() : _);
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
