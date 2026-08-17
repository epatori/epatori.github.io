import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(projectRoot, 'source');
const outputRoot = path.join(projectRoot, 'site');
const reviewRoot = path.join(sourceRoot, 'reviews');
const thumbnailRoot = path.join(outputRoot, 'thumbnails');
const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'site.config.json'), 'utf8'));
const siteName = String(config.name || 'Pensive');
const siteTagline = '오덕겜창의 리뷰공간';
const siteDescription = '하위문화생활총망라';
const siteSearchTitle = `${siteName}: ${siteTagline}`;
const siteUrl = String(config.url || 'https://epatori.github.io/').replace(/\/+$/, '') + '/';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(raw) {
  const normalized = raw.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) return { data: {}, content: normalized };
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) return { data: {}, content: normalized };

  const header = normalized.slice(4, end);
  const content = normalized.slice(end + 5);
  const data = {};
  for (const line of header.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1);
    data[key] = parseValue(value);
  }
  return { data, content };
}

const firstImagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/m;

function extractFirstImage(markdown) {
  const match = markdown.match(firstImagePattern);
  if (!match) {
    return {
      alt: '대표 이미지 없음',
      src: 'images/placeholder.svg',
      body: markdown
    };
  }
  return {
    alt: match[1] || '리뷰 대표 이미지',
    src: match[2].replace(/^\/+/, ''),
    body: markdown.replace(match[0], '').trimStart()
  };
}

function renderInline(text) {
  let result = escapeHtml(text);
  const code = [];
  result = result.replace(/`([^`]+)`/g, (_, value) => {
    code.push(`<code>${value}</code>`);
    return `@@CODE${code.length - 1}@@`;
  });
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  result = result.replace(/@@CODE(\d+)@@/g, (_, index) => code[Number(index)]);
  return result;
}

function imageHtml(alt, src, imagePrefix) {
  const clean = src.replace(/^\/+/, '');
  const finalSrc = /^(https?:|data:)/.test(src) ? src : `${imagePrefix}${clean}`;
  return `<figure><img src="${escapeHtml(finalSrc)}" alt="${escapeHtml(alt)}" loading="lazy"></figure>`;
}

function markdownToHtml(markdown, imagePrefix) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];
  let quote = [];
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length || !listType) return;
    html.push(`<${listType}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${listType}>`);
    listType = null;
    listItems = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    html.push(`<blockquote><p>${renderInline(quote.join(' '))}</p></blockquote>`);
    quote = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim().startsWith('```')) {
      flushParagraph(); flushList(); flushQuote();
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushParagraph(); flushList(); flushQuote();
      continue;
    }

    const image = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)$/);
    if (image) {
      flushParagraph(); flushList(); flushQuote();
      html.push(imageHtml(image[1], image[2], imagePrefix));
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList(); flushQuote();
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph(); flushList(); flushQuote();
      html.push('<hr>');
      continue;
    }

    const blockquote = line.match(/^>\s?(.*)$/);
    if (blockquote) {
      flushParagraph(); flushList();
      quote.push(blockquote[1]);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph(); flushQuote();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph(); flushQuote();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(ordered[1]);
      continue;
    }

    flushList(); flushQuote();
    paragraph.push(line.trim());
  }

  flushParagraph(); flushList(); flushQuote();
  if (inCode && codeLines.length) html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  return html.join('\n');
}

