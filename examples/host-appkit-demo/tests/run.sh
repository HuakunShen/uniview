#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${TMPDIR:-/tmp}/uniview-host-appkit-tests"
mkdir -p "$BUILD_DIR"

APP_SOURCES=(
	"$ROOT_DIR/HostAppKitDemo/Models/"*.swift
	"$ROOT_DIR/HostAppKitDemo/Services/"*.swift
	"$ROOT_DIR/HostAppKitDemo/ViewModels/"*.swift
	"$ROOT_DIR/HostAppKitDemo/Views/"*.swift
	"$ROOT_DIR/HostAppKitDemo/App/AppDelegate.swift"
	"$ROOT_DIR/HostAppKitDemo/App/MainViewController.swift"
	"$ROOT_DIR/HostAppKitDemo/App/MainWindowController.swift"
)

for test_file in "$ROOT_DIR/tests/"*.swift; do
	test_name="$(basename "$test_file" .swift)"
	binary="$BUILD_DIR/$test_name"
	swiftc -framework AppKit -o "$binary" "${APP_SOURCES[@]}" "$test_file"
	"$binary"
done
