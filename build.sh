#!/bin/bash
#
# Build / run Plash from the command line.
#
# Plash's source was restored from the last open-source revision, so it builds
# with a standard Xcode install (Xcode 16+ recommended; tested with Xcode 27).
#
# Usage:
#   ./build.sh            Build the app (Debug, code signing off — fast compile check)
#   ./build.sh run        Build and launch the app
#   ./build.sh release    Build the app (Release)
#   ./build.sh clean      Remove the derived-data directory
#
# Notes:
#   - Auto-detects an Xcode installation (prefers a beta if that's all there is).
#   - The project has a SwiftLint build phase; if `swiftlint` isn't installed we
#     shim it with a no-op so the build still succeeds.
#
set -euo pipefail

cd "$(dirname "$0")"

PROJECT="Plash.xcodeproj"
SCHEME="Plash"
DERIVED_DATA="${DERIVED_DATA:-./.build-dd}"
ACTION="${1:-build}"
CONFIG="Debug"

# --- Locate a usable Xcode (not the Command Line Tools) -------------------------
if [[ -z "${DEVELOPER_DIR:-}" ]]; then
	current="$(xcode-select -p 2>/dev/null || true)"
	if [[ "$current" == *"/Xcode"*".app/"* ]]; then
		DEVELOPER_DIR="$current"
	else
		for app in /Applications/Xcode.app /Applications/Xcode-beta.app; do
			if [[ -d "$app" ]]; then
				DEVELOPER_DIR="$app/Contents/Developer"
				break
			fi
		done
	fi
fi

if [[ -z "${DEVELOPER_DIR:-}" || ! -d "$DEVELOPER_DIR" ]]; then
	echo "error: could not find an Xcode installation. Install Xcode or set DEVELOPER_DIR." >&2
	exit 1
fi
export DEVELOPER_DIR
echo "Using: $("$DEVELOPER_DIR/usr/bin/xcodebuild" -version | head -1)"

# --- Shim swiftlint if it isn't installed --------------------------------------
if ! command -v swiftlint >/dev/null 2>&1; then
	shim_dir="$(mktemp -d)"
	printf '#!/bin/sh\nexit 0\n' > "$shim_dir/swiftlint"
	chmod +x "$shim_dir/swiftlint"
	export PATH="$shim_dir:$PATH"
	echo "note: swiftlint not found — using a no-op shim for the lint build phase."
fi

if [[ "$ACTION" == "clean" ]]; then
	rm -rf "$DERIVED_DATA"
	echo "Removed $DERIVED_DATA"
	exit 0
fi

if [[ "$ACTION" == "release" ]]; then
	CONFIG="Release"
	ACTION="build"
fi

common_args=(
	-project "$PROJECT"
	-scheme "$SCHEME"
	-configuration "$CONFIG"
	-destination 'platform=macOS,arch=arm64'
	-derivedDataPath "$DERIVED_DATA"
	-skipMacroValidation
)

case "$ACTION" in
	build)
		xcodebuild "${common_args[@]}" \
			CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
			build
		echo "Built: $DERIVED_DATA/Build/Products/$CONFIG/Plash.app"
		;;
	run)
		# Ad-hoc sign so the sandboxed app can launch locally.
		xcodebuild "${common_args[@]}" \
			CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=YES CODE_SIGNING_ALLOWED=YES \
			build
		app="$DERIVED_DATA/Build/Products/$CONFIG/Plash.app"
		echo "Launching $app"
		open "$app"
		;;
	*)
		echo "Unknown action: $ACTION (expected: build | run | release | clean)" >&2
		exit 1
		;;
esac