function normalizeMedia(value = '') {
  const normalized = String(value).trim();
  const upper = normalized.toUpperCase();
  const map = new Map([
    ['GAME', '게임'], ['게임', '게임'],
    ['ANIME', '애니'], ['애니', '애니'], ['애니메이션', '애니'],
    ['WEBTOON', '만화'], ['웹툰', '만화'],
    ['NOVEL', '소설'], ['WEB NOVEL', '소설'], ['WEBNOVEL', '소설'], ['소설', '소설'], ['웹소설', '소설'],
    ['MANGA', '만화'], ['COMIC', '만화'], ['만화', '만화'],
    ['MOVIE', '영화'], ['FILM', '영화'], ['영화', '영화'],
    ['DRAMA', '드라마'], ['드라마', '드라마'],
    ['NETFLIX', '드라마'], ['넷플릭스', '드라마'],
    ['SERIES', '드라마'], ['TV', '드라마'], ['시리즈', '드라마'],
    ['MUSICAL', '뮤지컬'], ['뮤지컬', '뮤지컬'],
    ['THEATER', '연극'], ['PLAY', '연극'], ['연극', '연극'],
    ['TRAVEL', '여행'], ['여행', '여행'],
  ]);

  if (map.has(normalized)) return map.get(normalized);
  if (map.has(upper)) return map.get(upper);

  for (const [key, label] of map) {
    if (upper.startsWith(key) || normalized.startsWith(key)) return label;
  }
  return '게임';
}

