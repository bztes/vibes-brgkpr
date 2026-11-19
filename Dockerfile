# syntax=docker/dockerfile:1

FROM node:24-trixie-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-trixie-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@12.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:24-trixie-slim
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssh-server borgbackup tini \
	&& rm -rf /var/lib/apt/lists/* /etc/ssh/ssh_host_* \
	&& userdel -r node && useradd --create-home --shell /bin/sh --uid 1000 --user-group borg \
	&& usermod -p '*' borg \
	&& mkdir -p /run/sshd /data /repos

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY server.js ./
COPY drizzle ./drizzle
COPY docker/sshd_config /etc/ssh/sshd_config
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/brgkpr-serve ./docker/brgkpr-serve
RUN chmod +x /entrypoint.sh ./docker/brgkpr-serve

ENV NODE_ENV=production \
	PORT=3000 \
	DATA_DIR=/data \
	REPO_DIR=/repos

VOLUME ["/data", "/repos"]
EXPOSE 3000 22

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/entrypoint.sh"]
