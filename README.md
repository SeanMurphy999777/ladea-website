# Ladea — website

A bilingual static site: a one-page home in English and French, plus a privacy page in each language. HTML, CSS and a small amount of JavaScript. No framework, no runtime dependencies, no cookies, no analytics, no third-party requests (fonts are hosted with the site).

**To deploy, upload the contents of `public/`.** Everything else is the source used to regenerate the HTML.

| Page | URL | File |
|---|---|---|
| English home | `https://ladea.ca/` | `public/index.html` |
| French home | `https://ladea.ca/fr/` | `public/fr/index.html` |
| English privacy | `https://ladea.ca/privacy/` | `public/privacy/index.html` |
| French privacy | `https://ladea.ca/fr/confidentialite/` | `public/fr/confidentialite/index.html` |

---

## 1. File structure

```
ladea-site/
├── public/                     ← DEPLOY THIS FOLDER (all .html files here are generated)
│   ├── index.html              English home
│   ├── privacy/index.html      English privacy policy
│   ├── fr/index.html           French home
│   ├── fr/confidentialite/     French privacy policy
│   ├── styles.css              all styles, organized in numbered sections
│   ├── script.js               header, mobile menu, scroll reveal, form handling
│   ├── assets/                 L icon (256/800px + 512px for structured data), transparent wordmark, og-image.png (EN), og-image-fr.png (FR)
│   ├── fonts/                  Newsreader + Instrument Sans (woff2, SIL OFL licence)
│   ├── favicon.ico, favicon-192.png, apple-touch-icon.png
│   └── robots.txt, sitemap.xml generated
│
├── brand/                      supplied logo files + scripts that generate every logo asset and both og images
├── src/
│   ├── page.html               home page template (shared by both languages)
│   ├── privacy.html            privacy page template (shared by both languages)
│   └── partials/               head.html, header.html, footer.html: shared by every page
├── locales/
│   ├── en.json                 ALL English copy: home, privacy page, form messages, SEO, structured data
│   └── fr.json                 ALL French copy, same keys
├── site.json                   domain, page URLs, form endpoint, organization facts
└── build.mjs                   build script, zero dependencies (Node 18+)
```

**How it fits together:** the markup lives once in `src/`, the words live in `locales/`. Running `node build.mjs` renders every page in every language. Each language has its own real URL (best for search engines), and nothing is translated in the browser.

### Editing copy
1. Edit `locales/en.json` and/or `locales/fr.json`
2. Run `node build.mjs`
3. Upload `public/`

The build **stops with an error** if:
- `fr.json` is missing a key that `en.json` has (or the reverse), so no page ships half-translated
- a page ends up with more or fewer than one `<h1>`

Don't edit the `.html` files in `public/` by hand. The next build overwrites them.

---

## 2. Connecting the contact form to n8n

**Connected.** The form POSTs JSON to the production n8n webhook:
`https://ladea.app.n8n.cloud/webhook/ladea-contact` (set in `site.json → form.endpoint`).

If n8n is unreachable, visitors see an error with the info@ladea.ca fallback, keep what they typed, and can retry.

### Changing the webhook later

### Steps
1. In n8n, create a workflow starting with a **Webhook** node:
   - HTTP Method: `POST`
   - Path: e.g. `ladea-contact`
   - Respond: *Immediately* (or use a *Respond to Webhook* node that returns status 200)
   - Options → **Allowed Origins (CORS)**: `https://ladea.ca`. Without this, browsers block the request.
2. **Activate** the workflow and copy the **Production URL** (not the Test URL).
3. Open **`site.json`** and paste it here:
   ```json
   "form": {
     "endpoint": "https://YOUR-N8N-HOST/webhook/ladea-contact",
     "adapter": "json"
   }
   ```
4. Run `node build.mjs` and redeploy `public/`.
5. Send a test from both `/` and `/fr/`.

### What n8n receives (JSON body)
```json
{
  "name": "…",
  "company": "…",
  "email": "…",
  "phone": "",            // empty if not provided
  "message": "…",
  "language": "en"        // or "fr": use it to reply in the right language
}
```
Bot submissions caught by the hidden spam-trap field are silently dropped in the browser and never sent.

### Security
- The endpoint URL is **public**: anyone can read it in the page source. That is normal for a webhook. **Never** put API keys, tokens or credentials in `site.json` or any file in `public/`.
- Everything sensitive (email sending, CRM writes, API keys) belongs inside the n8n workflow, not in the site.
- Consider adding rate limiting, or a check in the workflow that drops obviously empty or spammy payloads.

### Other backends
`adapter` also accepts `formdata` (Formspree, Basin, etc.) and `hubspot` (HubSpot Forms API). See the `adapters` object in `public/script.js`.

---

## 3. Deployment

Upload the **contents** of `public/` to the web root of `ladea.ca`.

