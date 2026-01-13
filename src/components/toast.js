import bind from '../../lib/bind.js';
import { tmpl } from '../../lib/helpers.js';

export default class Toast extends HTMLElement {
	constructor(options) {
		super();

		const { label, caption } = options;

		const content = tmpl('#toast-notification-template');
		bind(content, { label, caption });

		this.append(content);
	}

	show() {
		document.body.append(this);

		setTimeout(() => {
			this.remove();
		}, 5000);
	}
}

customElements.define('toast-notification', Toast);
