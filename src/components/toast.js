export default class Toast extends HTMLElement {
	constructor(options) {
		super();

		const { label, caption } = options;

		this.innerHTML = `
			<div class="toast-icon">
				<i class="bi bi-check-circle-fill"></i>
			</div>
			<div class="toast-content">
				<header class="toast-header">
					<h1 class="toast-label">${label}</h1>
					<p class="toast-caption">${caption}</p>
				</header>
				<footer class="toast-footer">
					<div>
						<slot name="action"></slot>
					</div>
				</footer>
			</div>
		`;
	}

	show() {
		document.body.append(this);

		setTimeout(() => {
			this.remove();
		}, 5000);
	}
}

customElements.define('toast-notification', Toast);
