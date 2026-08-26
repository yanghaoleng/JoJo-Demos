#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_TAG:?RELEASE_TAG is required}"

site_config="/etc/nginx/sites-enabled/mikeywa.site"
backup_dir="/var/backups/nginx-jocam"
backup_config="${backup_dir}/mikeywa.site.${RELEASE_TAG}"

install -m 0644 /tmp/jocam-proxy.conf /etc/nginx/snippets/jocam-proxy.conf
mkdir -p "${backup_dir}"
cp -a "${site_config}" "${backup_config}"

if ! grep -qF 'include /etc/nginx/snippets/jocam-proxy.conf;' "${site_config}"; then
  sed -i '/include \/etc\/nginx\/snippets\/jenniechat.conf;/a\    include /etc/nginx/snippets/jocam-proxy.conf;' "${site_config}"
fi

if ! nginx -t; then
  cp -a "${backup_config}" "${site_config}"
  nginx -t
  exit 1
fi

systemctl reload nginx
printf 'proxy_release=%s\nnginx=%s\n' "${RELEASE_TAG}" "$(systemctl is-active nginx)"
