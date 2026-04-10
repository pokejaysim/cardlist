#!/bin/bash
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Installing backend dependencies..."
  npm install
fi

exec npm run dev
