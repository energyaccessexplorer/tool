# DOM Manipulation Refactoring Prompts

This document contains step-by-step prompts for refactoring DOM manipulation from inline HTML strings and `createElement` calls to use templates in `views/a.tmpl`.

## Important Notes
- Test each refactor individually before moving to the next
- Create separate commits for each refactor
- Follow the naming convention: use `-template` suffix for template IDs
- Use kebab-case for template names (e.g., `toast-notification-template`)

---

## Refactor 1: Toast Component

**Files to modify:**
- `views/a.tmpl`
- `src/components/toast.js`

**Prompt:**
```
Refactor the Toast component in src/components/toast.js to use a template instead of inline HTML.

1. Add a new template to views/a.tmpl with id="toast-notification-template" containing:
   - toast-icon div with check icon
   - toast-content div with:
     - toast-header containing toast-label (h1) and toast-caption (p)
     - toast-footer with slot for action button

2. Update src/components/toast.js:
   - Import tmpl and bind from helpers
   - Replace innerHTML assignment with tmpl('#toast-notification-template')
   - Use bind() to populate label and caption data

Test: Verify toast notifications still appear when saving/sharing analysis.
```

---

## Refactor 2: Session Modals

**Files to modify:**
- `views/a.tmpl`
- `src/session.js`

**Prompt:**
```
Refactor three modal dialogs in src/session.js to use templates:

1. Add request-authentication-modal-template to views/a.tmpl:
   - content: paragraph with authentication message
   - footer: "Create account" link and "Sign in" link buttons

2. Add saved-analysis-modal-template to views/a.tmpl:
   - content: message paragraph + saved-analysis-info div with:
     - saved-analysis-name (bookmark icon + title span)
     - saved-analysis-last-viewed (date text)
   - footer: "Update saved analysis" and "Save as new analysis" buttons with bind-listen/bind-func

3. Add edit-title-form-template to views/a.tmpl:
   - content: form with text-input for title (with label and hint)
   - footer: submit button

4. Update src/session.js:
   - Import tmpl, qs, and bind
   - Refactor request_authentication() to use template
   - Refactor saved_analysis_modal() to use template and bind for data/callbacks
   - Refactor edit_title() to use template and bind for initial value

Test: Verify save/share workflow still works, including authentication prompts.
```

---

## Refactor 3: Right Panel Discrete Scale Items

**Files to modify:**
- `views/a.tmpl`
- `src/right-panel.js`

**Prompt:**
```
Refactor the discrete scale items in src/right-panel.js to use a template:

1. Add discrete-scale-item-template to views/a.tmpl containing:
   - scale-item div with:
     - dt.scale-item-label containing:
       - scale-item-spacer div with scale-circle span (bind-init for color)
       - label span
     - dd.scale-item-value for the value

2. Update update_graph_section() in src/right-panel.js:
   - Import tmpl and bind if not already imported
   - Replace ce() calls with tmpl('#discrete-scale-item-template')
   - Use bind() with color (as init function), label, and value

Test: Verify analysis graphs show correctly with colored scale items.
```

---

## Refactor 4: Component Card to Panel Section

**Files to modify:**
- `src/components/card.js` → `src/panel-section.js`
- `views/a.tmpl`
- `stylesheets/cards.css`
- `makefile`

**Prompt:**
```
Refactor and rename ComponentCard to PanelSection, move to src/, and use template:

1. Add panel-section-template to views/a.tmpl containing:
   - card-section div with card-header and card-body
   - card-header contains card-title-group and card-actions
   - card-body is empty (will be populated dynamically)

2. Move src/components/card.js to src/panel-section.js:
   - Rename class from ComponentCard to PanelSection
   - Import tmpl, qs, ce from helpers
   - Replace template() method innerHTML string with tmpl('#panel-section-template')
   - Update customElements.define to 'panel-section'
   - Update import paths (now in src/ not src/components/)

3. Update views/a.tmpl:
   - Change import from './components/card.js' to './panel-section.js'
   - Replace <component-card> tags with <panel-section> in analysis-locations-template

4. Update stylesheets/cards.css:
   - Replace all 'component-card' selectors with 'panel-section'

5. Update makefile:
   - Add ${SRC}/panel-section.js to the cp list (around line 165)
   - Remove the entire @ cp block for components/card.js and components/toast.js

Test: Verify collapsible sections in right panel still work.
```

---

## Refactor 5: Analysis Search Location Items and Pagination

**Files to modify:**
- `views/a.tmpl`
- `src/analysis-search.js`

**Prompt:**
```
Refactor location items, groups, and pagination in src/analysis-search.js to use templates:

1. Add location-item-template to views/a.tmpl:
   - li.location-item containing location-item-content div with:
     - crosshair icon
     - location-info div with location-name and location-coordinates (both bound)
     - chevron-right icon

2. Add location-group-template to views/a.tmpl:
   - li.location-group with:
     - location-group-header div (score-text span and area-count badge, both bound)
     - location-group-list ul (empty, populated dynamically)

3. Add pagination-template to views/a.tmpl:
   - pagination-container div with:
     - pagination-info div (bound for info text)
     - pagination div (empty, populated with buttons dynamically)

4. Update src/analysis-search.js:
   - Import tmpl and bind
   - Refactor li() function to use location-item-template
   - Refactor location group creation in render_page() to use location-group-template
   - Refactor render_pagination() to use pagination-template for container

Test: Verify "High priority areas" section shows locations with pagination working.
```

---

## Refactor 6: Move Toast to src/

**Files to modify:**
- `src/components/toast.js` → `src/toast.js`
- `src/session.js`
- `makefile`

**Prompt:**
```
Move toast.js from src/components/ to src/ for consistency:

1. Move src/components/toast.js to src/toast.js

2. Update src/toast.js:
   - Change import paths from '../../lib/' to '../lib/'

3. Update src/session.js:
   - Change import from './components/toast.js' to './toast.js'

4. Update makefile:
   - Add ${SRC}/toast.js to the cp list (after panel-section.js, around line 166)

Test: Verify toast notifications still work after save/share actions.
```

---

## Testing Checklist

After completing all refactors, test the following functionality:

- [ ] Toast notifications appear when saving/sharing analysis
- [ ] Authentication modal shows when not logged in
- [ ] Save analysis modal works (title input, save/update)
- [ ] Analysis graphs display with colored scale legends
- [ ] Right panel sections are collapsible
- [ ] High priority areas list displays with locations
- [ ] Pagination works for location results
- [ ] Clicking locations zooms map
- [ ] Hovering locations shows info popup

---

## Rollback Instructions

If any refactor breaks functionality:

```bash
git reset --hard HEAD
git clean -fd
```

Then start over from the specific refactor that failed.
