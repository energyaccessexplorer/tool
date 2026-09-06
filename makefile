default: reconfig build lint

include .env
# in .env:
#
# TITLE = "Energy Access Explorer"
# WORLD = "https://world.example.org"
# DOMAIN = "example.org"
#
# API_URL = "http://eae.localhost/api"
#
# SSH_USER = www
# SSH_HOST = srv.example.org
#
# TOOL_DEST = /var/www/path
#
# MAPBOX_THEME = "mapbox/light-v10"
# MAPBOX_TOKEN = ""
#
# STORAGE_URL = "https://bucket.s3.storage.com/path/"
#
DIST = ./dist
SRC = ./src
BIN = ./bin
VIEWS = ./views
CSS = ./stylesheets
LIB = ${DIST}/lib

# TypeScript toolchain. tsc transpiles ./src (checked-in JS today, TS
# later) into ./tsbuild; every screen build below copies modules from
# ${JS} (the emitted tree) instead of ${SRC}. tsc itself comes from the
# provided by the repo's nix flake (flake.nix), like eslint -- never npm.
TSC = tsc
TS = ./tsbuild
JS = ${TS}/src

TIMESTAMP != date -u +'%Y-%m-%d--%T'

templates:
	@ go build -o ${BIN}/templates ./templates

locales:
	@ go build -o ${BIN}/locales ./locales

clean:
	@ rm -rf ${LIB} ${DIST} ${TS} ${BIN}/templates ${BIN}/locales

build: deps templates locales build-translations ts build-a build-s build-m build-p
	@ ${BIN}/templates -template=index -output=${DIST}/index.html -json='{"env":"${env}"}'

ts:
	@ ${TSC} -p .

