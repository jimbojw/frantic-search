# Generating App Icons

Favicon and PWA icons are derived from the face portion of the Frantic Search art crop used as the banner (see `app/index.html` og:image).

## When to Re-run

- You change the banner art or crop region
- You add new icon sizes (e.g. for Apple touch icon)
- The generated files are missing or corrupted

## Prerequisites

- **ImageMagick** (`convert` must be on PATH)
- **curl**

## Usage

```bash
npm run generate-icons
```

Or run directly:

```bash
./scripts/generate-icons.sh
```

## Crop Parameters

The script extracts a 131×131 pixel square at offset (285, 44) from the top-left of the 626×457 art crop. This isolates the wizard's face.

| Output           | Size    | Purpose                    |
|------------------|---------|----------------------------|
| favicon.ico      | 16–64px | Browser tab, bookmarks     |
| pwa-192x192.png  | 192px   | Mobile home screen         |
| pwa-512x512.png  | 512px   | PWA splash / install UI    |

Source URL is hardcoded in the script to match `app/index.html` and `app/vite.config.ts`.
