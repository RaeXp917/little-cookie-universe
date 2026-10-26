# A Little World For You ♡

A small, mobile-first Greek surprise: collect seven illustrated cookies beneath the stars, then open a letter. It is a static site with no build step, backend, dependencies, analytics, or external assets.

## Edit the personal text

The seven messages and complete letter are together in the `PERSONAL_TEXT` section at the top of `script.js`. Keep the file saved as UTF-8.

## Preview locally

Open `index.html` directly, or serve this folder with any local static server. For example, with Python installed:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000/`.

With the server running on port 8765, `node tests/verify.mjs` runs a dependency-free headless Edge check covering touch collection, messages, progress, letter, replay, and 320–412px layouts. Set `SITE_URL` to test another address.

## GitHub Pages

Publish the `main` branch from `/ (root)` in **Settings → Pages**. All local assets use relative paths, so the site works at `https://<username>.github.io/little-cookie-universe/`. Changes to `main` deploy automatically after Pages is enabled.
