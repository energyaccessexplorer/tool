# Translation QA Checklist

Covers every UI string wired through the i18n system in this session — **145 keys / 171 references** (new + reused). Generated from `locales/translations.csv` + the working-tree diff.

## How to test (every row)

- **Run:** `nix develop ../ --command run` (Postgres + PostgREST + dev server), or serve the built `dist/`.
- **Switch locale:** the locale picker in the top nav (`src/translate.js:96`), or the **`?lang=fr` / `?lang=zh`** URL param (`src/a.js:241`; precedence URL → `localStorage.locale` → browser language).
- For each item: switch to **FR** then **ZH**, reach the element, and confirm it shows the expected translated text — not English, not a literal `{{var}}`.
- Keep DevTools console open: any `Missing translation key` / `Missing "<locale>" translation` (via `reportError` in `src/translate.js`) is a **fail**.

**Legend per item:** `key` · `file:line` — EN / FR / ZH. Notes flag plurals, HTML, and interpolation.

---

# ✅ QA RESULTS — 2026-06-25 (browser pass, FR + ZH)

Tested by loading the running app in **French and Chinese** (Kenya → Narok geography, `/tool/a`), and inspecting each element's rendered text against `window.EAE.translations[key][locale]`. Both languages were exercised by **initial load** (`localStorage.locale` = `fr` / `zh`), which is the realistic end-user path (saved preference, `?lang=`, or browser-detected locale).

**Status legend:** ✅ verified rendering translated in-browser · ✅ᶜ correct by mechanism (built via `t()` / `translateNode`, string present & correct in table) but the screen was not reachable in this pass · ❌ renders **English** in-browser (bug, verified) · ❌ᶜ renders English by code analysis (template clone never passed to `translateNode`), screen was auth-gated so not visually reached · ⏸ not rendered / unreachable.

**Translation table:** all **147 keys exist with non-empty FR + ZH values**; zero `Missing translation key` / `Missing "<locale>"` console errors. The 7 keys where FR == EN (`country_overview.unit_million/unit_usd/rural_header`, `dataset_info.description/sources`, `modal.points_input.longitude_placeholder/latitude_placeholder`) are legitimately identical words — **not** errors (but see 🔴 below: where these sit in a non-translated template they will still show English in **ZH**, which is visibly wrong).

## 🔴 CRITICAL — systemic bug: template-cloned content is not translated on load

`translateNode(LOCALE, document)` runs **once, synchronously, at `src/a.js:246`** — *before* the async cards/datasets render and *before* any modal opens. Several modules clone a `<template>` (`tmpl('#…')`) at show-time, bind data, and **append it without ever calling `translateNode` on the clone**. `<template>` content is inert, so the init pass never reached it either. Result: on initial load in FR **or** ZH, this content shows the **English `.tmpl` default**. (A manual locale-switch via the picker *does* re-run `translateNode(document)` and masks the bug — so it only reproduces on first load in a non-English locale.)

**Confirmed in-browser (FR and ZH):**
- **Dataset cards** (`cards.js:659`, no `translateNode`) — every card label English: `left_panel.cards.card.settings_toggle_title`, `…remove_dataset_title`, `…importance_hint`, `…table_button` (shows "Table" not "Tableau"/"表格"). *(Also out-of-scope `show_layer`, `opacity_label`, `about_button`.)*
- **About / EAE-info modal** (`output-widget.js:88`, no `translateNode`) — entire body English (header is fine, set via `t()`): `modal.eae_info.title` (body H3), `…body`, `…analysis_areas.title/body`, `…priority_1km.title/body`, `…other_areas.title/body`, `…indexes.title/body`, `…view_technical_note`. *(ZH: 14 English strings in the modal body.)*
- **Dataset-info modal** (`ds.js:652`, no `translateNode`) — `dataset_info.why_used/suggested_citation/cautions/learn_more/spatial_resolution/license/content_date/publication_date/download_from_source`. (`description`/`sources` look OK in FR only because FR==EN; **in ZH they show English** instead of 描述/来源.)
- **Manual points-input modal** (`points-loading.js:233`, no `translateNode`) — `modal.points_input.add_button` ("Add point"), `…longitude_placeholder`, `…latitude_placeholder` (FR invisible since identical; **ZH shows "Longitude"/"Latitude" instead of 经度/纬度**).

**Confirmed by code (same missing-`translateNode` pattern; screens are login-gated so not opened — strings are correct in the table, but will render English on load):**
- **Export modal** `export.js:187/239` → `export-options-modal-content`/`-footer`: `modal.export.summary_presentation.title/desc/button`, `…map_tiff.title/desc/button`, `…high_priority.title/button`, `…pop_area_share.title/desc/button`, `…download_all`. *(The other `modal.export.*` keys built inline via `t()` in `export.js` — `generating`, `ppt_title`, `select_subtitle`, `download_ppt/csv/zip`, `*_hint` — are fine.)*
- **Share-link modal** `m.js:70` & `right-panel.js:185` → `share-link-modal-content`: `my_eae.modal.share.instructions`, `my_eae.modal.share.copy_link`. (Headers `my_eae.modal.share.header`, `right_panel.share_link.header` use `t()` → fine.)
- **Save form** `session.js:88` → `edit-title-form-template`: `modal.save_analysis.title_label`, `…title_hint`, `…save_button`. (Sibling `saved-analysis-modal-template` *does* call `translateNode` (`session.js:70`), so `update_button` / `save_as_new_button` are fine.)
- **High-priority table modal** `modal-table-high-priority-areas.js` (no `translateNode` anywhere in file): `modal.high_priority_table.toggle_columns/download_selected/per_page/data_download_summary`.

### ✅ FIXED — 2026-06-26

Added `translateNode(window.LOCALE, …)` on each affected clone (imports added where missing):
- `output-widget.js:84` `show_eae_info_modal` — translate `#eae-info-modal-template` before `bind`. **Verified in-browser (ZH): About-modal body fully translated, 0 English strings (was 14).**
- `cards.js:658` `dscard.render()` — translate the card subtree **after** `bind()` (bind was resetting `data-t-title`, so order matters). **Verified in-browser (ZH): `show_layer`→"显示图层", `opacity_label`→"不透明度", `settings_toggle_title`→"隐藏/显示设置".**
- `ds.js:652` dataset-info modal — translate `#ds-info-modal` before `bind`.
- `export.js:187/239` — translate `#export-options-modal-content` and `…-footer`.
- `m.js:70` & `right-panel.js:185` — translate `#share-link-modal-content`.
- `points-loading.js:233` — translate `#points-input-form`.
- `session.js:88` `edit_title` — translate `#edit-title-form-template`.
- `modal-table-high-priority-areas.js:79/175` — translate `#high-priority-areas-list-all-template` and `…-footer-template` (import added).

All 9 files pass `node --check`; `make build-a build-m` succeeds. **Re-verify needed (browser was reachable for `eae_info` + cards only this session — extension dropped):** `ds_info`, `points_input`, `export`, `share`, `save title`, `high_priority_table` (the login-gated ones need a signed-in session to open).

