.PATH: /t/mk
default: reconfig build lint
.include "env.mk"

# for a static configuration:
# .include ".env"
#
DIST = ./dist
SRC = ./src
BIN = ./bin
VIEWS = ./views
CSS = ./stylesheets
LIB = ${DIST}/lib

TIMESTAMP != date -u +'%Y-%m-%d--%T'

GITSHA != git log -n1 --format=format:"%H" | head -c 8
GITCLEAN != [ "`git diff --stat`" = '' ] || echo "-dirty"

build: build-a build-s build-m
	@cp views/index.html ${DIST}/index.html

lint:
	${BIN}/lint ${SRC}

deps:
	@mkdir -p ${LIB}/fonts
	DEST=${LIB} ${BIN}/deps

start:
	${HTTP_SERVER} --port ${TOOL_PORT} --dir ${DIST}

build-m:
	@echo "Building my screen"
	@mkdir -p ${DIST}/m

	@mustache /dev/null ${VIEWS}/m.html > ${DIST}/m/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/m/index.html

	@cp ${SRC}/user.js \
		${SRC}/m.js \
		${SRC}/bind.js \
		${DIST}/m/

	@cat \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
		> ${DIST}/m/libs.js

	@echo -n "window.ea_settings = " | cat - \
		settings.json \
		> ${DIST}/m/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/m.css \
		${CSS}/buttons.css \
		> ${DIST}/m/main.css

build-a:
	@echo "Building analysis screen"
	@mkdir -p ${DIST}/a

	@mustache /dev/null ${VIEWS}/a.html > ${DIST}/a/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/a/index.html

	@cp ${CSS}/ripple.css ${DIST}/a/ripple.css
	@cp ${CSS}/buttons.css ${DIST}/a/buttons.css
	@cp \
		${SRC}/admin-tiers.js \
		${SRC}/browser.js \
		${SRC}/session.js \
		${SRC}/analysis.js \
		${SRC}/cards.js \
		${SRC}/config.js \
		${SRC}/controls.js \
		${SRC}/search.js \
		${SRC}/controls-search.js \
		${SRC}/symbols.js \
		${SRC}/geographies-search.js \
		${SRC}/vectors-search.js \
		${SRC}/analysis-search.js \
		${SRC}/locations-search.js \
		${SRC}/ds.js \
		${SRC}/parse.js \
		${SRC}/indexes.js \
		${SRC}/filtered.js \
		${SRC}/mapbox.js \
		${SRC}/overlord.js \
		${SRC}/plot.js \
		${SRC}/rasters.js \
		${SRC}/report.js \
		${SRC}/summary.js \
		${SRC}/timeline.js \
		${SRC}/user.js \
		${SRC}/views.js \
		${SRC}/help.js \
		${SRC}/a.js \
		${SRC}/qa.js \
		${DIST}/a/

	@cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/sphericalmercator.js \
		${LIB}/html5sortable.js \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
		> ${DIST}/a/libs.js

	@echo -n "window.ea_settings = " | cat - \
		settings.json \
		${SRC}/utils.js \
		${SRC}/globals.js \
		> ${DIST}/a/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/a.css \
		${CSS}/layout.css \
		${CSS}/left-pane.css \
		${CSS}/search.css \
		${CSS}/controls.css \
		${CSS}/maparea.css \
		${CSS}/indexes.css \
		${CSS}/views.css \
		${CSS}/filtered.css \
		${CSS}/ripple.css \
		${CSS}/buttons.css \
		${CSS}/summary.css \
		${CSS}/mobile.css \
		${CSS}/cards.css \
		> ${DIST}/a/main.css

build-s:
	@echo "Building select screen"
	@mkdir -p ${DIST}/s

	@mustache /dev/null ${VIEWS}/s.html > ${DIST}/s/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/s/index.html

	@cp \
		${SRC}/browser.js \
		${SRC}/user.js \
		${SRC}/s.js \
		${DIST}/s/

	@cat \
		${LIB}/d3.js \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
		> ${DIST}/s/libs.js

	@echo -n "const ea_settings = " | cat - \
		settings.json \
		${SRC}/utils.js \
		> ${DIST}/s/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/s.css \
		${CSS}/maparea.css \
		${CSS}/views.css \
		${CSS}/ripple.css \
		> ${DIST}/s/main.css

sync:
	@echo ${GITSHA}${GITCLEAN} > ${DIST}/.sync-${env}

	@rsync -OPr \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=files \
		--info=name1,progress0 \
		${DIST}/ ${WEBSITE_SSH_USER}@${WEBSITE_HOST}:${TOOL_DEST}

synced:
	@rsync -OPr \
		--dry-run \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=files \
		--info=name1,progress0 \
		${DIST}/ ${WEBSITE_SSH_USER}@${WEBSITE_HOST}:${TOOL_DEST}

deploy:
	@touch ${env}.diff

	@echo "--------"

	@patch --strip=1 --reverse <development.diff
	@patch --strip=1 <${env}.diff
	bmake reconfig build sync env=${env}

	@echo "--------"

	@patch --strip=1 --reverse <${env}.diff
	@patch --strip=1 <development.diff
	bmake reconfig build env=development

reconfig:
	@echo "Building settings.json - ${env}"
	@echo '{}' \
		| jq '.domain = ${DOMAIN}' \
		| jq '.world = ${WORLD}' \
		| jq '.title = ${TITLE}' \
		| jq '.database = ${API_URL}' \
		| jq '.storage = ${STORAGE_URL}' \
		| jq '.mapbox_token = ${MAPBOX_TOKEN}' \
		| jq '.mapbox_theme = ${MAPBOX_THEME}' \
		> settings.json
