#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
ICONSET="$BUILD/icon.iconset"
SVG="$BUILD/icon.svg"
SRC="$BUILD/icon-1024.png"

if [[ ! -f "$SVG" ]]; then
  echo "Missing source icon: $SVG"
  exit 1
fi

echo "Rendering icon.svg → icon-1024.png"
npx --yes @resvg/resvg-js-cli "$SVG" "$SRC"

mkdir -p "$ICONSET"

sips -z 16 16   "$SRC" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32   "$SRC" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32   "$SRC" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64   "$SRC" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$SRC" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256 "$SRC" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SRC" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512 "$SRC" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SRC" --out "$ICONSET/icon_512x512.png" >/dev/null
cp "$SRC" "$ICONSET/icon_512x512@2x.png"

cp "$SRC" "$BUILD/icon.png"
npx --yes @resvg/resvg-js-cli "$BUILD/icon-dock.svg" "$BUILD/icon-dock.png"
sips -z 512 512 "$BUILD/icon-dock.png" --out "$BUILD/icon-dock-512.png" >/dev/null
sips -z 512 512 "$SRC" --out "$BUILD/icon-512.png" >/dev/null
sips -z 256 256 "$SRC" --out "$BUILD/icon-256.png" >/dev/null
sips -z 128 128 "$SRC" --out "$BUILD/icon-128.png" >/dev/null
sips -z 32 32   "$SRC" --out "$BUILD/icon-32.png" >/dev/null

PUBLIC="$ROOT/public"
mkdir -p "$PUBLIC"
cp "$BUILD/icon-32.png" "$PUBLIC/icon-32.png"
cp "$BUILD/icon-128.png" "$PUBLIC/icon-128.png"
cp "$BUILD/icon-256.png" "$PUBLIC/icon-256.png"

xattr -cr "$ICONSET" 2>/dev/null || true
iconutil -c icns "$ICONSET" -o "$BUILD/icon.icns"

echo "Generating icon.ico for Windows"
node -e "
const fs = require('fs');
const pngToIco = require('png-to-ico');
const png = fs.readFileSync('$BUILD/icon-256.png');
pngToIco(png).then(buf => {
  fs.writeFileSync('$BUILD/icon.ico', buf);
  console.log('icon.ico written');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
"

echo "Generated icons in $BUILD"
