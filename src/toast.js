import bind from '../lib/bind.js';
import { tmpl } from '../lib/helpers.js';

export default class Toast extends HTMLElement {
	constructor(options) {
		super();

		const { label, caption, variant } = options;

		const templateId = variant === 'error' ? '#toast-error-template' : '#toast-notification-template';
		const content = tmpl(templateId);
		bind(content, { label, caption });

		if (variant === 'error') this.classList.add('error');

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

export function show_error(title, caption) {
	new Toast({ "label": title, "caption": caption ?? '', "variant": 'error' }).show();
}
