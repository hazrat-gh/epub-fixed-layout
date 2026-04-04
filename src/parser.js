const { EPub } = require('epub2');
const path = require('path');

/**
 * Parse an EPUB file and extract its structure, metadata, and content.
 * @param {string} filePath - path to the .epub file
 * @returns {Promise<object>} Parsed EPUB data
 */
async function parseEpub(filePath) {
  const epub = await EPub.createAsync(filePath);

  const metadata = {
    title: epub.metadata.title || 'Untitled',
    author: epub.metadata.creator || 'Unknown',
    language: epub.metadata.language || 'en',
    publisher: epub.metadata.publisher || '',
    description: epub.metadata.description || '',
  };

  // Extract chapters in spine order
  const chapters = [];
  for (const item of epub.flow) {
    try {
      const content = await new Promise((resolve, reject) => {
        epub.getChapter(item.id, (err, text) => {
          if (err) reject(err);
          else resolve(text);
        });
      });
      chapters.push({
        id: item.id,
        href: item.href,
        title: item.title || `Chapter ${chapters.length + 1}`,
        htmlContent: content,
      });
    } catch (err) {
      console.warn(`⚠ Skipping chapter "${item.id}": ${err.message}`);
    }
  }

  // Extract images referenced in the manifest
  const images = [];
  if (epub.manifest) {
    for (const [id, entry] of Object.entries(epub.manifest)) {
      if (entry['media-type'] && entry['media-type'].startsWith('image/')) {
        try {
          const [data, mimeType] = await new Promise((resolve, reject) => {
            epub.getImage(id, (err, imgData, imgMime) => {
              if (err) reject(err);
              else resolve([imgData, imgMime]);
            });
          });
          images.push({
            id,
            href: entry.href,
            contentType: mimeType || entry['media-type'],
            data,
          });
        } catch (err) {
          // Non-critical
        }
      }
    }
  }

  // Extract CSS stylesheets from manifest
  const stylesheets = [];
  if (epub.manifest) {
    for (const [id, entry] of Object.entries(epub.manifest)) {
      if (entry['media-type'] === 'text/css') {
        try {
          const cssContent = await new Promise((resolve, reject) => {
            epub.getChapter(id, (err, text) => {
              if (err) reject(err);
              else resolve(text);
            });
          });
          stylesheets.push({ id, href: entry.href, content: cssContent });
        } catch (err) {
          // Non-critical
        }
      }
    }
  }

  console.log(`✓ Parsed "${metadata.title}" — ${chapters.length} chapters, ${images.length} images`);

  return { metadata, chapters, images, stylesheets };
}

module.exports = { parseEpub };
