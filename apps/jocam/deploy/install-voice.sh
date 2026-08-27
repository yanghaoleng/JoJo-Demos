#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_TAG:?RELEASE_TAG is required}"

release_root="/opt/jocam-voice/releases"
release_dir="${release_root}/${RELEASE_TAG}"
service_file="/etc/systemd/system/jocam-voice.service"

test -f /etc/jocam/voice.env
test ! -e "${release_dir}"
id jocam-voice >/dev/null 2>&1 || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin jocam-voice
mkdir -p "${release_dir}" /etc/jocam /var/log/jocam-voice
tar -xzf /tmp/jocam-voice-release.tgz -C "${release_dir}"
if test ! -f "${release_dir}/server/node_modules/ws/package.json"; then
  command -v npm >/dev/null 2>&1
  npm install --omit=dev --ignore-scripts --prefix "${release_dir}/server"
fi
chown -R root:root "${release_dir}"
chown jocam-voice:jocam-voice /var/log/jocam-voice
chmod 0600 /etc/jocam/voice.env
install -m 0644 "${release_dir}/server/jocam-voice.service" "${service_file}"

ln -sfn "${release_dir}" /opt/jocam-voice/current.next
mv -Tf /opt/jocam-voice/current.next /opt/jocam-voice/current
systemctl daemon-reload
systemctl enable --now jocam-voice.service
systemctl restart jocam-voice.service
systemctl is-active jocam-voice.service
