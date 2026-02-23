![Frantic Search card art by Mitchell Malloy](https://wsrv.nl/?url=cards.scryfall.io/art_crop/front/1/9/1904db14-6df7-424f-afa5-e3dfab31300a.jpg&w=900&h=80&fit=cover&a=focal&fpx=0.5&fpy=0.23)

# Frantic Search

A single-page app (SPA), mobile optimized, for performing instant search across Magic: The Gathering cards. Built with TypeScript, Node.js, and Vite.

**[Try it live →](https://jimbojw.github.io/frantic-search/)**

## Project Structure

```
frantic-search/
├── app/        # SolidJS SPA (Vite)
├── cli/        # Command-line query tools
├── etl/        # Data pipeline: fetch Scryfall bulk data, transform for client
├── shared/     # Shared types and search logic (Card, Set, filter logic)
└── package.json
```

- **`app/`** — The main frontend. SolidJS + Vite. Includes a WebWorker for instant search without blocking the UI.
- **`cli/`** — Command-line tools for parsing and inspecting Scryfall-style queries.
- **`etl/`** — Node.js scripts to fetch MTG card data (e.g., from Scryfall) and process it into a compact format for the client.
- **`shared/`** — TypeScript types (`Card`, `Set`) and search/filter logic shared between `etl`, `cli`, and the app's WebWorker.

## Development

```bash
npm install
npm run dev    # starts the app dev server
```

## License

ISC
