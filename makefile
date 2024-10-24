default: reconfig build lint

.include ".env"
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

TIMESTAMP != date -u +'%Y-%m-%d--%T'

GITSHA != git log -n1 --format=format:"%H" | head -c 8
GITCLEAN != [ "`git diff --stat`" = '' ] || echo "-dirty"

build: build-a build-s build-m
	@mustache /dev/null views/index.mustache > ${DIST}/index.html
	@find . -name '*.orig' -delete

lint:
	@ ${BIN}/lint ${SRC}

deps:
	@mkdir -p ${LIB}/fonts
	DEST=${LIB} ${BIN}/deps

build-m:
	@echo "Building my screen"
	@mkdir -p ${DIST}/m

	@mustache /dev/null ${VIEWS}/m.html > ${DIST}/m/index.html

	@sed -r -i.orig 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/m/index.html

	@cp \
		${SRC}/user.js \
		${SRC}/utils.js \
		${SRC}/m.js \
		${SRC}/tabs.js \
		${DIST}/m/

	@cat \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
		> ${DIST}/m/libs.js

	@echo "window.EAE = {};" | cat - \
		settings.tmp.json \
		${SRC}/eae.part.js \
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

	@sed -r -i.orig 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/a/index.html

	@cp ${CSS}/ripple.css ${DIST}/a/ripple.css
	@cp ${CSS}/buttons.css ${DIST}/a/buttons.css
	@cp \
		${SRC}/utils.js \
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
		${SRC}/points-loading.js \
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
		${SRC}/qa-controls.js \
		${SRC}/qa-outputs.js \
		${SRC}/qa-snapshot.js \
		${SRC}/qa-indexes.js \
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

	@echo "window.EAE = {};" | cat - \
		settings.tmp.json \
		${SRC}/eae.part.js \
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
		${CSS}/config.css \
		> ${DIST}/a/main.css

build-s:
	@echo "Building select screen"
	@mkdir -p ${DIST}/s

	@mustache /dev/null ${VIEWS}/s.html > ${DIST}/s/index.html

	@sed -r -i.orig 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/s/index.html

	@cp \
		${SRC}/utils.js \
		${SRC}/browser.js \
		${SRC}/user.js \
		${SRC}/s.js \
		${DIST}/s/

	@cat \
		${LIB}/d3.js \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
		> ${DIST}/s/libs.js

	@echo "window.EAE = {};" | cat - \
		settings.tmp.json \
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
		${DIST}/ ${SSH_USER}@${SSH_HOST}:${TOOL_DEST}

synced:
	@rsync -OPr \
		--dry-run \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=files \
		--info=name1,progress0 \
		${DIST}/ ${SSH_USER}@${SSH_HOST}:${TOOL_DEST}

deploy:
	@touch ${env}.diff development.diff

	@echo "DRY-RUN development => ${env}"
	@echo "--------"
	patch --dry-run --strip=1 --reverse <development.diff
	@echo "--------"
	patch --dry-run --strip=1 <${env}.diff

	@echo ""
	@echo "PATCH development => ${env}"
	@echo "--------"
	@patch --strip=1 --reverse <development.diff
	@echo "--------"
	@patch --strip=1 <${env}.diff

	bmake reconfig build sync env=${env}

	@echo ""
	@echo "DRY-RUN ${env} => development"
	@echo "--------"
	patch --dry-run --strip=1 --reverse <${env}.diff
	@echo "--------"
	patch --dry-run --strip=1 <development.diff

	@echo ""
	@echo "PATCH ${env} => development"
	@echo "--------"
	@patch --strip=1 --reverse <${env}.diff
	@echo "--------"
	@patch --strip=1 <development.diff
	bmake reconfig build env=development

reconfig:
	@echo "Building settings.tmp.json - ${env}"

	@printf "\n%s" "EAE['settings'] = " > settings.tmp.json

	@echo '{}' \
		| jq '.domain = ${DOMAIN}' \
		| jq '.world = ${WORLD}' \
		| jq '.title = ${TITLE}' \
		| jq '.database = ${API_URL}' \
		| jq '.storage = ${STORAGE_URL}' \
		| jq '.mapbox_token = ${MAPBOX_TOKEN}' \
		| jq '.mapbox_theme = ${MAPBOX_THEME}' \
		>> settings.tmp.json

	@sed -i -e '$$s/$$/;\n/' settings.tmp.json
