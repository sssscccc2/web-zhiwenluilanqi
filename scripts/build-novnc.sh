#!/bin/bash
# 构建 noVNC 打包文件
# 用法: bash scripts/build-novnc.sh

set -e

NOVNC_DIR="/opt/noVNC"
if [ ! -d "$NOVNC_DIR" ]; then
  NOVNC_DIR="/usr/share/novnc"
fi
if [ ! -d "$NOVNC_DIR" ]; then
  echo "Error: noVNC not found at /opt/noVNC or /usr/share/novnc"
  echo "Install with: apt install -y novnc"
  exit 1
fi

echo "Using noVNC from: $NOVNC_DIR"

# Create patched copy to remove top-level await
PATCH_DIR="/tmp/novnc-patch-$$"
mkdir -p "$PATCH_DIR/core/util"
cp -r "$NOVNC_DIR/core/"* "$PATCH_DIR/core/"
cp -r "$NOVNC_DIR/vendor" "$PATCH_DIR/vendor"

# Patch top-level await in browser.js
sed -i 's/supportsWebCodecsH264Decode = await _checkWebCodecsH264DecodeSupport();/_checkWebCodecsH264DecodeSupport().then(function(v) { supportsWebCodecsH264Decode = v; });/' \
  "$PATCH_DIR/core/util/browser.js"

echo "Patched browser.js (removed top-level await)"

# Create entry file
cat > /tmp/novnc-entry-$$.js << EOF
import RFB from '$PATCH_DIR/core/rfb.js';
window.noVNC_RFB = RFB;
EOF

# Bundle
mkdir -p server/public
npx esbuild "/tmp/novnc-entry-$$.js" \
  --bundle \
  --format=iife \
  --global-name=noVNC \
  --outfile=server/public/novnc-bundle.js \
  --minify

# Cleanup
rm -rf "$PATCH_DIR" "/tmp/novnc-entry-$$.js"

echo "Done! Output: server/public/novnc-bundle.js ($(du -h server/public/novnc-bundle.js | cut -f1))"
