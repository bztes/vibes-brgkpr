# brgkpr

Self-hosted web interface for backup repositories using [Borg](https://www.borgbackup.org/) (over SSH) and [restic](https://restic.net/) (REST backend over HTTP).

> This project is vibe-coded and in beta. It is not intended for production use yet.

- Multiple users with their own repositories and keys; the first account becomes administrator
- Storage limit per user, quota and append-only mode per repository or key
- Size, last backup and connection log per repository
- Notifications via email or webhook (e.g. [ntfy](https://ntfy.sh)) for missing backups or nearly full quotas

## Quick start

Download [compose.yml](compose.yml) and [.env.example](.env.example) as `.env` next to it, adjust `.env` (all options are described there), then:

```sh
docker compose up -d
```

- Web interface: <http://localhost:3000>, create the first account here
- Borg: SSH on port `2222`
- restic: `/restic/` on the web interface port

Put the web interface behind a reverse proxy with TLS that passes the original `Host` header and allows large uploads (nginx: `proxy_set_header Host $host;` and `client_max_body_size 0;`).

Without a reverse proxy, set `ORIGIN` in `.env`, otherwise logins and all other forms are rejected with `403`.

Under **Settings**, set the public URL of the web interface (**Auto** takes the current address); it is used for notification links and repository URLs. If the SSH port differs from `2222`, change it there too.

## Connecting a client

Create a repository, then add a key (Borg: public SSH key, restic: generated credentials).

```sh
# Borg
export BORG_REPO='ssh://borg@backup.example.com:2222/./<repo>'
borg init --encryption=repokey-blake2

# restic (0.17 or later)
export RESTIC_REPOSITORY='rest:https://backup.example.com/restic/<repo>/'
export RESTIC_REST_USERNAME='<key ID>'
export RESTIC_REST_PASSWORD='<key password>'
restic init
```

For development, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0-or-later](LICENSE)
