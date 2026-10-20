#!/usr/bin/env node
/**
 * Ladea site build — zero dependencies (Node 18+).
 *
 *   node build.mjs
 *
 * Reads   src/page.html, src/privacy.html   page templates (one per page, shared by every language)
 *         src/partials/*.html               shared pieces: {{> head}}, {{> header}}, {{> footer}}
 *         locales/*.json                    all copy, one file per language (en.json, fr.json)
 *         site.json                         domain, pages & URL slugs, form endpoint, organization facts
 * Writes  public/index.html                 English home          https://ladea.ca/
 *         public/privacy/index.html         English privacy       https://ladea.ca/privacy/
 *         public/fr/index.html              French home           https://ladea.ca/fr/
 *         public/fr/confidentialite/…       French privacy        https://ladea.ca/fr/confidentialite/
 *         public/sitemap.xml, public/robots.txt
 *
 * Every locale file must have exactly the same keys as the default (en.json).
 * The build stops with a list of missing keys otherwise, so nothing ships half-translated.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const readJSON = (p) => JSON.parse(read(p));

const site = readJSON('site.json');
const siteUrl = site.siteUrl.replace(/\/+$/, '');

const locales = readdirSync(join(ROOT, 'locales'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJSON(join('locales', f)))
  .sort((a, b) => (a._locale.lang === site.defaultLocale ? -1 : b._locale.lang === site.defaultLocale ? 1 : 0));

if (!locales.length || locales[0]._locale.lang !== site.defaultLocale) {
  throw new Error(`Default locale "${site.defaultLocale}" not found in locales/`);
}

// ---------------------------------------------------------------- template engine
const escapeHTML = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function lookup(ctx, path, strict, label) {
  const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
  if (value === undefined && strict) throw new Error(`[${label}] missing key: "${path}"`);
  return value;
}

// partials: {{> name}} → src/partials/name.html (inserted before anything else is rendered)
const withPartials = (tpl) =>
  tpl.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => withPartials(read(`src/partials/${name}.html`)));

function render(tpl, ctx, label) {
  // template-only comments: {{!-- … --}} (never reach the output)
  tpl = tpl.replace(/\{\{!--[\s\S]*?--\}\}\n?/g, '');
  // loops: {{#each list}} … {{/each}}   (not nested)
  tpl = tpl.replace(/\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, path, body) => {
    const list = lookup(ctx, path, true, label);
    if (!Array.isArray(list)) throw new Error(`[${label}] "${path}" is not a list`);
    return list
      .map((item, i) => render(body, { ...ctx, this: item, '@num': String(i + 1).padStart(2, '0') }, label))
      .join('');
  });
  // conditionals: {{#if key}} … {{/if}}
  tpl = tpl.replace(/\{\{#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, path, body) =>
    lookup(ctx, path, false, label) ? render(body, ctx, label) : ''
  );
  // raw values: {{{ key }}}
  tpl = tpl.replace(/\{\{\{\s*([\w.@]+)\s*\}\}\}/g, (_, path) => {
    const v = path === 'this' ? ctx.this : lookup(ctx, path, true, label);
    return v ?? '';
  });
  // escaped values: {{ key }}
  tpl = tpl.replace(/\{\{\s*([\w.@]+)\s*\}\}/g, (_, path) => {
    const v = path === 'this' ? ctx.this : path === '@num' ? ctx['@num'] : lookup(ctx, path, true, label);
    return escapeHTML(v ?? '');
  });
  return tpl;
}

// ---------------------------------------------------------------- key parity check
function keys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}
const baseKeys = keys(locales[0]);
for (const loc of locales.slice(1)) {
  const have = new Set(keys(loc));
  const missing = baseKeys.filter((k) => !have.has(k));
  if (missing.length) throw new Error(`[${loc._locale.lang}] missing keys:\n  ${missing.join('\n  ')}`);
}

// ---------------------------------------------------------------- URLs
// A page's path for a locale: <locale path>/<page slug>/  (either part may be empty)
const pages = Object.entries(site.pages).filter(([id]) => !id.startsWith('_')).map(([id, cfg]) => ({ id, ...cfg }));
const segments = (page, loc) => [loc._locale.path, page.slug[loc._locale.lang]].filter(Boolean);
const pathFor = (page, loc) => (segments(page, loc).length ? segments(page, loc).join('/') + '/' : '');
const urlFor = (page, loc) => `${siteUrl}/${pathFor(page, loc)}`;
const home = pages.find((p) => p.id === 'home');
const privacy = pages.find((p) => p.id === 'privacy');
const multilingual = locales.length > 1;
const year = new Date().getFullYear();
// Cache-busting: ?v=<content hash> on styles.css and script.js, so browsers and CDNs
// fetch the new file whenever it changes, instead of pairing new HTML with old CSS.
const version = (file) => createHash('sha256').update(readFileSync(join(ROOT, 'public', file))).digest('hex').slice(0, 10);
const assetVersion = { css: version('styles.css'), js: version('script.js') };

for (const page of pages) {
  for (const loc of locales) {
    if (page.slug[loc._locale.lang] === undefined) throw new Error(`site.json → pages.${page.id}.slug has no "${loc._locale.lang}" entry`);
  }
}

// ---------------------------------------------------------------- structured data (JSON-LD)
// Only confirmed facts, from site.json → organization and the locale's "schema" block.
// Empty fields (telephone, sameAs, …) are omitted rather than guessed.
const orgId = `${siteUrl}/#organization`;
const websiteId = `${siteUrl}/#website`;
const clean = (o) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)));

function organization(loc) {
  const org = site.organization;
  const s = loc.schema;
  return clean({
    '@type': 'ProfessionalService',
    '@id': orgId,
    name: org.name,
    alternateName: org.alternateName,
    url: `${siteUrl}/`,
    logo: { '@type': 'ImageObject', url: `${siteUrl}/assets/ladea-logo-512.png`, width: 512, height: 512 },
    image: `${siteUrl}/assets/${loc.meta.ogImage}`,
    description: s.description,
    slogan: s.slogan,
    email: org.email,
    telephone: org.telephone,
    address: { '@type': 'PostalAddress', addressLocality: org.city, addressRegion: org.region, addressCountry: org.country },
    knowsLanguage: org.serviceLanguages,
    knowsAbout: s.knowsAbout,
    sameAs: org.sameAs,
    contactPoint: clean({
      '@type': 'ContactPoint',
      contactType: s.contactType,
      email: org.email,
      telephone: org.telephone,
      url: `${urlFor(home, loc)}#contact`,
      availableLanguage: org.serviceLanguages,
    }),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: s.catalogName,
      itemListElement: s.services.map((svc) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: svc.name, description: svc.description, provider: { '@id': orgId } },
      })),
    },
  });
}

function structuredData(page, loc, meta) {
  const graph = [];
  if (page.id === 'home') {
    graph.push(organization(loc), {
      '@type': 'WebSite',
      '@id': websiteId,
      url: `${siteUrl}/`,
      name: 'Ladea',
      inLanguage: locales.map((l) => l._locale.lang),
      publisher: { '@id': orgId },
    });
  }
  graph.push(
    clean({
      '@type': page.schemaType || 'WebPage',
      '@id': `${urlFor(page, loc)}#webpage`,
      url: urlFor(page, loc),
      name: meta.title,
      description: meta.description,
      inLanguage: loc._locale.lang,
      isPartOf: { '@id': websiteId },
      about: { '@id': orgId },
      publisher: page.id === 'home' ? undefined : { '@id': orgId },
      primaryImageOfPage: page.id === 'home' ? { '@type': 'ImageObject', url: `${siteUrl}/assets/${loc.meta.ogImage}` } : undefined,
    })
  );
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

// ---------------------------------------------------------------- build pages
for (const page of pages) {
  const template = withPartials(read(page.template));

  for (const loc of locales) {
    const { lang } = loc._locale;
    const outPath = pathFor(page, loc);
    const root = '../'.repeat(segments(page, loc).length);
    const localeHome = pathFor(home, loc);
    const meta = page.id === 'home' ? loc.meta : loc[page.id].meta;

    // links to other language versions of THIS page (not always the home page)
    const languages = locales.map((l) => ({
      lang: l._locale.lang,
      label: l._locale.label,
      switchLabel: l._locale.switchLabel,
      href: root + pathFor(page, l) || './',
      current: l === loc ? 'aria-current="true"' : '',
    }));

    const alternates = multilingual
      ? [...locales.map((l) => ({ lang: l._locale.lang, href: urlFor(page, l) })), { lang: 'x-default', href: urlFor(page, locales[0]) }]
      : [];

    const ctx = {
      ...loc,
      site,
      page: {
        id: page.id,
        root,
        siteUrl,
        home: page.id === 'home' ? '' : root + localeHome,
        canonical: urlFor(page, loc),
        title: meta.title,
        description: meta.description,
        ogTitle: meta.ogTitle || meta.title,
        ogDescription: meta.ogDescription || meta.description,
        alternates,
        ogAlternates: locales.filter((l) => l !== loc).map((l) => l._locale.ogLocale),
        languages,
        multilingual,
        year,
        assetVersion,
        privacyUrl: root + pathFor(privacy, loc),
        jsonLd: structuredData(page, loc, meta),
      },
    };

    const label = `${lang}/${page.id}`;
    const html = render(template, ctx, label);
    const leftover = html.match(/\{\{[^}]*\}\}/);
    if (leftover) throw new Error(`[${label}] unrendered tag: ${leftover[0]}`);
    if ((html.match(/<h1[\s>]/g) || []).length !== 1) throw new Error(`[${label}] page must have exactly one <h1>`);

    const outDir = join(ROOT, 'public', outPath);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'index.html'), html);
    console.log(`✓ ${label.padEnd(12)} → public/${outPath}index.html   ${urlFor(page, loc)}`);
  }
}

// ---------------------------------------------------------------- sitemap
const today = new Date().toISOString().slice(0, 10);
const urls = pages.flatMap((page) =>
  locales.map((loc) => {
    const links = multilingual
      ? [...locales.map((l) => [l._locale.lang, urlFor(page, l)]), ['x-default', urlFor(page, locales[0])]]
          .map(([lang, href]) => `\n    <xhtml:link rel="alternate" hreflang="${lang}" href="${href}"/>`)
          .join('')
      : '';
    return `  <url>\n    <loc>${urlFor(page, loc)}</loc>\n    <lastmod>${today}</lastmod>${links}\n  </url>`;
  })
);
writeFileSync(
  join(ROOT, 'public', 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`
);

// ---------------------------------------------------------------- robots.txt
writeFileSync(
  join(ROOT, 'public', 'robots.txt'),
  `# robots.txt for ${siteUrl}
# Everything on this site is public. All search engines may crawl all of it,
# including Googlebot, Bingbot (which also feeds Copilot) and the rest.
User-agent: *
Allow: /

# OpenAI's search crawler, used for ChatGPT Search results and citations.
# Allowed explicitly so an intention is on record, not just implied by the rule above.
User-agent: OAI-SearchBot
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`
);
console.log(`✓ sitemap.xml (${urls.length} URLs), robots.txt`);

// ---------------------------------------------------------------- launch warnings
if (!site.form.endpoint) {
  console.warn('! site.json → form.endpoint is empty. Paste the n8n production webhook URL there, then rebuild.');
}