| Host | How |
|---|---|
| **Netlify** | Drag `public/` onto app.netlify.com/drop, or connect Git with build command `node build.mjs` and publish directory `public` |
| **Cloudflare Pages** | Build command `node build.mjs`, output directory `public` |
| **Porkbun Static Hosting** | Connect by FTP (Porkbun → Domain Management → ladea.ca → Static Hosting → Publishing → FTP Credentials, port 21) and drag the **contents** of `public/` into the site's root directory, keeping the folders. `index.html` must sit at the top level. Don't upload `public/` itself as a folder. |
| **Shared hosting (cPanel, etc.)** | Upload the contents of `public/` into `public_html/` |

Folders like `/fr/` and `/privacy/` are served by their `index.html`, which every host does by default.

**Preview locally:** `python3 -m http.server -d public 8000`, then open http://localhost:8000

---

## 4. Launch checklist

Done in the build:
- [x] Canonical URLs on `https://ladea.ca` for all 4 pages
- [x] `hreflang` en / fr / x-default on every page and in the sitemap, reciprocal
- [x] `sitemap.xml` (4 URLs) and `robots.txt` (all crawlers + `OAI-SearchBot` allowed)
- [x] Structured data with `info@ladea.ca`
- [x] Privacy pages in both languages, linked from the form and the footer

To do manually:
- [x] n8n webhook connected. Test submissions in EN and FR returned `200 "Workflow was started"` (25 Sept 2026).
- [ ] **CORS:** in the n8n Webhook node, Allowed Origins should include `https://ladea.ca` (or `*`). This can only be proven from the live domain, so send one real submission from each language after deploying.
- [ ] **Set up the `info@ladea.ca` mailbox** and confirm it receives mail. The privacy pages, structured data and form error messages all point to it.
- [ ] **Name the person responsible for personal information.** Quebec's Law 25 asks businesses to publish the title and contact details of the person in charge of protecting personal information. By default that is the person with the highest authority in the business. The privacy pages currently say `info@ladea.ca` reaches that person. Add their title, and name if you wish, to `locales/*.json → privacy.sections[0]`.
- [ ] **Have the privacy wording reviewed** by your legal advisor. It is deliberately plain and conservative, but it is not legal advice.
- [ ] **Redirect `www.ladea.ca` and `http://`** to `https://ladea.ca/` (301) at the host or DNS level
- [ ] **Search consoles:** verify the domain in Google Search Console and Bing Webmaster Tools, then submit `https://ladea.ca/sitemap.xml` to both
- [ ] Test the live site with Google's Rich Results Test and LinkedIn Post Inspector (it checks both og images)
- [ ] If analytics or any third-party script is ever added, **update the privacy pages first**. They currently state that the site uses no cookies, analytics or trackers.

---

## 5. Search and AI-search notes

- One `<h1>` per page, logical heading outline. All content is in the HTML and nothing depends on JavaScript to appear. Scroll animations only affect content below the first screen, and never when JavaScript is off.
- Per-language title, description, canonical, Open Graph (including a French OG image and `og:locale:alternate`) and Twitter tags
- JSON-LD `@graph`: `ProfessionalService` (name, URL, logo, description, email, Montréal address, English and French, 5 services), `WebSite` and `WebPage`, with each language's content in its own language. Privacy pages carry a `WebPage` node linked to the organization.
- **Deliberately left out** (not confirmed): phone number, street address, `areaServed`, social profiles. Add them in `site.json → organization` when they exist.
- **Not added:** `llms.txt`. No major search engine uses it for inclusion or ranking.
- **Optional:** `GPTBot` and `Google-Extended` (AI *training* crawlers) are allowed through the `*` rule. Blocking them does not affect ChatGPT Search or Google Search visibility.

---

## 6. Design notes

- **Colours** come straight from the logos: the page is aubergine `#390941` with white text (`#FFFFFF` headings, `#FAF8F5` body, `#D9C8DB` secondary), and vermilion `#FD5210` for buttons, labels, rules and bullets. Buttons are vermilion with aubergine labels (5.0:1) and turn white on hover. The "How we think" band is a darker aubergine `#23042A`. The contact form sits on a white card that switches back to aubergine text. All text meets WCAG AA. Print falls back to dark text on white.
- **Logos** are never redrawn. `brand/` holds the two supplied files. `python3 brand/make-assets.py` resizes the L icon (its aubergine square is part of the icon) and makes the wordmark's white background transparent (plus a white version for the aubergine header); it also writes the favicons. `node brand/make-og.mjs` renders both social images with the site fonts. Re-run both if the logo files change.
- **Type:** Newsreader (headings) and Instrument Sans (body), self-hosted.
- **French typography** follows OQLF conventions: non-breaking space before colons, none before `?` and `!`.
- **Mobile:** tested at 375px. Section spacing is 60px on narrow phones, primary buttons go full-width, and form inputs are 16px so iOS doesn't zoom.
- **Accessibility:** skip link, landmarks, labelled fields, errors linked to inputs, visible focus, keyboard-operable menu (Escape closes it), reduced-motion support.
