import modal from '../lib/modal.js';

import {
	generate as config_gen,
} from './config.js';

import {
	logged_in as user_logged_in,
	register_login,
} from './user.js';

const snapshot_id = (new URL(location)).searchParams.get('snapshot');

const session = {};

function set_name(s) {
	const i = document.createElement('input');
	const f = document.createElement('form');

	i.setAttribute('required', '');

	i.style = `
font-size: 1.2em;
padding: 7px 12px;
`;

	f.append(i);

	const m = new modal({
		"header":  "Set Title",
		"content": f,
	});

	f.onsubmit = function(e) {
		e.preventDefault();

		m.remove();

		API.patch('sessions', { "time": `eq.${s.time}` }, { "payload": {
			"title": i.value,
		}});

		return false;
	};

	m.show();

	i.focus();
};

export function init() {
	const user_id = user_logged_in();

	if (!user_id) return;

	if (snapshot_id) {
		console.info("Revisiting snapshot.");
		return;
	}

	session.time = (new Date()).getTime();
	session.snapshots = [];

	API.post('sessions', null, { "payload": {
		"time":         session.time,
		"user_id":      user_id,
		"geography_id": GEOGRAPHY.id,
	}});
};

export function snapshot() {
	const user_id = user_logged_in();

	if (!user_id) {
		register_login();
		return;
	}

	if (snapshot_id) return;

	if (!session.title) set_name(session);

	const c = config_gen();

	delete c.geography;

	const s = {
		"time":       (new Date()).getTime(),
		"session_id": session.time,
		"config":     c,
	};

	session.snapshots.push(s);

	API.post('snapshots', null, { "payload": s });
};
