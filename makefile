include default.mk

start:
	@ static-server -noauth -port ${WEB_PORT}

deploy:
	@rsync -OPrv \
		--checksum \
		--delete-before \
		--exclude=data--* \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		--exclude=config.json \
		./ ${SRV_USER}@${SRV_SERVER}:${SRV_DEST}