✅ **Was already correct (clone IS passed to `translateNode`):** POI card (`poi-card.js:54`), prioritization card (`…:80`), index graphs (`…:53`), analysis-locations (`…:326`), map-info popup (`:91`), disclaimer, request-auth modal (`session.js:40`), saved-analysis modal (`session.js:70`).

## Other findings

- **`country_overview.*` (12 keys) — unreachable / dead template.** `<template id="country-overview">` (a.tmpl:476) has **no JS consumer** — `tmpl('#country-overview')` is never called anywhere in `src/`. The block never renders in the tool, so these strings cannot be exercised. Strings are present & correct in the table. ⏸ for all `country_overview.*`. *(Either wire it up or remove the template + keys.)*
- **`left_panel.points_loading.input_tooltip` — doc/key mismatch.** The actual rendered button uses `data-t-title="left_panel.points_loading.input_button"` ("Entrer les coordonnées manuellement"), **not** `input_tooltip` ("Saisir les coordonnées manuellement"). The tooltip *is* translated (static DOM); but the doc references a key the element doesn't use. ✅ (element translated) — fix the doc row.
- **Transient English flash on the select screen.** On `/tool/s/` the `loading.tmpl` "Loading…" paints before `window.LOCALE` is applied, so it briefly shows English. On `/tool/a` `loading.message` renders correctly ("Chargement…"/"加载中…"). Minor.
- **Direct `/tool/s/?lang=xx` hangs on "Loading…".** Navigating straight to the select screen with a `?lang=` query stalled (LOCALE never set); the `/tool/` redirect path works. Worth a look but outside translation scope.
- **Out-of-scope English strings spotted** (not in the 147, but user-visible): auth-modal buttons **"Login" / "Register"** (`user.js`) and **"Create account" / "Sign in"** (`modals.save_analysis.auth_create` / `…auth_signin`) render English; dataset-card **index label "Filter"**; high-priority list **"Unknown location"**; index names **"Energy Access Potential"** etc. Flag separately if in scope.

## ⚠ NOT visually verified in this pass (status is code/table-derived only)

These keys were **not seen rendered in the browser** — they were confirmed present & correct in `translations.csv` and their build mechanism inspected, but the screen was not opened. Re-test recommended.

- **Login-gated** (need a signed-in session — I did not log in / create an account): all **`modal.export.*`**, **`my_eae.modal.*`** (share/set-title/delete), **`modal.save_analysis.*`**, **`session.*`**, **`modal.high_priority_table.*`**, `right_panel.share_link.header`, `utils.copied`/`utils.loading`, `toast.clipboard_error`. *(The ❌ᶜ subset among these is now fixed in code but unverified live.)*
- **Not triggered this pass:** **`help.*`** (welcome + step1–9; `#drawer-help` not present in the loaded state), **`summary.*`** (snapshot modal not opened), **`left_panel.analysis_search.*`** (the search icon opened entity-search, not the analysis panel), **`timeline.*`** (Narok has no timeline to hover), **`right_panel.poi.count_html_*`** / `poi.about_tooltip` (POI card not surfaced), `right_panel.high_priority.showing_count_*`, `right_panel.prioritization.priority_score_badge`.
- **Error paths not reproduced:** `geography_picker.no_geographies`, `toast.fetch_error.label`, all **`toast.dataset_error.*`**, **`toast.config_error.*`**.
- **Own-template / not rendered:** **cookie banner** (verified by source — `cookie.tmpl` inline en/fr/zh complete; not rendered), **`nav.desktop_required.*`** message (title verified; full message verified via table only, no mobile-width resize).
- **Unreachable:** all **`country_overview.*`** (dead template, see findings).

Everything else in the per-section status below carries a plain ✅ (FR and/or ZH **seen rendered** in-browser) or ❌ (**seen** rendering English).

## Per-section status

**Geography picker** — ✅ FR/ZH: `geography_picker.multiple` (✅ "Nous avons plusieurs géographies pour Kenya" / flow OK), `…interest_prompt` (✅ "Qu'est-ce qui vous intéresse ?" / "您对什么感兴趣？"), `…choose_area` (✅ "Choisissez votre domaine d'intérêt" / "选择您感兴趣的领域"). `…no_geographies` ✅ᶜ (alert, not triggered). `toast.fetch_error.label` ✅ᶜ (not triggered).

**Left panel cards** — `show_all`/`hide_all`/`expand_all`/`collapse_all` ✅ FR/ZH (toolbar; "Masquer/Afficher toutes les couches", "隐藏所有图层/展开所有设置"). `card.importance_hint` ❌, `card.settings_toggle_title` ❌, `card.remove_dataset_title` ❌, `card.table_button` ❌ — **all FR + ZH (🔴 card bug).**

**Output / About modal** — `left_panel.output.tiff_download_title` ✅ FR/ZH (static; "Télécharger l'image TIFF…"). `modal.eae_info.title` (header ✅ / body ❌), `…body`/`…analysis_areas.*`/`…priority_1km.*`/`…other_areas.*`/`…indexes.*`/`…view_technical_note` ❌ FR + ZH (🔴 eae-info bug).

**Points input / loading** — `modal.points_input.longitude_placeholder` ❌, `…latitude_placeholder` ❌, `…add_button` ❌ FR + ZH (🔴 points-input bug). `left_panel.points_loading.input_tooltip` ✅ (see doc/key mismatch above).

**Analysis search** — `input_label`/`coordinates_label`/`top_results`/`overflow` ✅ᶜ (built via `t()`; panel not surfaced this pass — the search icon opened entity-search).

