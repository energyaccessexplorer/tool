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
.include <env.mk>

DIST = ./dist
SRC = ./src
VIEWS = ./views
CSS = ./stylesheets
LIB = ${DIST}/lib

TIMESTAMP != date -u +'%Y-%m-%d--%T'

default: reconfig build reload

build: build-a build-s

reload:
	@sleep 0.3
	-@chrome-remote-reload

deps:
	DEST=${DIST}/lib deps

start:
	cd ${DIST} && ${STATIC_SERVER}

stop:
	@stop-port ${TOOL_PORT}

build-a:
	@echo "Building a"
	@mkdir -p ${DIST}/a

	@mustache /dev/null ${VIEWS}/a.html > ${DIST}/a/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/a/index.html

	@cp ${CSS}/ripple.css ${DIST}/a/ripple.css
	@cp ${CSS}/svg.css ${DIST}/a/svg.css
	@cp ${SRC}/{analysis,cards,controls,ds,dsparse,indexes,mapbox,overlord,plot,report,summary,timeline}.js ${DIST}/a/

	@cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/html5sortable.js \
		${LIB}/nanny.js \
		${LIB}/selectlist.js \
		${LIB}/dropdown.js \
		${LIB}/pgrest.js \
		> ${DIST}/a/libs.js

	@echo -n "window.ea_settings = " | cat - \
		settings.json \
		${SRC}/utils.js \
		${SRC}/shared.js \
		${SRC}/a.js \
		${SRC}/nanny-steps.js \
		${SRC}/mobile.js \
		${SRC}/globals.js \
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

	@mustache /dev/null ${VIEWS}/s.html > ${DIST}/s/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/s/index.html

	@cat \
		${LIB}/d3.js \
		${LIB}/topojson.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/selectlist.js \
		${LIB}/pgrest.js \
		> ${DIST}/s/libs.js

	@echo -n "const ea_settings = " | cat - \
		settings.json \
		${SRC}/s.js \
		> ${DIST}/s/main.js

	@cp ${SRC}/browser.js ${DIST}/s/

	@cat \
		${CSS}/general.css \
		${CSS}/s.css \
		${CSS}/maparea.css \
		${CSS}/views.css \
		${CSS}/ripple.css \
		> ${DIST}/s/main.css

	@cp ${SRC}/browser.js ${DIST}/s/

sync:
	@rsync -OPrv \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		${DIST}/ ${WEBSITE_SRV_USER}@${WEBSITE_SRV_SERVER}:${TOOL_DEST}

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
		${DIST}/ ${WEBSITE_SRV_USER}@${SRV_SERVER}:${TOOL_DEST}

deploy:
	make reconfig build sync env=${env}
	make reconfig build reload env=development

reconfig:
	@echo '{}' \
		| jq '.database = ${API_URL}' \
		| jq '.mapbox_token = ${MAPBOX_TOKEN}' \
		| jq '.mapbox_theme = ${MAPBOX_THEME}' \
		> settings.json

	@cat settings.json

.include <extras.mk>
