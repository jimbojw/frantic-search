#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Generates favicon.ico and PWA icons from the Frantic Search art crop.
# See docs/guides/generate-icons.md for details.

set -euo pipefail

SRC_URL="https://cards.scryfall.io/art_crop/front/1/9/1904db14-6df7-424f-afa5-e3dfab31300a.jpg"
CROP="131x131+285+44"
PUBLIC_DIR="$(cd "$(dirname "$0")/.." && pwd)/app/public"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

curl -sSL -o "$tmp/source.jpg" "$SRC_URL"
convert "$tmp/source.jpg" -crop "$CROP" +repage "$tmp/face.png"

mkdir -p "$PUBLIC_DIR"
convert "$tmp/face.png" -define icon:auto-resize=64,48,32,16 "$PUBLIC_DIR/favicon.ico"
convert "$tmp/face.png" -resize 192x192 "$PUBLIC_DIR/pwa-192x192.png"
convert "$tmp/face.png" -resize 512x512 "$PUBLIC_DIR/pwa-512x512.png"

echo "Icons generated in app/public/"
