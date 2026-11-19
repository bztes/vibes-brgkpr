#!/bin/bash
set -euo pipefail

mkdir -p /data/ssh/host_keys "$REPO_DIR"

# optional: run as a different uid/gid than the image's borg user (1000)
if [ -n "${PGID:-}" ]; then groupmod -o -g "$PGID" borg; fi
if [ -n "${PUID:-}" ]; then usermod -o -u "$PUID" borg >/dev/null; fi

for type in ed25519 rsa; do
	key="/data/ssh/host_keys/ssh_host_${type}_key"
	if [ ! -f "$key" ]; then
		echo "Generating SSH host key ($type)"
		ssh-keygen -q -t "$type" -N '' -f "$key"
	fi
done
chown root:root /data/ssh/host_keys /data/ssh/host_keys/*
chmod 755 /data/ssh/host_keys
chmod 600 /data/ssh/host_keys/*_key

# sshd's StrictModes requires the authorized_keys path to be owned by the user or root
chown borg:borg /data /data/ssh "$REPO_DIR"
chmod 755 /data
chmod 700 /data/ssh
find /data -maxdepth 1 -name 'brgkpr.db*' -exec chown borg:borg {} +
[ -f /data/ssh/authorized_keys ] && chown borg:borg /data/ssh/authorized_keys

/usr/sbin/sshd -D -e &
setpriv --reuid=borg --regid=borg --init-groups env HOME=/home/borg node /app/server.js &

# stop the container if either process exits
wait -n
exit $?