function readReviews() {
  return fs.readdirSync(reviewRoot)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const raw = fs.readFileSync(path.join(reviewRoot, name), 'utf8');
      const { data, content } = parseFrontmatter(raw);
      const image = extractFirstImage(content);
      return {
        slug: data.slug || name.replace(/\.md$/, ''),
        title: data.title || name.replace(/\.md$/, ''),
        date: data.date || '2026-01-01',
        category: data.category || 'REVIEW',
        media: normalizeMedia(data.media || data.category || '게임'),
        summary: data.summary || '',
        imagePosition: data.imagePosition || '50% 50%',
        image,
        thumbnailSrc: image.src,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function formatDate(value, long = false) {
  return new Intl.DateTimeFormat('ko-KR', long
    ? { year: 'numeric', month: 'long', day: 'numeric' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' }
  ).format(new Date(value));
}


function stripMarkdown(markdown = '') {
  return String(markdown)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(markdown = '', maxLength = 155) {
  const text = stripMarkdown(markdown);
  if (!text) return siteDescription;
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function absoluteUrl(relative = '') {
  const clean = String(relative).replace(/^\/+/, '');
  return new URL(clean, siteUrl).href;
}

function jsonLd(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replaceAll('<', '\\u003c')}</script>`;
}

function pageShell({
  title,
  description,
  assetPrefix,
  body,
  canonicalUrl = siteUrl,
  imageUrl = absoluteUrl('images/temp.jpg'),
  pageType = 'website',
  structuredData = null,
}) {
  const fullTitle = title === siteName ? siteSearchTitle : `${title} — ${siteName}`;
  const metaDescription = description || siteDescription;
  const canonical = canonicalUrl || siteUrl;
  const socialImage = imageUrl || absoluteUrl('images/temp.jpg');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(metaDescription)}">
  <meta name="theme-color" content="#07080c">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="${escapeHtml(pageType)}">
  <meta property="og:site_name" content="${escapeHtml(siteName)}">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(metaDescription)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(socialImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(fullTitle)}">
  <meta name="twitter:description" content="${escapeHtml(metaDescription)}">
  <meta name="twitter:image" content="${escapeHtml(socialImage)}">
  <title>${escapeHtml(fullTitle)}</title>
  <link rel="icon" href="${assetPrefix}favicon.png" type="image/png" sizes="192x192">
  <link rel="stylesheet" href="${assetPrefix}assets/styles.css">
  ${structuredData ? jsonLd(structuredData) : ''}
</head>
<body>${body}</body>
</html>`;
}

function card(review, { href, imagePrefix, compact = false, current = false }) {
  const tag = current ? 'div' : 'a';
  const hrefAttr = current ? '' : ` href="${href}"`;
  const currentAttr = current ? ' aria-current="page" data-current-card' : '';
  return `<${tag} class="review-card${compact ? ' compact' : ''}${current ? ' current' : ''}" data-media-category="${escapeHtml(review.media)}"${hrefAttr}${currentAttr}>
    <div class="image-frame">
      <img src="${imagePrefix}${escapeHtml(review.thumbnailSrc || review.image.src)}" alt="${escapeHtml(review.image.alt)}" loading="lazy" draggable="false" style="object-position:${escapeHtml(review.imagePosition)}">
    </div>
    <div class="card-copy">
      <p class="eyebrow">${escapeHtml(review.media)} · ${escapeHtml(formatDate(review.date))}</p>
      <h2>${escapeHtml(review.title)}</h2>
      ${!compact && review.summary ? `<p class="summary">${escapeHtml(review.summary)}</p>` : ''}
    </div>
  </${tag}>`;
}

function currentlyPlayingCard(review) {
  return `<a class="currently-playing-card" href="./${review.slug}/">
    <div class="currently-playing-frame">
      <img src="../${escapeHtml(review.thumbnailSrc || review.image.src)}" alt="${escapeHtml(review.image.alt)}" loading="eager" draggable="false" style="object-position:${escapeHtml(review.imagePosition)}">
    </div>
    <div class="currently-playing-copy">
      <p class="eyebrow">${escapeHtml(review.media)}</p>
      <h2>${escapeHtml(review.title)}</h2>
    </div>
  </a>`;
}

function footer() {
  const current = new Date().getFullYear();
  const range = current > config.startYear ? `${config.startYear}–${current}` : String(config.startYear);
  return `<footer class="site-footer">
    <p>© ${range} ${escapeHtml(config.author)}. All rights reserved.</p>
    <p class="rights-note">리뷰와 비평을 위해 필요한 범위에서 사용한 제3자 이미지와 스크린샷의 권리는 각 저작권자에게 있습니다.</p>
  </footer>`;
}

function ensureCleanOutput() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.cpSync(path.join(sourceRoot, 'assets'), path.join(outputRoot, 'assets'), { recursive: true });
  fs.cpSync(path.join(sourceRoot, 'images'), path.join(outputRoot, 'images'), { recursive: true });
  const favicon = path.join(sourceRoot, 'favicon.png');
  if (fs.existsSync(favicon)) fs.copyFileSync(favicon, path.join(outputRoot, 'favicon.png'));
}

async function buildThumbnails(reviews) {
  fs.mkdirSync(thumbnailRoot, { recursive: true });

  for (const review of reviews) {
    const src = review.image.src;

    // 외부 이미지라면 건드리지 않고 원본 URL 사용
    if (/^(https?:|data:)/.test(src)) {
      review.thumbnailSrc = src;
      continue;
    }

    const inputPath = path.join(sourceRoot, src);

    if (!fs.existsSync(inputPath)) {
      console.warn(`Thumbnail source not found: ${inputPath}`);
      review.thumbnailSrc = src;
      continue;
    }

    const outputName = `${review.slug}.webp`;
    const outputPath = path.join(thumbnailRoot, outputName);

    try {
      await sharp(inputPath)
        .rotate()
        .resize({
          width: 640,
          withoutEnlargement: true,
        })
        .webp({
          quality: 80,
        })
        .toFile(outputPath);

      review.thumbnailSrc = `thumbnails/${outputName}`;
    } catch (error) {
      console.warn(`Could not create thumbnail for ${review.title}:`, error);
      review.thumbnailSrc = src;
    }
  }
}

function buildLanding(reviews) {
  const ambientTitles = JSON.stringify(reviews.map((review) => review.title)).replaceAll('<', '\\u003c');
  const body = `<main class="water-gate" data-water-gate data-target="reviews/">
    <canvas aria-hidden="true"></canvas>
    <div class="sr-only">
      <h1>${escapeHtml(siteSearchTitle)}</h1>
      <p>${escapeHtml(siteDescription)}</p>
    </div>
    <a href="reviews/" class="enter-button" aria-label="블로그에 들어가기"><span class="sr-only">Pensive 리뷰 목록으로 들어가기</span></a>
  </main>
  <script>window.__PENSIVE_TITLES__ = ${ambientTitles};</script>
  <script src="assets/landing.js"></script>`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    alternateName: siteSearchTitle,
    url: siteUrl,
    description: siteDescription,
    inLanguage: 'ko-KR',
  };
  fs.writeFileSync(path.join(outputRoot, 'index.html'), pageShell({
    title: siteName,
    description: siteDescription,
    assetPrefix: '',
    body,
    canonicalUrl: siteUrl,
    imageUrl: absoluteUrl('images/temp.jpg'),
    structuredData,
  }), 'utf8');
}

function buildCatalog(reviews) {
  const cards = reviews.map((review) => card(review, {
    href: `./${review.slug}/`,
    imagePrefix: '../',
  })).join('\n');
  const currentPlayingSlugs = ['beast-of-reincarnation', 'black-myth-wukong'];
  const currentPlayingCards = currentPlayingSlugs
    .map((slug) => reviews.find((review) => review.slug === slug))
    .filter(Boolean)
    .map(currentlyPlayingCard)
    .join('\n');
  const filters = ['모두보기', '게임', '소설', '만화', '영화', '애니', '드라마', '뮤지컬', '여행']
    .map((label, index) => `<button type="button" class="filter-button${index === 0 ? ' is-active' : ''}" data-filter="${escapeHtml(label)}" aria-pressed="${index === 0 ? 'true' : 'false'}">${escapeHtml(label)}</button>`)
    .join('');
  const body = `<main class="catalog">
    <header class="catalog-heading">
      <p class="kicker">records of my life</p>
      <h1>Pensive</h1>
      <p class="intro">${escapeHtml(siteTagline)}</p>
      <nav class="filter-bar" aria-label="매체별 리뷰 필터">${filters}</nav>
    </header>
    <section class="currently-playing" aria-labelledby="currently-playing-title">
      <p class="currently-playing-title" id="currently-playing-title">Currently Playing:</p>
      <div class="currently-playing-grid">${currentPlayingCards}</div>
    </section>
    <section class="review-grid" aria-label="리뷰 목록" data-review-grid>${cards}</section>
    <nav class="pagination" data-pagination aria-label="리뷰 페이지" hidden></nav>
    <p class="filter-empty" data-filter-empty hidden>아직 이 분류에 들어갈 기록이 없습니다.</p>
  </main>${footer()}
  <script src="../assets/catalog.js"></script>`;
  const dir = path.join(outputRoot, 'reviews');
  fs.mkdirSync(dir, { recursive: true });
  const catalogUrl = absoluteUrl('reviews/');
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: siteName,
    url: catalogUrl,
    description: siteDescription,
    inLanguage: 'ko-KR',
  };
  fs.writeFileSync(path.join(dir, 'index.html'), pageShell({
    title: siteName,
    description: siteDescription,
    assetPrefix: '../',
    body,
    canonicalUrl: catalogUrl,
    imageUrl: absoluteUrl('images/temp.jpg'),
    structuredData,
  }), 'utf8');
}

function buildArticle(review, reviews) {
  const articleBody = markdownToHtml(review.image.body, '../../');
  const carousel = reviews.map((item) => card(item, {
    href: item.slug === review.slug ? '' : `../${item.slug}/`,
    imagePrefix: '../../',
    compact: true,
    current: item.slug === review.slug,
  })).join('\n');
  const body = `<main class="article-page">
    <section class="hero-shell" aria-label="대표 이미지">
      <div class="hero" data-article-hero>
        <img class="hero-image${review.image.src.toLowerCase().endsWith('.svg') ? ' is-svg-cover' : ''}" src="../../${escapeHtml(review.image.src)}" alt="${escapeHtml(review.image.alt)}" style="object-position:${escapeHtml(review.imagePosition)}">
        <div class="hero-shade"></div>
        <a class="back-link" href="../">← CATALOG</a>
      </div>
    </section>
    <article class="paper">
      <header class="article-header">
        <p class="article-meta">${escapeHtml(review.media)} · ${escapeHtml(formatDate(review.date, true))}</p>
        <h1>${escapeHtml(review.title)}</h1>
        ${review.summary ? `<p class="deck">${escapeHtml(review.summary)}</p>` : ''}
      </header>
      <div class="prose" data-protected-copy>${articleBody}</div>
      <aside class="share-panel" data-share-panel data-share-title="${escapeHtml(review.title)}" data-share-text="${escapeHtml(review.summary || `${review.title} 리뷰`)}" aria-label="이 리뷰 공유하기">
        <p class="share-label">SHARE THIS RECORD</p>
        <div class="share-actions">
          <button type="button" class="share-button" data-share="system">공유</button>
          <button type="button" class="share-button" data-share="x">X</button>
          <button type="button" class="share-button" data-share="facebook">Facebook</button>
          <button type="button" class="share-button" data-share="bluesky">Bluesky</button>
          <button type="button" class="share-button" data-share="copy">링크 복사</button>
        </div>
        <p class="share-status" data-share-status role="status" aria-live="polite"></p>
      </aside>
    </article>
    <section class="more-reviews" aria-labelledby="more-reviews-title">
      <div class="section-heading"><p>CATALOG</p><h2 id="more-reviews-title">다른 리뷰</h2></div>
      <div class="carousel" data-carousel>${carousel}</div>
    </section>
    ${footer()}
  </main>
  <script src="../../assets/article.js"></script>`;
  const dir = path.join(outputRoot, 'reviews', review.slug);
  fs.mkdirSync(dir, { recursive: true });
  const articleUrl = absoluteUrl(`reviews/${review.slug}/`);
  const articleDescription = review.summary || excerpt(review.image.body);
  const articleImageUrl = absoluteUrl(review.image.src);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: review.title,
    description: articleDescription,
    url: articleUrl,
    mainEntityOfPage: articleUrl,
    datePublished: review.date,
    dateModified: review.date,
    inLanguage: 'ko-KR',
    author: {
      '@type': 'Person',
      name: config.author,
    },
    publisher: {
      '@type': 'Person',
      name: config.author,
    },
    image: [articleImageUrl],
  };
  fs.writeFileSync(path.join(dir, 'index.html'), pageShell({
    title: review.title,
    description: articleDescription,
    assetPrefix: '../../',
    body,
    canonicalUrl: articleUrl,
    imageUrl: articleImageUrl,
    pageType: 'article',
    structuredData,
  }), 'utf8');
}


