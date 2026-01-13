import { tmpl, qs } from '../lib/helpers.js';

class PanelSection extends HTMLElement {
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

		const templateId = isCollapsible ? '#panel-section-collapsible-template' : '#panel-section-template';
		const content = tmpl(templateId);
		this.innerHTML = '';
		this.appendChild(content);

		const titleGroup = qs('.card-title-group', this);
		const actionsContainer = qs('.card-actions', this);
		const bodyContainer = qs('.card-body', this);

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
}

customElements.define('panel-section', PanelSection);
export default PanelSection;
