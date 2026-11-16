// Serves the HTML pages, sitemap.xml and robots.txt.
// Pages are built once at start-up and kept in memory (very fast).

const express = require('express');
const config = require('../config');
const { layout } = require('../views/layout');
const { pages } = require('../views/pages');

const router = express.Router();

const rendered = {};
for (const [path, page] of Object.entries(pages)) rendered[path] = layout(page);

for (const path of Object.keys(rendered)) {
  router.get(path, (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(rendered[path]);
  });
}

router.get('/sitemap.xml', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = Object.keys(pages)
    .map((p) => `<url><loc>${config.siteUrl}${p}</loc><lastmod>${today}</lastmod></url>`)
    .join('');
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  );
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
});

// Simple 404 page
const notFound = layout({
  path: '/404',
  title: 'Page not found',
  description: 'Page not found',
  noindex: true,
  body: '<h1>Page not found</h1><p>Sorry, this page does not exist. <a href="/">Go to the downloader</a>.</p>',
});

module.exports = { router, notFound };