function buildSeoFiles(reviews) {
  const latestDate = reviews
    .map((review) => review.date)
    .sort()
    .at(-1) || new Date().toISOString().slice(0, 10);

  const urls = [
    { loc: siteUrl, lastmod: latestDate },
    { loc: absoluteUrl('reviews/'), lastmod: latestDate },
    ...reviews.map((review) => ({
      loc: absoluteUrl(`reviews/${review.slug}/`),
      lastmod: review.date,
    })),
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, lastmod }) => `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${escapeHtml(lastmod)}</lastmod>
  </url>`).join('\n')}
</urlset>
`;

  const robots = `User-agent: *
Allow: /

Sitemap: ${absoluteUrl('sitemap.xml')}
`;

  fs.writeFileSync(path.join(outputRoot, 'sitemap.xml'), sitemap, 'utf8');
  fs.writeFileSync(path.join(outputRoot, 'robots.txt'), robots, 'utf8');
  fs.writeFileSync(
    path.join(outputRoot, 'googlebe253e06414c0f4b.html'),
    'google-site-verification: googlebe253e06414c0f4b.html\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(outputRoot, 'naver901b9a28925ada282542f990d89bd571.html'),
    'naver-site-verification: naver901b9a28925ada282542f990d89bd571.html\n',
    'utf8',
  );
}

ensureCleanOutput();
const reviews = readReviews();
await buildThumbnails(reviews);
buildLanding(reviews);
buildCatalog(reviews);
for (const review of reviews) buildArticle(review, reviews);
buildSeoFiles(reviews);

fs.writeFileSync(path.join(outputRoot, '.nojekyll'), '', 'utf8');
console.log(`Built ${reviews.length} reviews into: ${outputRoot}`);
