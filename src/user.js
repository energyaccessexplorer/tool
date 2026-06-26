import modal from '../lib/modal.js';

import {
	maybe,
} from '../lib/helpers.js';

import { t } from './translate.js';

export function register_login() {
	const d = document.createElement('div');
	const p1 = document.createElement('p');
	const p2 = document.createElement('p');

	p1.innerText = t(window.LOCALE, 'auth.prompt');
	p2.innerHTML = `
<div style="display: flex; justify-content: space-around;">
	<a href="/login">Login</a>
	<a href="/subscribe/?select=account">Register</a>
</div>
`;

	d.append(p1, p2);

	const m = new modal({
		"header":  t(window.LOCALE, 'auth.register_login'),
		"content": d,
	});

	m.show();
};

export function extract(...path) {
	const token = localStorage.getItem('token');

	if (!token) return null;

	try {
		return maybe(jwt_decode(token), ...path);
	} catch (e) {
		console.warn(e);
		return null;
	}
};
