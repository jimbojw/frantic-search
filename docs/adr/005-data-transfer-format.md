# ADR-005: Data Transfer Format

**Status:** Accepted

## Context

The app must download the full card dataset on first load. The dataset is large (~27,000+ cards), and the target audience includes mobile users on constrained connections. GitHub Pages automatically compresses text-based formats (JSON, HTML, CSS, JS) but does **not** compress binary assets.

## Decision

Use **CBOR** (Concise Binary Object Representation) as the data format, **Gzip-compressed at build time** and **manually decompressed in the browser**.

1. The ETL pipeline outputs a `.cbor.gz` file.
2. The WebWorker fetches this file and decompresses it using the native `DecompressionStream` API.
3. The decompressed CBOR buffer is decoded into the in-memory search index.

## Rationale

- **CBOR over JSON:** CBOR natively supports binary data (typed arrays, bitmasks) without Base64 encoding overhead. This aligns with the bit-packed data representation (see ADR-007).
- **Manual Gzip:** Since GitHub Pages does not compress `.cbor` files, pre-compressing ensures the smallest possible download regardless of hosting configuration.
- **WebWorker decompression:** Running `DecompressionStream` in the worker avoids blocking the main thread entirely.

## Consequences

- **Positive:** Guaranteed compression on any static host, not just GitHub Pages.
- **Positive:** Binary format affords compact bit-packed fields without serialization overhead.
- **Negative:** Adds a build step (gzip) and a runtime step (decompress + decode) compared to plain JSON.
- **Negative:** CBOR is not human-readable; debugging requires tooling or an intermediate JSON dump.
