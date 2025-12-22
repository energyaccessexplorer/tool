class ComponentCard extends HTMLElement {
	constructor() {
		super();
		this.isCollapsed = false;
	}

	static get observedAttributes() {
		return ['collapsed'];
	}

	connectedCallback() {
		this.render();
		this.isCollapsed = this.hasAttribute('collapsed');
		this.updateCollapseState();
		this.attachEventListeners();
	}

	attributeChangedCallback() {
		this.isCollapsed = this.hasAttribute('collapsed');
		this.updateCollapseState();
	}

	toggle() {
		if (!this.hasAttribute('collapsible')) return;

		if (this.isCollapsed) {
			this.removeAttribute('collapsed');
		} else {
			this.setAttribute('collapsed', '');
		}
	}

	updateCollapseState() {
		const section = this.querySelector('.card-section');
		const toggleIcon = this.querySelector('.visibility-toggle-switch');

		if (!section) return;

		if (this.isCollapsed) {
			section.setAttribute('data-collapsed', 'true');
		} else {
			section.setAttribute('data-collapsed', 'false');
		}

		if (toggleIcon) {
			toggleIcon.classList.toggle('collapsed', this.isCollapsed);
		}
	}

	attachEventListeners() {
		if (!this.hasAttribute('collapsible')) return;

		const toggleIcon = this.querySelector('.visibility-toggle-switch');
		if (toggleIcon) {
			toggleIcon.addEventListener('click', () => this.toggle());
		}
	}

	render() {
		const isCollapsible = this.hasAttribute('collapsible');
		const title = this.querySelector('[slot="title"]');
		const description = this.querySelector('[slot="description"]');
		const actions = this.querySelector('[slot="actions"]');
		const body = Array.from(this.children).filter(el => !el.hasAttribute('slot'));

		this.innerHTML = this.template(isCollapsible);

		const titleGroup = this.querySelector('.card-title-group');
		const actionsContainer = this.querySelector('.card-actions');
		const bodyContainer = this.querySelector('.card-body');

		if (title) {
			title.classList.add('card-title', 'section-title');
			titleGroup.appendChild(title);
		}
		if (description) {
			description.classList.add('card-description', 'section-subtitle');
			titleGroup.appendChild(description);
		}

		if (actions) {
			actionsContainer.insertBefore(actions, actionsContainer.firstChild);
		}

		body.forEach(el => bodyContainer.appendChild(el));
	}

	template(isCollapsible) {
		return `
			<div class="card-section" data-collapsed="false">
				<div class="card-header">
					<div class="card-title-group"></div>
					<div class="card-actions">
						${isCollapsible ? '<i class="bi bi-chevron-down visibility-toggle-switch"></i>' : ''}
					</div>
				</div>
				<div class="card-body"></div>
			</div>
		`;
	}
}

customElements.define('component-card', ComponentCard);
export default ComponentCard;
