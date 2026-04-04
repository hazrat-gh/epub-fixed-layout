const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

/**
 * Render a single chapter's HTML into an array of page image buffers.
 * Uses CSS column pagination to split content into viewport-sized pages.
 *
 * @param {object} page - Puppeteer page instance (reused)
 * @param {string} htmlContent - The chapter HTML content
 * @param {object} options
 * @param {number} options.width - Viewport width in px (default 800)
 * @param {number} options.height - Viewport height in px (default 480)
 * @param {string} [options.fontPath] - path to a custom .ttf font
 * @param {string} [options.fontFamily] - Font family name
 * @param {string} [options.googleFont] - Google Font name to inject
 * @param {number} [options.fontSize] - Font size in px (default 20)
 * @param {number} [options.lineHeight] - Line height multiplier (default 1.6)
 * @param {number} [options.padding] - Page padding in px (default 30)
 * @param {object[]} [options.images] - Embedded images [{id, contentType, data}]
 * @returns {Promise<Buffer[]>} Array of image buffers
 */
async function renderChapter(page, htmlContent, options = {}) {
  const {
    width = 800,
    height = 480,
    ppi = 217,
    fontPath,
    fontFamily,
    googleFont,
    fontSize = 30,
    lineHeight = 1.6,
    padding = 20,
    images = [],
  } = options;

  // Calculate scale based on the 217 PPI baseline
  const scaleFactor = ppi / 217;
  const scaledFontSize = Math.round(fontSize * scaleFactor);
  const scaledPadding = Math.round(padding * scaleFactor);

  // Use the SCALED padding for layout calculations
  const contentWidth = width - scaledPadding * 2;
  const contentHeight = height - scaledPadding * 2;

  // Build @font-face CSS if a local font is provided
  let fontFaceCSS = '';
  let fontFamilyCSS = 'serif';
  if (fontPath && fs.existsSync(fontPath)) {
    const fontBuffer = fs.readFileSync(fontPath);
    const fontBase64 = fontBuffer.toString('base64');
    const ext = path.extname(fontPath).toLowerCase();
    const format = ext === '.woff2' ? 'woff2' : ext === '.woff' ? 'woff' : 'truetype';
    fontFaceCSS = `
      @font-face {
        font-family: '${fontFamily}';
        src: url(data:font/${format};base64,${fontBase64}) format('${format}');
        font-weight: normal;
        font-style: normal;
      }
    `;
    fontFamilyCSS = `'${fontFamily}', serif`;
  }

  // Build Google Font import if provided
  let googleFontCSS = '';
  if (googleFont) {
    const formattedName = googleFont.replace(/ /g, '+');
    googleFontCSS = `@import url('https://fonts.googleapis.com/css2?family=${formattedName}&display=swap');`;
    fontFamilyCSS = `'${googleFont}', ${fontFamilyCSS}`;
  }

  // Convert embedded images to base64 data URIs for inline use
  const imageMap = {};
  for (const img of images) {
    const base64 = img.data.toString('base64');
    imageMap[img.href] = `data:${img.contentType};base64,${base64}`;
  }

  // Replace image src references in the HTML with base64 data URIs
  let processedHtml = htmlContent;
  for (const [href, dataUri] of Object.entries(imageMap)) {
    // Match various src patterns that could reference this image
    const filename = path.basename(href);
    const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace full href paths and filenames
    processedHtml = processedHtml.replace(
      new RegExp(`src=["']([^"']*${escapedFilename})["']`, 'gi'),
      `src="${dataUri}"`
    );
  }

  //Strip the relative stylesheets
  processedHtml = processedHtml.replace(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi, '');

  // Build the full HTML page with pagination CSS
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width}, height=${height}">
  <style>
    ${googleFontCSS}
    ${fontFaceCSS}

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #ffffff;
    }

    .page-container {
      width: ${width}px;
      height: ${height}px;
      padding: ${scaledPadding}px;
      overflow: hidden;
    }

    .content-wrapper {
      column-width: ${contentWidth}px;
      column-gap: ${scaledPadding * 2}px;
      column-fill: auto;
      height: ${contentHeight}px;
      font-family: ${fontFamilyCSS};
      font-size: ${scaledFontSize}px;
      line-height: ${lineHeight};
      color: #000000;
      
      /* 1. Prevent the wrapper itself from expanding */
      width: 100%;
      min-width: 100%;
    }

    /* 2. Nuclear Reset: Force all child elements to obey the boundaries */
    .content-wrapper * {
      max-width: ${contentWidth}px !important;
      box-sizing: border-box !important;
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
      text-decoration: none !important;
    }

    .content-wrapper u, .content-wrapper ins { text-decoration: underline !important; }
    .content-wrapper s, .content-wrapper strike, .content-wrapper del { text-decoration: line-through !important; }

    /* 3. Catch specific unbreakable elements */
    .content-wrapper pre,
    .content-wrapper code,
    .content-wrapper table,
    .content-wrapper img {
      max-width: 100% !important;
      white-space: pre-wrap !important;
    }

    .content-wrapper h1, .content-wrapper h2, .content-wrapper h3 {
      margin-bottom: 0.5em;
      line-height: 1.3;
    }
    .content-wrapper h1 { font-size: 1.5em; }
    .content-wrapper h2 { font-size: 1.3em; }
    .content-wrapper h3 { font-size: 1.15em; }

    .content-wrapper p {
      margin-bottom: 0.8em;
      text-align: justify;
    }

    .content-wrapper img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0.5em auto;
    }

    .content-wrapper a { color: inherit; text-decoration: none !important; }
    .content-wrapper blockquote {
      border-left: 3px solid #666;
      padding-left: 1em;
      margin: 0.8em 0;
      font-style: italic;
    }
    .content-wrapper ul, .content-wrapper ol {
      padding-left: 1.5em;
      margin-bottom: 0.8em;
    }
    .content-wrapper li { margin-bottom: 0.3em; }
    .content-wrapper pre, .content-wrapper code {
      font-family: monospace;
      font-size: 0.9em;
    }
    .content-wrapper table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.5em 0;
    }
    .content-wrapper td, .content-wrapper th {
      border: 1px solid #999;
      padding: 0.3em 0.5em;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="content-wrapper" id="content">
      ${processedHtml}
    </div>
  </div>
</body>
</html>`;

  // Load the HTML into Puppeteer
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(fullHtml, { waitUntil: 'load', timeout: 40000 });

  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);

  // Measure total content width to determine page count
  const totalScrollWidth = await page.evaluate(() => {
    return document.getElementById('content').scrollWidth;
  });

  const columnStep = contentWidth + scaledPadding * 2; // column-width + column-gap

  const totalPages = Math.max(1, Math.ceil(totalScrollWidth / columnStep));

  const screenshots = [];

  for (let i = 0; i < totalPages; i++) {
    // Scroll to the correct column
    if (i > 0) {
      await page.evaluate((scrollX) => {
        document.getElementById('content').style.transform = `translateX(-${scrollX}px)`;
      }, i * columnStep);

      // Small delay for repaint
      await new Promise(r => setTimeout(r, 50));
    }

    const buffer = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
    });

    screenshots.push(buffer);
  }

  return screenshots;
}

/**
 * Render all chapters, reusing a single browser instance.
 * @param {object[]} chapters - Array of {id, title, htmlContent}
 * @param {object} options - Rendering options (same as renderChapter)
 * @param {function} [onProgress] - Callback (chapterIndex, totalChapters, chapterTitle)
 * @returns {Promise<{pages: Buffer[], chapterMarkers: object[]}>}
 */
async function renderAllChapters(chapters, options = {}, onProgress) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });

  const allPages = [];
  const chapterMarkers = []; // { title, startPage }

  try {
    const page = await browser.newPage();

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      if (onProgress) onProgress(i, chapters.length, chapter.title);

      console.log(`  → Rendering chapter ${i + 1}/${chapters.length}: "${chapter.title}"`);

      const startPage = allPages.length;
      const screenshots = await renderChapter(page, chapter.htmlContent, options);
      allPages.push(...screenshots);

      chapterMarkers.push({
        title: chapter.title,
        startPage: startPage,
        pageCount: screenshots.length,
      });

      console.log(`    ${screenshots.length} pages generated`);
    }

    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`✓ Rendered ${allPages.length} total pages from ${chapters.length} chapters`);

  return { pages: allPages, chapterMarkers };
}

module.exports = { renderChapter, renderAllChapters };