test: ts
	@ ${BIN}/lint-ts ${SRC}
	@ ${TSC} -p tsconfig.test.json --noEmit
	@ node --experimental-strip-types --test test/*.test.ts

lint:
	@ ${BIN}/lint ${SRC}
	@ ${BIN}/lint-ts ${SRC}

deps:
	@ mkdir -p ${LIB}/fonts
	DEST=${LIB} ${BIN}/deps

	@ sed 's/var PptxGenJS=/window.PptxGenJS=/' ${LIB}/pptxgen.js > ${LIB}/pptxgen.js.$$$$ && mv ${LIB}/pptxgen.js.$$$$ ${LIB}/pptxgen.js

	@ # pptxgen.js is legacy minified JS the TS parser rejects; the sibling
	@ # .d.ts makes TS resolve the report.js import against a stub instead.
	@ printf 'declare const PptxGenJS: any;\nexport default PptxGenJS;\n' > ${LIB}/pptxgen.d.ts

	@ # tsc resolves the ../lib/* imports of ./src against ./lib; point it at
	@ # the same fetched tree the browser will load from dist.
	@ ln -sfn ${DIST}/lib lib

build-m:
	@ echo "Building my screen"
	@ mkdir -p ${DIST}/m

	@ ${BIN}/templates -template=m -output=${DIST}/m/index.html -json='{"env":"${env}"}'

	@ sed 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/m/index.html > ${DIST}/m/index.html.$$$$ && mv ${DIST}/m/index.html.$$$$ ${DIST}/m/index.html

	@ cp \
		${JS}/user.js \
		${JS}/utils.js \
		${JS}/sentry.js \
		${JS}/tabs.js \
		${JS}/translate.js \
		${JS}/toast.js \
		${JS}/m.js \
		${DIST}/m/

	@ cat \
		${LIB}/jwt-decode.js \
		${LIB}/d3.js \
		> ${DIST}/m/libs.js

	@ echo "window.EAE = {};" | cat - \
		settings.tmp.json \
		locales/translations.js.tmp \
		${JS}/eae.part.js \
		> ${DIST}/m/main.js

	@ cat \
		${CSS}/general.css \
		${CSS}/m.css \
		${CSS}/buttons.css \
		${CSS}/mobile.css \
		${CSS}/locale-picker.css \
		> ${DIST}/m/main.css

build-p:
	@ echo "Building snapshot screen"
	@ mkdir -p ${DIST}/p

	@ ${BIN}/templates -template=p -output=${DIST}/p/index.html -json='{"env":"${env}"}'

	@ sed 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/p/index.html > ${DIST}/p/index.html.$$$$ && mv ${DIST}/p/index.html.$$$$ ${DIST}/p/index.html

	@ cp \
		${JS}/user.js \
		${JS}/utils.js \
		${JS}/p.js \
		${DIST}/p/

	@ cat \
		${LIB}/jwt-decode.js \
		> ${DIST}/p/libs.js

	@ echo "window.EAE = {};" | cat - \
		settings.tmp.json \
		locales/translations.js.tmp \
		${JS}/eae.part.js \
		> ${DIST}/p/main.js

	@ cat \
		${CSS}/general.css \
		${CSS}/p.css \
		${CSS}/buttons.css \
		> ${DIST}/p/main.css

build-a:
	@ echo "Building analysis screen"
	@ mkdir -p ${DIST}/a

	@ ${BIN}/templates -template=a -output=${DIST}/a/index.html -json='{"env":"${env}"}'

	@ sed 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/a/index.html > ${DIST}/a/index.html.$$$$ && mv ${DIST}/a/index.html.$$$$ ${DIST}/a/index.html

	@ mkdir -p ${DIST}/a/components

	@ cp \
		${JS}/utils.js \
		${JS}/admin-tiers.js \
		${JS}/browser.js \
		${JS}/session.js \
		${JS}/analysis.js \
		${JS}/cards.js \
		${JS}/config.js \
		${JS}/controls.js \
		${JS}/search.js \
		${JS}/controls-search.js \
		${JS}/symbols.js \
		${JS}/geographies-search.js \
		${JS}/vectors-search.js \
		${JS}/area-analysis.js \
		${JS}/analysis-search.js \
		${JS}/right-panel-high-priority-areas.js \
		${JS}/modal-table-high-priority-areas.js \
		${JS}/locations-search.js \
		${JS}/points-loading.js \
		${JS}/ds.js \
		${JS}/parse.js \
		${JS}/output-widget.js \
		${JS}/right-panel-graphs.js \
		${JS}/right-panel-tabs.js \
		${JS}/right-panel-data-tab.js \
		${JS}/right-panel-data-state.js \
		${JS}/right-panel-prioritization-tab.js \
		${JS}/right-panel-poi-card.js \
		${JS}/right-panel.js \
		${JS}/mapbox.js \
		${JS}/plot.js \
		${JS}/rasters.js \
		${JS}/report.js \
		${JS}/summary.js \
		${JS}/timeline.js \
		${JS}/meiosis-stream.js \
		${JS}/timeline-state.js \
		${JS}/user.js \
		${JS}/help.js \
		${JS}/qa.js \
		${JS}/complicated.js \
		${JS}/qa-controls.js \
		${JS}/qa-outputs.js \
		${JS}/qa-indexes.js \
		${JS}/map-info.js \
		${JS}/panel-section.js \
		${JS}/export.js \
		${JS}/sentry.js \
		${JS}/translate.js \
		${JS}/toast.js \
		${JS}/filtered.js \
		${JS}/a.js \
		${DIST}/a/

	@ cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/sphericalmercator.js \
		${LIB}/html5sortable.js \
		${LIB}/jwt-decode.js \
		> ${DIST}/a/libs.js

	@ echo "window.EAE = {};" | cat - \
		settings.tmp.json \
		locales/translations.js.tmp \
		${JS}/eae.part.js \
		> ${DIST}/a/main.js

	@ cat \
		${CSS}/general.css \
		${CSS}/a.css \
		${CSS}/layout.css \
		${CSS}/left-panel.css \
		${CSS}/search.css \
		${CSS}/controls.css \
		${CSS}/maparea.css \
		${CSS}/right-panel.css \
		${CSS}/filtered.css \
		${CSS}/ripple.css \
		${CSS}/buttons.css \
		${CSS}/mobile.css \
		${CSS}/cards.css \
		${CSS}/config.css \
		${CSS}/card.css	\
		${CSS}/control.css \
		${CSS}/map-info.css \
		${CSS}/panel-section.css \
		${CSS}/locale-picker.css \
		> ${DIST}/a/main.css

build-s:
	@ echo "Building select screen"
	@ mkdir -p ${DIST}/s

	@ ${BIN}/templates -template=s -output=${DIST}/s/index.html -json='{"env":"${env}"}'

	@ sed 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/s/index.html > ${DIST}/s/index.html.$$$$ && mv ${DIST}/s/index.html.$$$$ ${DIST}/s/index.html

	@ cp \
		${JS}/utils.js \
		${JS}/browser.js \
		${JS}/user.js \
		${JS}/sentry.js \
		${JS}/toast.js \
		${JS}/s.js \
		${JS}/translate.js \
		${DIST}/s/

	@ cat \
		${LIB}/d3.js \
		${LIB}/jwt-decode.js \
		> ${DIST}/s/libs.js

	@ echo "window.EAE = {};" | cat - \
		settings.tmp.json \
		locales/translations.js.tmp \
		> ${DIST}/s/main.js

	@ cat \
		${CSS}/general.css \
		${CSS}/s.css \
		${CSS}/maparea.css \
		${CSS}/ripple.css \
		${CSS}/mobile.css \
		${CSS}/map-info.css \
		${CSS}/locale-picker.css \
		> ${DIST}/s/main.css

sync:
	@ rsync -OPr \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=files \
		--info=name1,progress0 \
		${DIST}/ ${SSH_USER}@${SSH_HOST}:${TOOL_DEST}

synced:
	@ rsync -OPr \
		--dry-run \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=files \
		--info=name1,progress0 \
		${DIST}/ ${SSH_USER}@${SSH_HOST}:${TOOL_DEST}

deploy:
	@ touch ${env}.diff development.diff

	@ echo "development => ${env}"

	@ echo "DRY-RUN"
	@ patch --dry-run --strip=1 --reverse --silent --force <development.diff
	@ patch --dry-run --strip=1 --silent --force <${env}.diff

	@ echo "PATCHING..."
	@ patch --strip=1 --reverse <development.diff
	@ patch --strip=1 <${env}.diff

	@ bmake reconfig build sync env=${env}

	@ printf "%s\n\n" ${TIMESTAMP} > .LASTDEPLOY
	@ git diff >> .LASTDEPLOY

	@ printf "\n%s\n" "${env} => development"

	@ echo "DRY-RUN"
	@ patch --dry-run --strip=1 --reverse --silent --force <${env}.diff
	@ patch --dry-run --strip=1 --silent --force <development.diff

	@ echo "PATCHING..."
	@ patch --strip=1 --reverse <${env}.diff
	@ patch --strip=1 <development.diff

	@ bmake reconfig build env=development

build-translations: locales/translations.csv locales/units.csv
	@ echo "Building translations"
	@ ${BIN}/locales \
		-translations=locales/translations.csv \
		-units=locales/units.csv \
		-output=locales/translations.js.tmp

reconfig:
	@ echo "Building settings.tmp.json - ${env}"

	@ tmp="settings.tmp.json.$$$$" && \
	printf "\n%s" "EAE['settings'] = " > "$$tmp" && \
	echo '{}' \
		| jq '.domain = ${DOMAIN}' \
		| jq '.world = ${WORLD}' \
		| jq '.title = ${TITLE}' \
		| jq '.database = ${API_URL}' \
		| jq '.storage = ${STORAGE_URL}' \
		| jq '.mapbox_token = ${MAPBOX_TOKEN}' \
		| jq '.mapbox_theme = ${MAPBOX_THEME}' \
		>> "$$tmp" && \
	printf ';\n' >> "$$tmp" && \
	mv "$$tmp" settings.tmp.json

.PHONY: templates locales ts test