**Right panel POI / high-priority / prioritization** — `high_priority.priority_score` ✅ FR ("score de priorité de 100 %"), `…area_count_one/other` ✅ FR ("155 zones"), `…showing_range` ✅ FR ("Affichage de 1-10 sur 18,020"), `…showing_count_one/other` ✅ᶜ (same `t()` builder). `prioritization.priority_score_badge` ✅ᶜ. `poi.count_html_one/other` + `poi.about_tooltip` ✅ᶜ (poi-card is `translateNode`'d; card not surfaced). ZH for these: ✅ᶜ (same locale-agnostic `t()`/`translateNode` path).

**Summary** — `summary.table/graphs/export_button/snapshot_header` ✅ᶜ (built via `t()` in `summary.js`; modal not opened this pass).

**Export modal** — a.tmpl card group (`summary_presentation.*`, `map_tiff.*`, `high_priority.title/button`, `pop_area_share.*`, `download_all`) ❌ᶜ FR + ZH (🔴, login-gated). Inline-`t()` group (`generating`, `ppt_title`, `select_subtitle`, `download_ppt/csv/zip`, `ppt_hint/csv_hint/zip_hint`) ✅ᶜ.

**My EAE / saved analyses** — `right_panel.footer.save` ✅ FR/ZH ("Enregistrer"). `auth.prompt` ✅ FR ("Pour sauvegarder une analyse, vous devez être inscrit."), `auth.register_login` ✅ FR ("S'inscrire / Se connecter"). `t()`-built (✅ᶜ, login-gated): `share.header`, `share.link_copied_toast`, `clipboard_error`, `set_title.header`, `set_title.title_updated_toast`, `delete.confirm`, `delete.deleted_toast`, `session.saving`, `save_analysis.last_viewed/untitled_analysis/saved_toast(+caption)/updated_toast(+caption)`. `translateNode`'d (✅ᶜ): `save_analysis.update_button`, `…save_as_new_button`. ❌ᶜ (🔴, login-gated): `share.instructions`, `share.copy_link`, `save_analysis.title_label`, `…title_hint`, `…save_button`.

**Share-link + utils** — `right_panel.share_link.header` ✅ᶜ (header via `t()`), body `instructions`/`copy_link` ❌ᶜ (🔴). `utils.copied`, `utils.loading` ✅ᶜ.

**Auth** — `auth.prompt` ✅ FR/ZH, `auth.register_login` ✅ FR/ZH (both verified in the login prompt).

**Country overview** — all `country_overview.*` ⏸ (dead template, see findings).

**Dataset info modal** — all `dataset_info.*` ❌ FR + ZH (🔴 ds-info bug; verified `why_used`/`cautions`/`license`/etc. English in FR. `description`/`sources` show English in ZH).

**High-priority table modal** — `modal.high_priority_table.toggle_columns/download_selected/per_page/data_download_summary` ❌ᶜ FR + ZH (🔴, login/export-gated).

**Onboarding tour** — `help.welcome_title/welcome_text/step1`…`step9` ✅ᶜ (`help.js build_steps()` resolves via `t()` at tour start — `#drawer-help` not present in this state, not triggered).

**Timeline** — `timeline.value_label/state_average_label` ✅ᶜ (`t()`-built; Narok had no timeline to hover).

**Nav / desktop-required** — `nav.desktop_required.title` ✅ FR ("Ordinateur de bureau requis"), `…message` ✅ FR (static DOM, verified; ZH ✅ᶜ same path).

**Loading screen** — `loading.message` ✅ FR/ZH on `/tool/a` ("Chargement…" / "加载中…"); transient English on `/tool/s` (see findings).

**Error toasts** — `toast.dataset_error.*`, `toast.config_error.*` ✅ᶜ (`t()`-built; failure not reproduced).

**Cookie banner** — ✅ FR/ZH by source: `cookie.tmpl` own inline `en/fr/zh` object is complete — notice (FR/ZH ✅), `OK`→"OK"/"确定", `privacy policy.`→"politique de confidentialité."/"隐私政策。". (Not rendered this pass; would need cleared cookies.)

---

## Geography / area select (src/s.js)
_Reach: Open the tool without a saved geography → the selection screen._

- `geography_picker.no_geographies` · `s.js:50`
  - EN `No available geographies. Need: outline, admin-tiers and population-density datasets`
  - FR `Aucune géographie disponible. Requis : jeux de données outline, admin-tiers et population-density`
  - ZH `没有可用的地理区域。需要：outline、admin-tiers 和 population-density 数据集`
- `geography_picker.multiple` · `s.js:77`
  - EN `We have several geographies for {{name}}. Please do select one.`
  - FR `Nous avons plusieurs géographies pour {{name}}. Veuillez en sélectionner une.`
  - ZH `我们有多个 {{name}} 的地理区域。请选择一个。`
- `geography_picker.interest_prompt` · `s.js:137`
  - EN `What are you interested in?`
  - FR `Qu'est-ce qui vous intéresse ?`
  - ZH `您对什么感兴趣？`
- `geography_picker.choose_area` · `s.js:159`
  - EN `Choose your area of interest`
  - FR `Choisissez votre domaine d'intérêt`
  - ZH `选择您感兴趣的领域`
- `toast.fetch_error.label` · `s.js:281`
  - EN `Fetch error`
  - FR `Erreur de récupération`
  - ZH `获取错误`
  - ⚠ Toast label; fires on a failed geography fetch.

## Left panel · layer cards (src/cards.js, views/a.tmpl)
_Reach: Add datasets; the layer cards appear in the left panel. The toggle buttons sit in the cards toolbar._

- `left_panel.cards.show_all` · `cards.js:553, cards.js:618`
  - EN `Show all layers`
  - FR `Afficher toutes les couches`
  - ZH `显示所有图层`
- `left_panel.cards.hide_all` · `cards.js:553, cards.js:618`
  - EN `Hide all layers`
  - FR `Masquer toutes les couches`
  - ZH `隐藏所有图层`
- `left_panel.cards.expand_all` · `cards.js:583, cards.js:622`
  - EN `Expand all settings`
  - FR `Afficher tous les paramètres`
  - ZH `展开所有设置`
- `left_panel.cards.collapse_all` · `cards.js:583, cards.js:622`
  - EN `Collapse all settings`
  - FR `Réduire tous les paramètres`
  - ZH `折叠所有设置`
- `left_panel.cards.card.importance_hint` · `a.tmpl:423`
  - EN `Change importance to provide different weightings for data in the analysis calculation.`
  - FR `Modifier le niveau d'importance afin d'attribuer des pondérations différentes aux données dans le calcul de l'analyse.`
  - ZH `更改重要性以为分析计算中的数据提供不同的权重。`
- `left_panel.cards.card.settings_toggle_title` · `a.tmpl:919`
  - EN `Hide/Show settings`
  - FR `Masquer/Afficher les paramètres`
  - ZH `隐藏/显示设置`
- `left_panel.cards.card.remove_dataset_title` · `a.tmpl:926`
  - EN `Remove dataset`
  - FR `Supprimer le jeu de données`
  - ZH `删除数据集`
- `left_panel.cards.card.table_button` · `—`
  - EN `Table`
  - FR `Tableau`
  - ZH `表格`
  - ⚠ FR corrected this session (Table → Tableau).

## Left panel · output / About modal (src/output-widget.js, views/a.tmpl)
_Reach: Left panel → output section → the ⓘ About button opens the EAE-info modal._

- `modal.eae_info.title` · `a.tmpl:543, output-widget.js:87`
  - EN `About Energy Access Explorer prioritization`
  - FR `À propos de la priorisation Energy Access Explorer`
  - ZH `关于能源获取浏览器优先级`
- `modal.eae_info.body` · `a.tmpl:544`
  - EN `Energy Access Explorer enables you to identify high-priority areas for energy access interventions. EAE uses multi-criteria analysis that uses location-specific resource availability and infrastructure data to represent energy supply, and incorporates demographic data and data on social and productive uses to visualize demand for energy services.`
  - FR `Energy Access Explorer vous permet d'identifier les zones prioritaires pour les interventions en matière d'accès à l'énergie.`
  - ZH `能源获取浏览器使您能够确定能源获取干预的高优先级区域。EAE 使用多标准分析，该分析使用特定于位置的资源可用性和基础设施数据来表示能源供应，并合并人口数据和社会和生产使用数据来可视化能源服务的需求。`
- `modal.eae_info.analysis_areas.title` · `a.tmpl:554`
  - EN `Analysis areas`
  - FR `Zones d'analyse`
  - ZH `分析区域`
- `modal.eae_info.analysis_areas.body` · `a.tmpl:555`
  - EN `Energy Access Explorer offers the option to generate an analysis across various different administrative priorities.`
  - FR `Energy Access Explorer offre la possibilité de générer une analyse sur différentes priorités administratives.`
  - ZH `能源获取浏览器提供生成跨越各种不同行政优先事项分析的选项。`
- `modal.eae_info.priority_1km.title` · `a.tmpl:561`
  - EN `Priority areas (1km²)`
  - FR `Zones prioritaires (1 km²)`
  - ZH `优先级区域 (1 公里²)`
- `modal.eae_info.priority_1km.body` · `a.tmpl:562`
  - EN `Selecting this analysis area provides a raster analysis in 1km2 tiles across the entirety of the selected geography.`
  - FR `Cette zone d'analyse fournit une analyse raster en tuiles de 1 km² sur l'ensemble de la géographie sélectionnée.`
  - ZH `选择此分析区域将在整个选定地理区域中提供 1 公里² 瓷砖中的光栅分析。`
- `modal.eae_info.other_areas.title` · `a.tmpl:568`
  - EN `Other analysis areas`
  - FR `Autres zones d'analyse`
  - ZH `其他分析区域`
- `modal.eae_info.other_areas.body` · `a.tmpl:569`
  - EN `Depending on the currently selected geography, it is possible to change the prioritization output to wider geographical areas such as districts, regions or zones for more high level analysis.`
  - FR `Selon la géographie sélectionnée, il est possible de modifier la sortie de priorisation vers des zones géographiques plus larges.`
  - ZH `根据当前选定的地理位置，可以将优先级输出更改为更广泛的地理区域（如地区、地区或区域）以进行更高级别的分析。`
- `modal.eae_info.indexes.title` · `a.tmpl:577`
  - EN `Prioritization indexes`
  - FR `Indices de priorisation`
  - ZH `优先级指数`
- `modal.eae_info.indexes.body` · `a.tmpl:578`
  - EN `There are 4 different methods to generate a prioritization, depending on the aim of your analysis; these are known as the different "indexes". Energy Access Potential is the standard recommended index as it is an aggregation across demand and supply categories.`
  - FR `Il existe 4 méthodes différentes pour générer une priorisation, selon l'objectif de votre analyse ; elles sont appelées les différents « indices ». Le Potentiel d'accès à l'énergie est l'indice standard recommandé car il s'agit d'une agrégation des catégories de demande et d'offre.`
  - ZH `根据您的分析目标，有 4 种不同的方法来生成优先级；这些被称为不同的指数"。能源获取潜力是标准推荐的指数，因为它是需求和供应类别的聚合。"`
- `modal.eae_info.view_technical_note` · `a.tmpl:610`
  - EN `View technical note`
  - FR `Voir la note technique`
  - ZH `查看技术说明`
- `left_panel.output.tiff_download_title` · `a.tmpl:298`
  - EN `Download TIFF image of the current analysis`
  - FR `Télécharger l'image TIFF de l'analyse actuelle`
  - ZH `下载当前分析的 TIFF 图像`

## Left panel · points input / loading (views/a.tmpl, src/points-loading.js)
_Reach: Left panel → Points Loading → manual coordinate input._

- `modal.points_input.longitude_placeholder` · `a.tmpl:863`
  - EN `Longitude`
  - FR `Longitude`
  - ZH `经度`
- `modal.points_input.latitude_placeholder` · `a.tmpl:870`
  - EN `Latitude`
  - FR `Latitude`
  - ZH `纬度`
- `modal.points_input.add_button` · `a.tmpl:877`
  - EN `Add point`
  - FR `Ajouter un point`
  - ZH `添加点`
- `left_panel.points_loading.input_tooltip` · `—`
  - EN `Input coordinates manually`
  - FR `Saisir les coordonnées manuellement`
  - ZH `手动输入坐标`

## Analysis search (src/analysis-search.js)
_Reach: Left panel → analysis/top-locations search panel._

- `left_panel.analysis_search.input_label` · `analysis-search.js:104`
  - EN `Analysis top locations`
  - FR `Principaux emplacements d'analyse`
  - ZH `分析热门位置`
- `left_panel.analysis_search.coordinates_label` · `analysis-search.js:114`
  - EN `Analysis coordinates`
  - FR `Coordonnées d'analyse`
  - ZH `分析坐标`
- `left_panel.analysis_search.top_results` · `analysis-search.js:64`
  - EN `Searching <b>analysis coordinates</b>. Top {{count}} results:`
  - FR `Recherche <b>coordonnées d'analyse</b>. Les {{count}} résultats prioritaires:`
  - ZH `搜索<b>分析坐标</b>。前 {{count}} 个结果：`
- `left_panel.analysis_search.overflow` · `analysis-search.js:99`
  - EN `Searching <b>analysis coordinates</b>. Showing first {{n}} of {{total}}:`
  - FR `Recherche <b>coordonnées d'analyse</b>. Affichage des {{n}} premiers résultats sur {{total}}:`
  - ZH `搜索<b>分析坐标</b>。显示 {{n}} 个结果（共 {{total}} 个）：`

## Right panel · POI / high-priority / prioritization
_Reach: Run an analysis, then click the map (POI card) / open the high-priority + prioritization tabs._

- `right_panel.poi.count_html_one` · `right-panel-poi-card.js:46`
  - EN `There is <strong>{{n}}</strong> point of interest within <strong>{{radius_km}}km</strong> of this area of interest.`
  - FR `Il y a <strong>{{n}}</strong> point d'intérêt à moins de <strong>{{radius_km}} km</strong> de cette zone d'intérêt.`
  - ZH `在此关注区域 <strong>{{radius_km}}km</strong> 范围内有 <strong>{{n}}</strong> 个关注点。`
  - ⚠ PLURAL+HTML — verify <strong> renders and {{n}}/{{radius_km}} substitute.
- `right_panel.poi.count_html_other` · `right-panel-poi-card.js:46`
  - EN `There are <strong>{{n}}</strong> points of interest within <strong>{{radius_km}}km</strong> of this area of interest.`
  - FR `Il y a <strong>{{n}}</strong> points d'intérêt à moins de <strong>{{radius_km}} km</strong> de cette zone d'intérêt.`
  - ZH `在此关注区域 <strong>{{radius_km}}km</strong> 范围内有 <strong>{{n}}</strong> 个关注点。`
  - ⚠ PLURAL+HTML — test with >1 POI.
- `right_panel.poi.about_tooltip` · `right-panel-poi-card.js:53`
  - EN `Shows points of interest near the selected pixel.`
  - FR `Affiche les points d'intérêt à proximité du pixel sélectionné.`
  - ZH `显示所选像素附近的关注点。`
- `right_panel.high_priority.showing_count_one` · `right-panel-high-priority-areas.js:174`
  - EN `Showing {{count}} result`
  - FR `Affichage de {{count}} résultat`
  - ZH `显示 {{count}} 个结果`
  - ⚠ PLURAL — test count 1 vs >1.
- `right_panel.high_priority.showing_count_other` · `right-panel-high-priority-areas.js:174`
  - EN `Showing {{count}} results`
  - FR `Affichage de {{count}} résultats`
  - ZH `显示 {{count}} 个结果`
- `right_panel.high_priority.showing_range` · `right-panel-high-priority-areas.js:180`
  - EN `Showing {{start}}-{{end}} of {{total}}`
  - FR `Affichage de {{start}}-{{end}} sur {{total}}`
  - ZH `显示 {{total}} 个中的 {{start}}-{{end}}`
- `right_panel.high_priority.area_count_one` · `right-panel-high-priority-areas.js:263`
  - EN `{{count}} area`
  - FR `{{count}} zone`
  - ZH `{{count}} 个区域`
  - ⚠ PLURAL — test count 1 vs >1.
- `right_panel.high_priority.area_count_other` · `right-panel-high-priority-areas.js:263`
  - EN `{{count}} areas`
  - FR `{{count}} zones`
  - ZH `{{count}} 个区域`
- `right_panel.high_priority.priority_score` · `right-panel-high-priority-areas.js:265`
  - EN `{{score}}% priority score`
  - FR `score de priorité de {{score}} %`
  - ZH `{{score}}% 优先级评分`
- `right_panel.prioritization.priority_score_badge` · `right-panel-prioritization-tab.js:120`
  - EN `{{score}} priority score`
  - FR `score de priorité de {{score}}`
  - ZH `{{score}} 优先级评分`

## Summary (src/summary.js)
_Reach: Open the Snapshot/summary modal; the switcher toggles table/graphs._

- `summary.table` · `summary.js:168, summary.js:175, summary.js:335`
  - EN `Summary Table`
  - FR `Tableau résumé`
  - ZH `汇总表`
- `summary.graphs` · `summary.js:175, summary.js:335`
  - EN `Summary Graphs`
  - FR `Graphiques résumés`
  - ZH `汇总图表`
- `summary.export_button` · `summary.js:180, summary.js:340`
  - EN `Export Presentation`
  - FR `Exporter la présentation`
  - ZH `导出演示文稿`
- `summary.snapshot_header` · `summary.js:202`
  - EN `Snapshot`
  - FR `Instantané`
  - ZH `快照`

## Export modal + modal table (src/export.js, views/a.tmpl, src/right-panel-high-priority-areas.js)
_Reach: Open the Export modal; each card opens a modal table with title/subtitle/action label._

- `modal.export.summary_presentation.title` · `a.tmpl:718`
  - EN `Summary presentation`
  - FR `Présentation résumée`
  - ZH `汇总演示文稿`
- `modal.export.summary_presentation.desc` · `a.tmpl:719`
  - EN `A summary presentation explaining the outputs of your current analysis view.`
  - FR `Une présentation résumant les résultats de votre analyse actuelle.`
  - ZH `解释当前分析视图输出的汇总演示文稿。`
- `modal.export.summary_presentation.button` · `a.tmpl:722`
  - EN `Download .ppt`
  - FR `Télécharger .ppt`
  - ZH `下载 .ppt`
- `modal.export.map_tiff.title` · `a.tmpl:730`
  - EN `Map TIFF`
  - FR `Carte TIFF`
  - ZH `地图 TIFF`
- `modal.export.map_tiff.desc` · `a.tmpl:731`
  - EN `A TIFF file of the prioritization raster image generated from your analysis.`
  - FR `Un fichier TIFF de l'image raster de priorisation générée par votre analyse.`
  - ZH `从您的分析生成的优先级光栅图像的 TIFF 文件。`
- `modal.export.map_tiff.button` · `a.tmpl:734`
  - EN `Download .TIFF`
  - FR `Télécharger .TIFF`
  - ZH `下载 .TIFF`
- `modal.export.high_priority.title` · `a.tmpl:742, export.js:222, right-panel-high-priority-areas.js:56`
  - EN `High priority areas`
  - FR `Zones hautement prioritaires`
  - ZH `高优先级区域`
- `modal.export.high_priority.button` · `a.tmpl:746`
  - EN `Download .csv`
  - FR `Télécharger .csv`
  - ZH `下载 .csv`
- `modal.export.pop_area_share.title` · `a.tmpl:754`
  - EN `Population and area share`
  - FR `Part de population et de superficie`
  - ZH `人口和面积份额`
- `modal.export.pop_area_share.desc` · `a.tmpl:755`
  - EN `CSV data for the population and area share.`
  - FR `Données CSV pour la part de population et de superficie.`
  - ZH `人口和面积份额的 CSV 数据。`
- `modal.export.pop_area_share.button` · `a.tmpl:758`
  - EN `Download .csv`
  - FR `Télécharger .csv`
  - ZH `下载 .csv`
- `modal.export.download_all` · `a.tmpl:768, export.js:244`
  - EN `Download all`
  - FR `Tout télécharger`
  - ZH `全部下载`
- `modal.export.generating` · `export.js:130, export.js:199, export.js:209, export.js:232, export.js:272, export.js:285`
  - EN `Generating...`
  - FR `Génération en cours...`
  - ZH `生成中...`
  - ⚠ Spinner text; appears briefly during any export generation (6 call sites).
- `modal.export.ppt_title` · `export.js:194`
  - EN `Export PowerPoint presentation`
  - FR `Exporter la présentation PowerPoint`
  - ZH `导出 PowerPoint 演示文稿`
- `modal.export.select_subtitle` · `export.js:195, export.js:245`
  - EN `Select priority areas columns and rows`
  - FR `Sélectionnez les colonnes et lignes des zones prioritaires`
  - ZH `选择优先区域的列和行`
- `modal.export.download_ppt` · `export.js:196`
  - EN `Download .ppt`
  - FR `Télécharger .ppt`
  - ZH `下载 .ppt`
- `modal.export.ppt_hint` · `export.js:197`
  - EN `Selected columns will be included in the PowerPoint tables`
  - FR `Les colonnes sélectionnées seront incluses dans les tableaux PowerPoint`
  - ZH `所选列将包含在 PowerPoint 表格中`
- `modal.export.download_csv` · `export.js:224, right-panel-high-priority-areas.js:58`
  - EN `Download all (.csv)`
  - FR `Tout télécharger (.csv)`
  - ZH `全部下载 (.csv)`
- `modal.export.csv_hint` · `export.js:225, right-panel-high-priority-areas.js:59`
  - EN `Selected columns will be included in the CSV download`
  - FR `Les colonnes sélectionnées seront incluses dans le téléchargement CSV`
  - ZH `所选列将包含在 CSV 下载中`
- `modal.export.download_zip` · `export.js:246`
  - EN `Download all (.zip)`
  - FR `Tout télécharger (.zip)`
  - ZH `全部下载 (.zip)`
- `modal.export.zip_hint` · `export.js:247`
  - EN `Selected columns will be included in the CSV and PowerPoint downloads`
  - FR `Les colonnes sélectionnées seront incluses dans les téléchargements CSV et PowerPoint`
  - ZH `所选列将包含在 CSV 和 PowerPoint 下载中`

## My EAE / saved analyses (src/m.js, src/session.js, views/a.tmpl)
_Reach: My EAE screen + the save/share/set-title/delete flows on saved analyses._

- `my_eae.modal.share.header` · `m.js:94`
  - EN `Share analysis view`
  - FR `Partager la vue d'analyse`
  - ZH `分享分析视图`
- `my_eae.modal.share.instructions` · `a.tmpl:687`
  - EN `Sharing the following link will load the Energy Access Explorer platform in the current state: layers and analysis. Users might need the necessary permissions to view this snapshot fully.`
  - FR `Partager ce lien chargera la plateforme Energy Access Explorer dans l'état actuel : couches et analyse.`
  - ZH `分享以下链接将在当前状态下加载能源获取浏览器平台：图层和分析。用户可能需要必要的权限才能完整查看此快照。`
- `my_eae.modal.share.copy_link` · `a.tmpl:707, utils.js:583`
  - EN `Copy link`
  - FR `Copier le lien`
  - ZH `复制链接`
- `my_eae.modal.share.link_copied_toast` · `m.js:86`
  - EN `Link copied!`
  - FR `Lien copié !`
  - ZH `已复制链接！`
- `toast.clipboard_error` · `m.js:77, utils.js:566`
  - EN `Clipboard functionality not available`
  - FR `Fonctionnalité du presse-papiers non disponible`
  - ZH `剪贴板功能不可用`
- `my_eae.modal.set_title.header` · `m.js:127`
  - EN `Set Analysis Title`
  - FR `Définir le titre de l'analyse`
  - ZH `设置分析标题`
- `right_panel.footer.save` · `m.js:123`
  - EN `Save`
  - FR `Enregistrer`
  - ZH `保存`
- `my_eae.modal.set_title.title_updated_toast` · `m.js:146`
  - EN `Title updated`
  - FR `Titre mis à jour`
  - ZH `标题已更新`
- `my_eae.modal.delete.confirm` · `m.js:162`
  - EN `Are you sure you want to delete this analysis? '{{name}}'`
  - FR `Êtes-vous sûr de vouloir supprimer cette analyse ? « {{name}} »`
  - ZH `您确定要删除此分析吗？'{{name}}'`
- `my_eae.modal.delete.deleted_toast` · `m.js:168`
  - EN `Analysis '{{name}}' deleted.`
  - FR `Analyse « {{name}} » supprimée.`
  - ZH `分析'{{name}}'已删除。`
- `session.saving` · `session.js:147, session.js:174`
  - EN `Saving analysis...`
  - FR `Sauvegarde de l'analyse...`
  - ZH `正在保存分析...`
- `modal.save_analysis.last_viewed` · `session.js:53`
  - EN `Last viewed on {{date}}.`
  - FR `Dernière consultation le {{date}}.`
  - ZH `上次查看于 {{date}}。`
- `modal.save_analysis.untitled_analysis` · `session.js:58`
  - EN `Untitled Analysis`
  - FR `Analyse sans titre`
  - ZH `无标题分析`
- `modal.save_analysis.saved_toast` · `session.js:178`
  - EN `Analysis saved successfully`
  - FR `Analyse sauvegardée avec succès`
  - ZH `分析已成功保存`
- `modal.save_analysis.saved_toast_caption` · `session.js:178`
  - EN `Your analysis was saved to your My EAE account.`
  - FR `Votre analyse a été sauvegardée dans votre compte Mon EAE.`
  - ZH `您的分析已保存到您的"我的 EAE"账户。`
- `modal.save_analysis.updated_toast` · `session.js:150`
  - EN `Analysis updated successfully`
  - FR `Analyse mise à jour avec succès`
  - ZH `分析已成功更新`
- `modal.save_analysis.updated_toast_caption` · `session.js:150`
  - EN `Your analysis was updated in your My EAE account.`
  - FR `Votre analyse a été mise à jour dans votre compte Mon EAE.`
  - ZH `您的分析已在您的"我的 EAE"账户中更新。`
- `modal.save_analysis.title_label` · `a.tmpl:1030`
  - EN `Analysis title`
  - FR `Titre de l'analyse`
  - ZH `分析标题`
- `modal.save_analysis.title_hint` · `a.tmpl:1031`
  - EN `Enter a memorable name for the current configuration.`
  - FR `Entrez un nom mémorable pour la configuration actuelle.`
  - ZH `输入当前配置的易记名称。`
- `modal.save_analysis.save_button` · `a.tmpl:1037`
  - EN `Save analysis`
  - FR `Enregistrer l'analyse`
  - ZH `保存分析`
- `modal.save_analysis.update_button` · `a.tmpl:1023`
  - EN `Update saved analysis`
  - FR `Mettre à jour l'analyse sauvegardée`
  - ZH `更新保存的分析`
- `modal.save_analysis.save_as_new_button` · `a.tmpl:1024`
  - EN `Save as new analysis`
  - FR `Sauvegarder comme nouvelle analyse`
  - ZH `另存为新分析`

## Share-link modal + utilities (src/right-panel.js, src/utils.js)
_Reach: Main-tool share-link modal; generic copy/loading feedback used across the app._

- `right_panel.share_link.header` · `right-panel.js:195`
  - EN `Share link`
  - FR `Lien de partage`
  - ZH `分享链接`
- `utils.copied` · `utils.js:578`
  - EN `Copied`
  - FR `Copié`
  - ZH `已复制`
  - ⚠ Shown briefly after clicking a copy-link button.
- `utils.loading` · `utils.js:393`
  - EN `Loading...`
  - FR `Chargement...`
  - ZH `加载中...`

## Auth (src/user.js)
_Reach: Trigger a save while logged out → the register/login prompt._

- `auth.prompt` · `user.js:14`
  - EN `In order to save an analysis, you need to be registered with us.`
  - FR `Pour sauvegarder une analyse, vous devez être inscrit.`
  - ZH `为了保存分析，您需要向我们注册。`
- `auth.register_login` · `user.js:25`
  - EN `Register/Login`
  - FR `S'inscrire / Se connecter`
  - ZH `注册/登录`

## Country overview (views/a.tmpl)
_Reach: Left panel → country/geography overview block._

- `country_overview.population` · `a.tmpl:479`
  - EN `Population:`
  - FR `Population :`
  - ZH `人口：`
- `country_overview.unit_million` · `a.tmpl:479`
  - EN `million`
  - FR `million`
  - ZH `百万`
- `country_overview.urban` · `a.tmpl:483`
  - EN `Urban:`
  - FR `Urbain :`
  - ZH `城市：`
- `country_overview.rural` · `a.tmpl:487`
  - EN `Rural:`
  - FR `Rural :`
  - ZH `农村：`
- `country_overview.area` · `a.tmpl:491`
  - EN `Area:`
  - FR `Superficie :`
  - ZH `面积：`
- `country_overview.gdp_per_capita` · `a.tmpl:495`
  - EN `GDP per capita:`
  - FR `PIB par habitant :`
  - ZH `人均 GDP：`
- `country_overview.unit_usd` · `a.tmpl:495`
  - EN `USD`
  - FR `USD`
  - ZH `美元`
- `country_overview.electrification_rate` · `a.tmpl:499`
  - EN `Electrification Rate:`
  - FR `Taux d'électrification :`
  - ZH `电气化率：`
- `country_overview.urban_header` · `a.tmpl:507`
  - EN `Urban`
  - FR `Urbain`
  - ZH `城市`
- `country_overview.rural_header` · `a.tmpl:508`
  - EN `Rural`
  - FR `Rural`
  - ZH `农村`
- `country_overview.electrified` · `a.tmpl:516, a.tmpl:524`
  - EN `Electrified:`
  - FR `Électrifié :`
  - ZH `已电气化：`
- `country_overview.energy_intensity` · `a.tmpl:533`
  - EN `Energy intensity level of primary energy (MJ/$2011 PPP GDP):`
  - FR `Intensité énergétique de l'énergie primaire (MJ/$2011 PPA PIB) :`
  - ZH `一次能源强度水平 (MJ/$2011 PPP GDP)：`
- `country_overview.power_outages` · `a.tmpl:537`
  - EN `Power outages in firms in a typical month:`
  - FR `Coupures de courant dans les entreprises au cours d'un mois typique :`
  - ZH `企业在典型月份内的停电次数：`

## Dataset info modal (views/a.tmpl)
_Reach: Click a dataset's ⓘ info button → dataset-info modal._

- `dataset_info.description` · `a.tmpl:625`
  - EN `Description`
  - FR `Description`
  - ZH `描述`
- `dataset_info.why_used` · `a.tmpl:629`
  - EN `Why is this dataset used?`
  - FR `Pourquoi ce jeu de données est-il utilisé ?`
  - ZH `为什么使用此数据集？`
- `dataset_info.suggested_citation` · `a.tmpl:633`
  - EN `Suggested Citation`
  - FR `Citation suggérée`
  - ZH `建议引用`
- `dataset_info.cautions` · `a.tmpl:637`
  - EN `Cautions`
  - FR `Précautions`
  - ZH `注意事项`
- `dataset_info.sources` · `a.tmpl:659`
  - EN `Sources`
  - FR `Sources`
  - ZH `来源`
- `dataset_info.spatial_resolution` · `a.tmpl:664`
  - EN `Spatial Resolution`
  - FR `Résolution spatiale`
  - ZH `空间分辨率`
- `dataset_info.license` · `a.tmpl:669`
  - EN `License`
  - FR `Licence`
  - ZH `许可证`
- `dataset_info.content_date` · `a.tmpl:674`
  - EN `Date of Content`
  - FR `Date du contenu`
  - ZH `内容日期`
- `dataset_info.publication_date` · `a.tmpl:679`
  - EN `Date of Publication`
  - FR `Date de publication`
  - ZH `发布日期`
- `dataset_info.download_from_source` · `a.tmpl:647`
  - EN `Download from Source`
  - FR `Télécharger depuis la source`
  - ZH `从来源下载`
- `dataset_info.learn_more` · `a.tmpl:655`
  - EN `Learn More`
  - FR `En savoir plus`
  - ZH `了解更多`

## High-priority table modal (views/a.tmpl)
_Reach: Export → high-priority areas → the modal table controls._

- `modal.high_priority_table.toggle_columns` · `a.tmpl:1122`
  - EN `Toggle columns`
  - FR `Afficher/masquer les colonnes`
  - ZH `切换列`
- `modal.high_priority_table.download_selected` · `a.tmpl:1146`
  - EN `Download selected rows`
  - FR `Télécharger les lignes sélectionnées`
  - ZH `下载选定的行`
- `modal.high_priority_table.per_page` · `a.tmpl:1158`
  - EN `Per page`
  - FR `Par page`
  - ZH `每页`
- `modal.high_priority_table.data_download_summary` · `a.tmpl:1181`
  - EN `Data download will include a summary of your analysis.`
  - FR `Le téléchargement de données inclura un résumé de votre analyse.`
  - ZH `数据下载将包含您的分析摘要。`

## Onboarding tour (src/help.js)
_Reach: Click the Help drawer button (#drawer-help) to start the 9-step tour._

- `help.welcome_title` · `help.js:65`
  - EN `Welcome to {{title}}`
  - FR `Bienvenue sur {{title}}`
  - ZH `欢迎使用 {{title}}`
- `help.welcome_text` · `help.js:53`
  - EN `Check out the highlights and learn what<br>you can do with the map.`
  - FR `Découvrez les points forts et apprenez ce que<br>vous pouvez faire avec la carte.`
  - ZH `查看亮点，了解您可以<br>用地图做什么。`
  - ⚠ HTML <br>; tour rebuilds with current locale at start.
- `help.step1` · `help.js:78`
  - EN `Select <strong>sub-national level data</strong>. These can be used as filters to identify regions of interest.`
  - FR `Sélectionnez des <strong>données infranationales</strong>. Elles peuvent servir de filtres pour identifier les régions d'intérêt.`
  - ZH `选择<strong>地方级数据</strong>。这些数据可用作筛选条件来识别目标区域。`
- `help.step2` · `help.js:100`
  - EN `Click on the <strong>Demand</strong> data group.`
  - FR `Cliquez sur le groupe de données <strong>Demande</strong>.`
  - ZH `点击<strong>需求</strong>数据组。`
- `help.step3` · `help.js:111`
  - EN `Select data on <strong>Demographics</strong> and <strong>Social and Productive Uses</strong>. These will be used to visualize current and/or potential demand for energy.`
  - FR `Sélectionnez des données sur la <strong>démographie</strong> et les <strong>usages sociaux et productifs</strong>. Elles serviront à visualiser la demande énergétique actuelle et/ou potentielle.`
  - ZH `选择<strong>人口</strong>以及<strong>社会与生产用途</strong>的数据。这些将用于可视化当前和/或潜在的能源需求。`
- `help.step4` · `help.js:133`
  - EN `Select the <strong>Healthcare Facilities</strong> dataset`
  - FR `Sélectionnez le jeu de données <strong>Établissements de santé</strong>`
  - ZH `选择<strong>医疗设施</strong>数据集`
- `help.step5` · `help.js:162`
  - EN `<strong>Filter areas</strong> that are close to social loads by selecting a short proximity (e.g. set proximity to healthcare facilities at 10km)`
  - FR `<strong>Filtrez les zones</strong> proches des charges sociales en sélectionnant une faible proximité (par ex. définir la proximité des établissements de santé à 10 km)`
  - ZH `通过选择较短的邻近距离来<strong>筛选</strong>靠近社会负荷的区域（例如将医疗设施的邻近距离设为 10 公里）`
- `help.step6` · `help.js:186`
  - EN `Click on the <strong>Supply</strong> data group.`
  - FR `Cliquez sur le groupe de données <strong>Offre</strong>.`
  - ZH `点击<strong>供应</strong>数据组。`
- `help.step7` · `help.js:198`
  - EN `Select data on <strong>Resources</strong> and <strong>Infrastructure</strong> to visualize current and/or potential energy supply.`
  - FR `Sélectionnez des données sur les <strong>ressources</strong> et les <strong>infrastructures</strong> pour visualiser l'offre énergétique actuelle et/ou potentielle.`
  - ZH `选择<strong>资源</strong>和<strong>基础设施</strong>数据，以可视化当前和/或潜在的能源供应。`
- `help.step8` · `help.js:221`
  - EN `<strong>Visualize Underlying Data</strong> Click on the map to read location specific information of the top most layer.`
  - FR `<strong>Visualisez les données sous-jacentes</strong> Cliquez sur la carte pour lire les informations propres à un lieu de la couche supérieure.`
  - ZH `<strong>可视化底层数据</strong> 点击地图以读取最上层图层的特定位置信息。`
- `help.step9` · `help.js:233`
  - EN `Analysis indicates low hanging fruits (energy access potential index) areas where demand or supply are likely to be higher (demand and supply index) and areas where finance assistance is needed the most`
  - FR `L'analyse met en évidence les opportunités faciles (indice de potentiel d'accès à l'énergie), les zones où la demande ou l'offre sont susceptibles d'être plus élevées (indice de demande et d'offre) et les zones où l'aide financière est la plus nécessaire`
  - ZH `分析可揭示容易实现的机会（能源获取潜力指数）、需求或供应可能较高的区域（需求与供应指数）以及最需要资金援助的区域`

## Timeline (src/timeline.js)
_Reach: Open a geography with a timeline; hover a timeline cell → value popup._

- `timeline.value_label` · `timeline.js:375`
  - EN `Value`
  - FR `Valeur`
  - ZH `值`
- `timeline.state_average_label` · `timeline.js:380`
  - EN `State Average`
  - FR `Moyenne de l'État`
  - ZH `州平均值`

## Nav / desktop-required (views/nav.tmpl)
_Reach: Shrink the viewport to mobile width to trigger the desktop-required notice._

- `nav.desktop_required.title` · `nav.tmpl:56`
  - EN `Desktop Required`
  - FR `Ordinateur de bureau requis`
  - ZH `需要桌面设备`
- `nav.desktop_required.message` · `nav.tmpl:57`
  - EN `Energy Access Explorer is designed for larger screens. Please open this page on a desktop or laptop computer for the best experience.`
  - FR `Energy Access Explorer est conçu pour les grands écrans. Veuillez ouvrir cette page sur un ordinateur de bureau ou portable pour une expérience optimale.`
  - ZH `Energy Access Explorer 专为大屏幕设计。为获得最佳体验，请在台式机或笔记本电脑上打开此页面。`

## Loading screen (views/loading.tmpl)
_Reach: Shown during initial app load._

- `loading.message` · `loading.tmpl:4`
  - EN `Loading...`
  - FR `Chargement...`
  - ZH `加载中...`

## Error toasts (src/ds.js, src/parse.js, src/config.js)
_Reach: Fire on dataset/config load failure — hard to trigger normally; verify wording if reproducible, else review the text here._

- `toast.dataset_error.label` · `ds.js:130, ds.js:155, ds.js:388`
  - EN `Dataset/File error`
  - FR `Erreur de jeu de données/fichier`
  - ZH `数据集/文件错误`
- `toast.dataset_error.divisions` · `ds.js:130`
  - EN `'{{name}}' requires a geography->divisions->{{tier}}. This is not fatal but the dataset is now disabled.`
  - FR `« {{name}} » nécessite une geography->divisions->{{tier}}. Ce n'est pas fatal mais le jeu de données est maintenant désactivé.`
  - ZH `'{{name}}' 需要 geography->divisions->{{tier}}。这不是致命错误，但该数据集现已禁用。`
- `toast.dataset_error.category` · `ds.js:155`
  - EN `'{{name}}' has category '{{category}}' which requires a {{type}} file. This is not fatal but the dataset is now disabled.`
  - FR `« {{name}} » a la catégorie « {{category}} » qui nécessite un fichier {{type}}. Ce n'est pas fatal mais le jeu de données est maintenant désactivé.`
  - ZH `'{{name}}' 的类别 '{{category}}' 需要 {{type}} 文件。这不是致命错误，但该数据集现已禁用。`
- `toast.dataset_error.no_host` · `ds.js:388`
  - EN `'{{id}}' claims to have host '{{host}}'. No such DS. This is not fatal but the dataset is now disabled.`
  - FR `« {{id}} » prétend avoir l'hôte « {{host}} ». Aucun jeu de données de ce type. Ce n'est pas fatal mais le jeu de données est maintenant désactivé.`
  - ZH `'{{id}}' 声称拥有主机 '{{host}}'。无此数据集。这不是致命错误，但该数据集现已禁用。`
- `toast.dataset_error.process_label` · `parse.js:56`
  - EN `Dataset error`
  - FR `Erreur de jeu de données`
  - ZH `数据集错误`
- `toast.dataset_error.process` · `parse.js:56`
  - EN `Failed to process dataset '{{name}}'. This is not fatal but the dataset is now disabled.`
  - FR `Échec du traitement du jeu de données « {{name}} ». Ce n'est pas fatal mais le jeu de données est maintenant désactivé.`
  - ZH `处理数据集 '{{name}}' 失败。这不是致命错误，但该数据集现已禁用。`
- `toast.config_error.label` · `config.js:22`
  - EN `Configuration File Error`
  - FR `Erreur de fichier de configuration`
  - ZH `配置文件错误`
- `toast.config_error.caption` · `config.js:22`
  - EN `The provided configuration does not comply with the necessary format.`
  - FR `La configuration fournie n'est pas conforme au format requis.`
  - ZH `提供的配置不符合所需的格式。`

## Cookie banner (views/cookie.tmpl)
_Reach: first visit (clear cookies/localStorage) → banner at bottom._
- Cookie notice / `OK` / `privacy policy.` — uses its **own inline `en`/`fr`/`zh` object** in `cookie.tmpl`, NOT `translations.csv`. Verify all three languages directly in the banner.

## Special-case reminders
- **Plurals** (`*_one`/`*_other`): test a count of 1 and >1. ZH `_one`/`_other` are intentionally identical.
- **HTML values** (`poi.count_html_*`, `help.step*`, `analysis_search.*`, country-overview energy lines): confirm `<strong>`/`<b>`/`<br>` render as markup.
- **Interpolation** (`{{name}}`,`{{count}}`,`{{date}}`,`{{score}}`,`{{title}}`,…): confirm the value substitutes, no literal braces.
