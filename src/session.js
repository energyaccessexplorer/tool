import {
	generate as config_gen,
} from './config.js';

import {
	logged_in as user_logged_in,
} from './user.js';

const snapshot_id = (new URL(location)).searchParams.get('snapshot');

const session = {};

export function init() {
	const user_id = user_logged_in();

	if (!user_id) {
		console.info("User not logged in.");
		return;
	}

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

	if (!user_id) return;
	if (snapshot_id) return;

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
