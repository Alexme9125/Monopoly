#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

pause_if_interactive() {
  if [ -t 0 ]; then
    read -r -p "按回车关闭此窗口… " _ || true
  fi
}

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "未找到 Node.js 或 npm。建议安装 Node.js 24 LTS（最低 22.12），然后重新双击此文件。"
  pause_if_interactive
  exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
  echo "当前 Node.js 版本过低。建议使用 Node.js 24 LTS，最低要求 22.12。"
  pause_if_interactive
  exit 1
fi

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:8787 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 8787 已有服务在运行，不会停止或覆盖它。"
  echo "请在浏览器访问 http://localhost:8787/ 检查。"
  pause_if_interactive
  exit 0
fi

if [ ! -x node_modules/.bin/vite ] || [ ! -x node_modules/.bin/tsx ]; then
  echo "首次启动：正在安装本地依赖…"
  if ! npm ci; then
    echo "依赖安装失败。请检查网络连接后重试。"
    pause_if_interactive
    exit 1
  fi
fi

if [ ! -f dist/index.html ]; then
  echo "正在构建游戏页面…"
  if ! npm run build; then
    echo "构建失败，请查看上方错误信息。"
    pause_if_interactive
    exit 1
  fi
fi

echo "棱镜假日即将在 http://localhost:8787/ 启动。"
echo "请保持此终端窗口打开；关闭窗口或按 Control-C 会停止服务。"
echo
if ! npm start; then
  echo "服务未能启动。若端口已被占用，请使用正在运行的服务。"
  pause_if_interactive
  exit 1
fi
