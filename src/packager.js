const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const { PassThrough } = require('stream');

/**
 * Package optimized image pages into a valid EPUB3 fixed-layout file.
 *
 * @param {object} metadata - Book metadata {title, author, language}
 * @param {Buffer[]} imageBuffers - Array of optimized PNG page buffers
 * @param {object[]} chapterMarkers - [{title, startPage, pageCount}]
 * @param {object} options
 * @param {number} [options.width=800] - Page width in px
 * @param {number} [options.height=480] - Page height in px
 * @param {string} [options.outputPath] - If provided, writes to file. Otherwise returns Buffer.
 * @returns {Promise<Buffer>} The EPUB file as a Buffer
 */
async function packageEpub(metadata, imageBuffers, chapterMarkers = [], options = {}) {
  const { width = 800, height = 480, format = 'png' } = options;
  const ext = format === 'jpg' ? 'jpg' : 'png';

  const bookId = `urn:uuid:${uuidv4()}`;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const totalPages = imageBuffers.length;

  return new Promise((resolve, reject) => {
    const buffers = [];
    const passthrough = new PassThrough();

    passthrough.on('data', chunk => buffers.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(buffers)));
    passthrough.on('error', reject);

    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    archive.on('error', reject);
    archive.pipe(passthrough);

    // mimetype
    archive.append('application/epub+zip', { name: 'mimetype', store: true });

    // META-INF/container.xml
    archive.append(generateContainerXml(), { name: 'META-INF/container.xml' });

    // OEBPS/content.opf
    archive.append(
      generateContentOpf(metadata, totalPages, chapterMarkers, bookId, now, width, height, ext),
      { name: 'OEBPS/content.opf' }
    );

    // OEBPS/toc.xhtml (EPUB3 navigation)
    archive.append(
      generateTocXhtml(metadata, chapterMarkers),
      { name: 'OEBPS/toc.xhtml' }
    );

    // OEBPS/toc.ncx (EPUB2 fallback navigation)
    archive.append(
      generateTocNcx(metadata, chapterMarkers, bookId),
      { name: 'OEBPS/toc.ncx' }
    );

    // OEBPS/css/page.css
    archive.append(
      generatePageCss(width, height),
      { name: 'OEBPS/css/page.css' }
    );

    // Page XHTML files + Image files
    for (let i = 0; i < totalPages; i++) {
      const pageNum = String(i + 1).padStart(4, '0');

      // XHTML wrapper for the image
      archive.append(
        generatePageXhtml(pageNum, width, height, ext),
        { name: `OEBPS/pages/page_${pageNum}.xhtml` }
      );

      // The actual image
      archive.append(imageBuffers[i], { name: `OEBPS/images/page_${pageNum}.${ext}` });
    }

    archive.finalize();
  });
}

// ─── XML Generators ──────────────────────────────────────────────

function generateContainerXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function generateContentOpf(metadata, totalPages, chapterMarkers, bookId, dateModified, width, height, ext) {
  // Manifest items
  let manifestItems = `    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n`;
  manifestItems += `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n`;
  manifestItems += `    <item id="page-css" href="css/page.css" media-type="text/css"/>\n`;

  for (let i = 0; i < totalPages; i++) {
    const num = String(i + 1).padStart(4, '0');
    manifestItems += `    <item id="page${num}" href="pages/page_${num}.xhtml" media-type="application/xhtml+xml"/>\n`;
    manifestItems += `    <item id="img${num}" href="images/page_${num}.${ext}" media-type="image/${ext}"/>\n`;
  }

  // Spine items
  let spineItems = '';
  for (let i = 0; i < totalPages; i++) {
    const num = String(i + 1).padStart(4, '0');
    spineItems += `    <itemref idref="page${num}"/>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${bookId}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:creator>${escapeXml(metadata.author)}</dc:creator>
    <dc:language>${metadata.language}</dc:language>
    <dc:publisher>${escapeXml(metadata.publisher || 'xEPUB Converter')}</dc:publisher>
    <meta property="dcterms:modified">${dateModified}</meta>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">none</meta>
    <meta name="viewport" content="width=${width}, height=${height}"/>
  </metadata>
  <manifest>
${manifestItems}  </manifest>
  <spine toc="ncx">
${spineItems}  </spine>
</package>`;
}

function generateTocXhtml(metadata, chapterMarkers) {
  let navItems = '';
  for (const marker of chapterMarkers) {
    const pageNum = String(marker.startPage + 1).padStart(4, '0');
    navItems += `      <li><a href="pages/page_${pageNum}.xhtml">${escapeXml(marker.title)}</a></li>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXml(metadata.title)} — Table of Contents</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
${navItems}    </ol>
  </nav>
</body>
</html>`;
}

function generateTocNcx(metadata, chapterMarkers, bookId) {
  let navPoints = '';
  for (let i = 0; i < chapterMarkers.length; i++) {
    const marker = chapterMarkers[i];
    const pageNum = String(marker.startPage + 1).padStart(4, '0');
    navPoints += `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(marker.title)}</text></navLabel>
      <content src="pages/page_${pageNum}.xhtml"/>
    </navPoint>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(metadata.title)}</text></docTitle>
  <navMap>
${navPoints}  </navMap>
</ncx>`;
}

function generatePageXhtml(pageNum, width, height, ext) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=${width}, height=${height}"/>
  <link rel="stylesheet" href="../css/page.css"/>
  <title>Page ${parseInt(pageNum)}</title>
</head>
<body>
  <div class="page">
    <img src="../images/page_${pageNum}.${ext}" width="${width}" height="${height}" alt="Page ${parseInt(pageNum)}"/>
  </div>
</body>
</html>`;
}

function generatePageCss(width, height) {
  return `* { margin: 0; padding: 0; }
html, body {
  width: ${width}px;
  height: ${height}px;
  overflow: hidden;
  background: #ffffff;
}
.page {
  width: ${width}px;
  height: ${height}px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page img {
  width: ${width}px;
  height: ${height}px;
  object-fit: contain;
}`;
}

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { packageEpub };
