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

clean:
	@ rm -rf ${LIB} ${DIST}

build: deps build-a build-s build-m build-p
	@ mustache /tmp/empty.json views/index.mustache > ${DIST}/index.html

lint:
	@ ${BIN}/lint ${SRC}

deps:
	@ mkdir -p ${LIB}/fonts
	DEST=${LIB} ${BIN}/deps

	@ sed -i.orig 's/var PptxGenJS=/window.PptxGenJS=/' ${LIB}/pptxgen.js
	@ rm ${LIB}/pptxgen.js.orig

	@ echo '{}' >/tmp/empty.json

build-m:
	@ echo "Building my screen"
	@ mkdir -p ${DIST}/m

	@ mustache /tmp/empty.json ${VIEWS}/m.mustache > ${DIST}/m/index.html

	@ sed -r -i.orig 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/m/index.html
	@ rm ${DIST}/m/index.html.orig

	@ cp \
		${SRC}/user.js \
		${SRC}/utils.js \
		${SRC}/m.js \
		${SRC}/tabs.js \
		${DIST}/m/

	@ cat \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
		${LIB}/d3.js \
		> ${DIST}/m/libs.js

	@ echo "window.EAE = {};" | cat - \
		settings.tmp.json \
		${SRC}/eae.part.js \
		> ${DIST}/m/main.js

	@ cat \
		${CSS}/general.css \
		${CSS}/m.css \
		${CSS}/buttons.css \
		> ${DIST}/m/main.css

build-p:
	@ echo "Building snapshot screen"
	@ mkdir -p ${DIST}/p

	@ mustache /tmp/empty.json ${VIEWS}/p.mustache > ${DIST}/p/index.html

	@ sed -r -i.orig 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/p/index.html
	@ rm ${DIST}/p/index.html.orig

	@ cp \
		${SRC}/user.js \
		${SRC}/utils.js \
		${SRC}/p.js \
		${DIST}/p/

	@ cat \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
		> ${DIST}/p/libs.js

	@ echo "window.EAE = {};" | cat - \
		settings.tmp.json \
		${SRC}/eae.part.js \
		> ${DIST}/p/main.js

	@ cat \
		${CSS}/general.css \
		${CSS}/p.css \
		${CSS}/buttons.css \
		> ${DIST}/p/main.css

build-a:
	@ echo "Building analysis screen"
	@ mkdir -p ${DIST}/a

	@ mustache /tmp/empty.json ${VIEWS}/a.mustache > ${DIST}/a/index.html

	@ sed -r -i.orig 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/a/index.html
	@ rm ${DIST}/a/index.html.orig

	@ cp ${CSS}/ripple.css ${DIST}/a/ripple.css
	@ cp ${CSS}/buttons.css ${DIST}/a/buttons.css
	@ cp \
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
		${SRC}/complicated.js \
		${SRC}/qa-controls.js \
		${SRC}/qa-outputs.js \
		${SRC}/qa-snapshot.js \
		${SRC}/qa-indexes.js \
		${DIST}/a/

	@ cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/sphericalmercator.js \
		${LIB}/html5sortable.js \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
		> ${DIST}/a/libs.js

	@ echo "window.EAE = {};" | cat - \
		settings.tmp.json \
		${SRC}/eae.part.js \
		> ${DIST}/a/main.js

	@ cat \
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
	@ echo "Building select screen"
	@ mkdir -p ${DIST}/s

	@ mustache /tmp/empty.json ${VIEWS}/s.mustache > ${DIST}/s/index.html

	@ sed -r -i.orig 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/s/index.html
	@ rm ${DIST}/s/index.html.orig

	@ cp \
		${SRC}/utils.js \
		${SRC}/browser.js \
		${SRC}/user.js \
		${SRC}/s.js \
		${DIST}/s/

	@ cat \
		${LIB}/d3.js \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
		> ${DIST}/s/libs.js

	@ echo "window.EAE = {};" | cat - \
		settings.tmp.json \
		> ${DIST}/s/main.js

	@ cat \
		${CSS}/general.css \
		${CSS}/s.css \
		${CSS}/maparea.css \
		${CSS}/views.css \
		${CSS}/ripple.css \
		${CSS}/mobile.css \
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

deploy-all:
	bmake deploy env=production
	bmake deploy env=staging
	bmake deploy env=training

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

reconfig:
	@ echo "Building settings.tmp.json - ${env}"

	@ printf "\n%s" "EAE['settings'] = " > settings.tmp.json

	@ echo '{}' \
		| jq '.domain = ${DOMAIN}' \
		| jq '.world = ${WORLD}' \
		| jq '.title = ${TITLE}' \
		| jq '.database = ${API_URL}' \
		| jq '.storage = ${STORAGE_URL}' \
		| jq '.mapbox_token = ${MAPBOX_TOKEN}' \
		| jq '.mapbox_theme = ${MAPBOX_THEME}' \
		>> settings.tmp.json

	@ sed -i.orig -e '$$s/$$/;\n/' settings.tmp.json
	@ rm settings.tmp.json.orig
