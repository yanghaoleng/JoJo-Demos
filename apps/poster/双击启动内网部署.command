#!/bin/zsh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

REQUESTED_PORT="${PORT:-5173}"
PORT="$REQUESTED_PORT"

pause_on_exit() {
  local code="$?"
  if [ "$code" -ne 0 ]; then
    echo ""
    echo "启动失败，按任意键关闭窗口。"
    read -k 1 -s
  fi
}

trap pause_on_exit EXIT

find_free_port() {
  local start="$1"
  local candidate="$start"
  while lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; do
    candidate=$((candidate + 1))
  done
  echo "$candidate"
}

print_urls() {
  local port="$1"
  echo ""
  echo "本机访问："
  echo "  http://localhost:$port/"
  echo ""
  echo "内网访问："
  local ips
  ips="$(ifconfig | awk '/inet / && $2 !~ /^127\./ {print $2}')"
  if [ -z "$ips" ]; then
    echo "  未找到内网 IP，请确认当前设备已连接局域网。"
  else
    echo "$ips" | while read -r ip; do
      [ -n "$ip" ] && echo "  http://$ip:$port/"
    done
  fi
  echo ""
}

echo "杨总，正在启动小红书打卡分享本地内网部署..."
echo "项目目录：$PROJECT_DIR"
echo ""

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm。请先安装 Node.js 后再双击启动。"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "首次运行，正在安装依赖..."
  npm install
  echo ""
fi

PORT="$(find_free_port "$REQUESTED_PORT")"
if [ "$PORT" != "$REQUESTED_PORT" ]; then
  echo "端口 $REQUESTED_PORT 已被占用，自动改用端口 $PORT。"
  echo ""
fi

echo "正在构建生产包..."
npm run build

print_urls "$PORT"

open "http://localhost:$PORT/" >/dev/null 2>&1 || true

echo "服务已启动。保持这个窗口打开，内网设备即可访问上面的地址。"
echo "需要停止服务时，在这个窗口按 Control + C。"
echo ""

npx vite preview --host 0.0.0.0 --port "$PORT"
