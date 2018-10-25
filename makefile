include default.mk

start:
	@static-server -noauth -port ${WEB_PORT} -dir ./dist &
	@postgrest ./postgrest.conf &

stop:
	-@lsof -t -i :${WEB_PORT} | xargs -i kill {}
	-@lsof -t -i :${PGREST_PORT} | xargs -i kill {}

deploy:
	@sed -i \
		-e 's%database: "${DB_SERV_DEV}",%database: "${DB_SERV_PROD}",%' \
		${DIST}/settings.js

	@rsync -OPrv \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		./${DIST}/ ${SRV_USER}@${SRV_SERVER}:${SRV_DEST}

	@sed -i \
		-e 's%database: "${DB_SERV_PROD}",%database: "${DB_SERV_DEV}",%' \
		${DIST}/settings.js
