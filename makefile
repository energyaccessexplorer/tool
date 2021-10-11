.include ".env"

DIST = ./dist
SRC = ./src
BIN = ./bin
VIEWS = ./views
CSS = ./stylesheets
LIB = ${DIST}/lib

TIMESTAMP != date -u +'%Y-%m-%d--%T'

GITSHA != git log -n1 --format=format:"%H" | head -c 8
GITCLEAN != [ "`git diff --stat`" = '' ] || echo "-dirty"

default: reconfig build reload

build: lint build-a build-s build-d

lint:
	@${BIN}/lint ${SRC}

reload:
	-@chrome-remote-reload

deps:
	DEST=${DIST}/lib ${BIN}/deps

start:
	httpserver -port ${TOOL_PORT} -dir ${DIST}

stop:
	@stop-port ${TOOL_PORT}

build-a:
	@echo "Building analysis screen"
	@mkdir -p ${DIST}/a

	@mustache /dev/null ${VIEWS}/a.html > ${DIST}/a/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/a/index.html

	@cp ${CSS}/ripple.css ${DIST}/a/ripple.css
	@cp ${SRC}/{browser,analysis,cards,config,controls,search,controls-search,geographies-search,vectors-search,analysis-search,locations-search,ds,parse,indexes,mapbox,overlord,plot,report,summary,timeline,user,views,nanny-steps,a}.js ${DIST}/a/

	@cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/sphericalmercator.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/html5sortable.js \
		${LIB}/nanny.js \
		${LIB}/bubblearrow.js \
		${LIB}/selectlist.js \
		${LIB}/dropdown.js \
		${LIB}/pgrest.js \
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
		${CSS}/summary.css \
		${CSS}/mobile.css \
		${CSS}/cards.css \
		> ${DIST}/a/main.css

build-s:
	@echo "Building select screen"
	@mkdir -p ${DIST}/s

	@mustache /dev/null ${VIEWS}/s.html > ${DIST}/s/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/s/index.html

	@cp ${SRC}/{browser,s}.js ${DIST}/s/

	@cat \
		${LIB}/d3.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/bubblearrow.js \
		${LIB}/selectlist.js \
		${LIB}/pgrest.js \
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

build-d:
	@echo "Building test screen"
	@mkdir -p ${DIST}/d

	@mustache /dev/null ${VIEWS}/d.html > ${DIST}/d/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/d/index.html

	@cp ${CSS}/ripple.css ${DIST}/d/ripple.css
	@cp ${SRC}/{cards,timeline,controls,controls-search,ds,parse,mapbox,overlord,plot,d}.js ${DIST}/d/

	@cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/dropdown.js \
		${LIB}/pgrest.js \
		> ${DIST}/d/libs.js

	@echo -n "window.ea_settings = " | cat - \
		settings.json \
		${SRC}/utils.js \
		${SRC}/globals.js \
		> ${DIST}/d/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/layout.css \
		${CSS}/maparea.css \
		> ${DIST}/d/main.css

sync:
	@echo ${GITSHA}${GITCLEAN} > ${DIST}/.sync-${env}

	@rsync -OPrv \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=files \
		${DIST}/ ${WEBSITE_SSH_USER}@${WEBSITE_HOST}:${TOOL_DEST}

synced:
	@rsync -OPrv \
		--dry-run \
		--info=FLIST0 \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=files \
		${DIST}/ ${WEBSITE_SSH_USER}@${WEBSITE_HOST}:${TOOL_DEST}

deploy:
	patch -p1 <${env}.diff
	bmake reconfig build sync env=${env}

	patch -p1 --reverse <${env}.diff
	bmake reconfig build reload env=development

reconfig:
	@echo '{}' \
		| jq '.database = ${API_URL}' \
		| jq '.storage = ${STORAGE_URL}' \
		| jq '.mapbox_token = ${MAPBOX_TOKEN}' \
		| jq '.mapbox_theme = ${MAPBOX_THEME}' \
		> settings.json

	@cat settings.json

.include <extras.mk>
