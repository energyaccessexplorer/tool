# Copy and customise these in a default.mk
#
# TOOL_PORT = 4231
#
# SRV_USER = someuser
# SRV_SERVER = example.org
# TOOL_DEST = /srv/http/energyaccessexplorer
#
# API_URL = http://api-example.localhost
# DB_SERV_DEPLOY = https://api.example.org
#
# STATIC_SERVER = python3 -m http.server ${TOOL_PORT}
# WATCH = <whatever daemon you use observe code changes>
#
# MAPBOX_DEFAULT_THEME=mapbox/basic-v9
#
.include <default.mk>

DIST = ./dist
SRC = ./src
VIEWS = ./views
CSS = ./stylesheets
LIB = ${DIST}/lib

default: build

build: build-a build-s reload

reload:
	@sleep 0.3
	-@chrome-remote-reload

deps:
	DEST=${DIST}/lib deps

start:
	cd ${DIST} && ${STATIC_SERVER}

watch:
	@ WATCH_CMD="make build reload" watch-code ${SRC} ${CSS} ${VIEWS}

stop:
	@stop-port ${TOOL_PORT}

build-a:
	@echo "Building a"
	@mkdir -p ${DIST}/a
	@cp ${VIEWS}/a.html ${DIST}/a/index.html
	@cp ${CSS}/ripple.css ${DIST}/a/ripple.css
	@cp ${CSS}/svg.css ${DIST}/a/svg.css

	@cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/location.js \
		${LIB}/htmlsortable.js \
		${LIB}/nanny.js \
		${LIB}/selectlist.js \
		${LIB}/dropdown.js \
		> ${DIST}/a/libs.js

	@echo -n "const ea_settings = " | cat - \
		settings.json \
		${SRC}/utils.js \
		${SRC}/shared.js \
		${SRC}/api.js \
		${SRC}/analysis.js \
		${SRC}/a.js \
		${SRC}/timeline.js \
		${SRC}/plot.js \
		${SRC}/overlord.js \
		${SRC}/svg.js \
		${SRC}/controls.js \
		${SRC}/ui.js \
		${SRC}/cards.js \
		${SRC}/indexes.js \
		${SRC}/datasets.js \
		${SRC}/mapbox.js \
		${SRC}/nanny-steps.js \
		${SRC}/report.js \
		${SRC}/summary.js \
		${SRC}/mobile.js \
		> ${DIST}/a/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/a.css \
		${CSS}/layout.css \
		${CSS}/controls.css \
		${CSS}/maparea.css \
		${CSS}/indexes.css \
		${CSS}/views.css \
		${CSS}/filtered.css \
		${CSS}/ripple.css \
		${CSS}/svg.css \
		${CSS}/summary.css \
		${CSS}/mobile.css \
		${CSS}/cards.css \
		> ${DIST}/a/main.css

	@cp ${SRC}/browser.js ${DIST}/a/


build-s:
	@echo "Building s"
	@mkdir -p ${DIST}/s
	@cp ${VIEWS}/s.html ${DIST}/s/index.html

	@cat \
		${LIB}/d3.js \
		${LIB}/topojson.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/selectlist.js \
		> ${DIST}/s/libs.js

	@echo -n "const ea_settings = " | cat - \
		settings.json \
		${SRC}/api.js \
		${SRC}/svg.js \
		${SRC}/ui.js \
		${SRC}/s.js \
		> ${DIST}/s/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/s.css \
		${CSS}/maparea.css \
		${CSS}/views.css \
		${CSS}/ripple.css \
		> ${DIST}/s/main.css

	@cp ${SRC}/browser.js ${DIST}/s/

synced:
	@rsync -OPrv \
		--dry-run \
		--info=FLIST0 \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		${DIST}/ ${SRV_USER}@${SRV_SERVER}:${TOOL_DEST}

deploy:
	make reconfig env=${env}
	make build

	@rsync -OPrv \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		--exclude=data \
		${DIST}/ ${SRV_USER}@${SRV_SERVER}:${TOOL_DEST}

	make reconfig env=development
	make build

reconfig:
	@echo '{}' \
		| jq '.database = ${API_URL}' \
		| jq '.mapbox_token = ${MAPBOX_TOKEN}' \
		| jq '.mapbox_theme = ${MAPBOX_THEME}' \
		> settings.json

.include <extras.mk>
