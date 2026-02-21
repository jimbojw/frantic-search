# ADR-005: Data Transfer Format

**Status:** Accepted

## Context

The app must download the full card dataset on first load. The dataset is large (~27,000+ cards), and the target audience includes mobile users on constrained connections. GitHub Pages automatically compresses text-based formats (JSON, HTML, CSS, JS) via `Content-Encoding: gzip`.

## Decision

Use **JSON** as the data format, served as a static `.json` file and compressed transparently by the hosting layer (GitHub Pages).

1. The ETL pipeline outputs a column-oriented `.json` file.
2. The browser fetches this file (automatically decompressed by the browser when the server sends `Content-Encoding: gzip`).
3. The JSON is parsed via `JSON.parse()` in a WebWorker.

## Alternatives Considered

**CBOR (Concise Binary Object Representation):** We prototyped CBOR output alongside JSON using `cbor-x`. Results on the actual dataset (~36,000 Oracle Cards, column-oriented layout with bitmask-encoded fields):

| Format | Raw    | Gzipped |
|--------|--------|---------|
| JSON   | 7.3 MB | 1.7 MB  |
| CBOR   | 6.7 MB | 1.8 MB  |

CBOR was slightly smaller raw but slightly *larger* after gzip. JSON's repetitive structural characters (`"`, `,`, `[`) compress exceptionally well, offsetting any per-value overhead. Since the transfer size (gzipped) is what matters for mobile users, CBOR offered no advantage.

CBOR would become relevant if we needed to store large binary blobs (e.g., raw `Uint8Array` buffers) that JSON cannot represent without Base64 encoding. Our current column-oriented design uses small integers for bitmasks and dictionary-encoded indices, which JSON handles efficiently.

## Rationale

- **Simplicity:** No extra dependencies in the app bundle (no CBOR decoder). `JSON.parse()` is one of the most optimized paths in every JS engine.
- **Transparent compression:** GitHub Pages (and most static hosts) serve `.json` files with `Content-Encoding: gzip` automatically — no build-time compression step needed.
- **Debuggability:** JSON is human-readable. The ETL output can be inspected directly with `jq` or any text editor.
- **WebWorker parsing:** `JSON.parse()` of ~7 MB completes in well under 100ms on modern devices, which is acceptable for a one-time load in a background thread.

## Consequences

- **Positive:** Zero runtime dependencies for deserialization.
- **Positive:** No build step for compression; hosting handles it.
- **Positive:** Easy to debug and iterate on the ETL output format.
- **Negative:** JSON keys are repeated per-object in row-oriented layouts (mitigated by our column-oriented design, where keys appear only once).
- **Negative:** If we later need raw binary data (e.g., pre-built search indices as typed arrays), we would need to revisit this decision.
