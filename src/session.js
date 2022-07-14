import {
	generate as config_gen,
} from './config.js';

function time() {
	return (new Date()).getTime();
};

const session = {
	"time":      time(),
	"snapshots": [],
};

export function init() {
	localStorage['user-id'] = localStorage['user-id'] || uuid();

	const s = {
		"time":         session.time,
		"user_id":      localStorage['user-id'],
		"geography_id": GEOGRAPHY.id,
	};

	API.post('sessions', null, { "payload": s });
};

export function snapshot() {
	const c = config_gen();

	delete c.geography;

	const s = {
		"time":       time(),
		"session_id": session.time,
		"config":     c,
	};

	session.snapshots.push(s);

	API.post('snapshots', null, { "payload": s });
};
