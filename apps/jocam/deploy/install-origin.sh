#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_TAG:?RELEASE_TAG is required}"

release_root="/var/www/jocam/releases"
release_dir="${release_root}/${RELEASE_TAG}"
site_config="/etc/nginx/sites-enabled/rive.mikeywa.site"
backup_dir="/var/backups/nginx-jocam"
backup_config="${backup_dir}/rive.mikeywa.site.${RELEASE_TAG}"

test ! -e "${release_dir}"
mkdir -p "${release_dir}"
tar -xzf /tmp/jocam-release.tgz --strip-components=1 -C "${release_dir}"

find "${release_dir}" -type f \( -name '*.js' -o -name '*.css' -o -name '*.wasm' -o -name '*.riv' -o -name '*.tflite' \) -exec gzip -9 -k {} \;
chown -R root:root "${release_dir}"
find "${release_dir}" -type d -exec chmod 0755 {} +
find "${release_dir}" -type f -exec chmod 0644 {} +

install -m 0644 /tmp/jocam-origin.conf /etc/nginx/snippets/jocam-origin.conf
mkdir -p "${backup_dir}"
cp -a "${site_config}" "${backup_config}"

if ! grep -qF 'include /etc/nginx/snippets/jocam-origin.conf;' "${site_config}"; then
  sed -i '/include \/etc\/nginx\/snippets\/rive-data.conf;/a\    include /etc/nginx/snippets/jocam-origin.conf;' "${site_config}"
fi

mkdir -p /var/www/jocam
ln -sfn "${release_dir}" /var/www/jocam/current.next
mv -Tf /var/www/jocam/current.next /var/www/jocam/current

if ! nginx -t; then
  cp -a "${backup_config}" "${site_config}"
  nginx -t
  exit 1
fi

systemctl reload nginx
printf 'release=%s\ncurrent=%s\nnginx=%s\n' "${RELEASE_TAG}" "$(readlink -f /var/www/jocam/current)" "$(systemctl is-active nginx)"
