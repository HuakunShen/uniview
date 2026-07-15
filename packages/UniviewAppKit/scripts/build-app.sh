#!/usr/bin/env bash
# Build UniviewDemoApp and wrap it in a proper .app bundle so it registers with
# the window server (correct bundle id, Dock/menu-bar identity, reliable capture).
set -euo pipefail

cd "$(dirname "$0")/.."
CONFIG="${1:-debug}"

swift build --product UniviewDemoApp -c "$CONFIG"
BIN_DIR="$(swift build --show-bin-path -c "$CONFIG")"

APP="$BIN_DIR/Uniview.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN_DIR/UniviewDemoApp" "$APP/Contents/MacOS/UniviewDemoApp"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>UniviewDemoApp</string>
  <key>CFBundleIdentifier</key><string>tech.huakun.uniview</string>
  <key>CFBundleName</key><string>Uniview Desktop</string>
  <key>CFBundleDisplayName</key><string>Uniview Desktop</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

echo "Built $APP"
