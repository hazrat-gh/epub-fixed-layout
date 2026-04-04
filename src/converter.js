const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const { parseEpub } = require('./parser');
const { renderAllChapters, renderChapter } = require('./renderer');
const { optimizeAll, optimizeImage } = require('./optimizer');
const puppeteer = require('puppeteer');
const { packageEpub } = require('./packager');

/**
 * Device resolution presets for popular e-ink readers.
 */
const DEVICE_PRESETS = {
  'xteink-x4': { name: 'Xteink X4', width: 800, height: 480, orientation: 'landscape', ppi: 217 },
  'xteink-x3': { name: 'Xteink X3', width: 792, height: 528, orientation: 'landscape', ppi: 257 },
  'kindle-paperwhite': { name: 'Kindle Paperwhite', width: 1080, height: 1440, orientation: 'portrait', ppi: 300 },
  'kindle-basic': { name: 'Kindle Basic', width: 1024, height: 758, orientation: 'portrait', ppi: 212 },
  'kobo-clara': { name: 'Kobo Clara', width: 1080, height: 1440, orientation: 'portrait', ppi: 300 },
  'kobo-libra': { name: 'Kobo Libra', width: 1264, height: 1680, orientation: 'portrait', ppi: 300 },
  'boox-poke': { name: 'Boox Poke 5', width: 1072, height: 1448, orientation: 'portrait', ppi: 300 },
  'remarkable-2': { name: 'reMarkable 2', width: 1404, height: 1872, orientation: 'portrait', ppi: 226 },
  custom: { name: 'Custom', width: 800, height: 480, orientation: 'landscape', ppi: 217 }, // Fallback
};

/**
 * Main conversion pipeline.
 * Extends EventEmitter to report progress:
 *   - 'progress' → { stage, message, percent }
 *   - 'done' → { outputPath, stats }
 *   - 'error' → Error
 */
class Converter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      device: 'custom',
      width: null,
      height: null,
      preset: 'compact',
      fontPath: null,
      fontFamily: 'Kalpurush',
      googleFont: 'Noto Serif Bengali',
      fontSize: 30,
      lineHeight: 1.6,
      padding: 20,
      ...options,
    };

    const devicePreset = DEVICE_PRESETS[this.options.device] || DEVICE_PRESETS['xteink-x4'];

    // Set PPI from preset (or default)
    this.options.ppi = devicePreset.ppi || 217;

    // Determine base dimensions
    let w = this.options.width || devicePreset.width;
    let h = this.options.height || devicePreset.height;

    // Determine orientation (fallback to preset default)
    const targetOrientation = this.options.orientation || devicePreset.orientation;

    // Swap dimensions based on orientation
    if (targetOrientation === 'portrait') {
      this.options.width = Math.min(w, h);
      this.options.height = Math.max(w, h);
    } else {
      this.options.width = Math.max(w, h);
      this.options.height = Math.min(w, h);
    }

    // Set Image Format Flag
    this.options.outputFormat = this.options.device.includes('xteink') ? 'jpg' : 'png';
  }

  /**
   * Run the full conversion pipeline.
   * @param {string} inputPath - Path to the input .epub file
   * @param {string} outputPath - Path to write the output .epub file
   * @returns {Promise<object>} Conversion stats
   */
  async convert(inputPath, outputPath) {
    const startTime = Date.now();

    try {
      // Parse
      this.emit('progress', { stage: 'parsing', message: 'Parsing EPUB structure...', percent: 5 });
      const epubData = await parseEpub(inputPath);
      this.emit('progress', { stage: 'parsing', message: `Found ${epubData.chapters.length} chapters`, percent: 15 });

      if (epubData.chapters.length === 0) {
        throw new Error('No readable chapters found in the EPUB file.');
      }

      // Render
      this.emit('progress', { stage: 'rendering', message: 'Starting Puppeteer rendering...', percent: 20 });

      const renderOptions = {
        width: this.options.width,
        height: this.options.height,
        ppi: this.options.ppi,
        fontPath: this.options.fontPath,
        fontFamily: this.options.fontFamily,
        googleFont: this.options.googleFont,
        fontSize: this.options.fontSize,
        lineHeight: this.options.lineHeight,
        padding: this.options.padding,
        images: epubData.images,
      };

      const { pages, chapterMarkers } = await renderAllChapters(
        epubData.chapters,
        renderOptions,
        (chapterIdx, totalChapters) => {
          const percent = 20 + Math.round((chapterIdx / totalChapters) * 40);
          this.emit('progress', {
            stage: 'rendering',
            message: `Rendering chapter ${chapterIdx + 1}/${totalChapters}...`,
            percent,
          });
        }
      );

      // Optimize
      this.emit('progress', { stage: 'optimizing', message: 'Optimizing images for e-ink...', percent: 60 });

      const optimizedPages = await optimizeAll(
        pages,
        {
          preset: this.options.preset,
          width: this.options.width,
          height: this.options.height,
          outputFormat: this.options.outputFormat
        },
        (idx, total) => {
          const percent = 60 + Math.round((idx / total) * 20);
          this.emit('progress', {
            stage: 'optimizing',
            message: `Optimizing page ${idx + 1}/${total}...`,
            percent,
          });
        }
      );

      // Package
      this.emit('progress', { stage: 'packaging', message: 'Building EPUB3 fixed-layout file...', percent: 85 });

      const epubBuffer = await packageEpub(
        epubData.metadata,
        optimizedPages,
        chapterMarkers,
        {
          width: this.options.width,
          height: this.options.height,
          format: this.options.outputFormat
        }
      );

      // Write output file
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, epubBuffer);

      // Calculate stats
      const inputSize = fs.statSync(inputPath).size;
      const outputSize = epubBuffer.length;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      const stats = {
        inputFile: path.basename(inputPath),
        outputFile: path.basename(outputPath),
        inputSize,
        outputSize,
        totalPages: optimizedPages.length,
        chapters: chapterMarkers.length,
        dimensions: `${this.options.width}×${this.options.height}`,
        preset: this.options.preset,
        elapsed: `${elapsed}s`,
      };

      this.emit('progress', { stage: 'done', message: 'Conversion complete!', percent: 100 });
      this.emit('done', { outputPath, stats });

      console.log(`\n✓ Conversion complete in ${elapsed}s`);
      console.log(`  Input:  ${path.basename(inputPath)} (${formatBytes(inputSize)})`);
      console.log(`  Output: ${path.basename(outputPath)} (${formatBytes(outputSize)})`);
      console.log(`  Pages:  ${optimizedPages.length} | Chapters: ${chapterMarkers.length}`);

      return stats;

    } catch (err) {
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * Extract a single page preview
   */
  async extractPreview(inputPath, outputPath, options = {}) {
    try {
      this.emit('progress', { stage: 'parsing', message: 'Parsing EPUB...', percent: 10 });
      const epubData = await parseEpub(inputPath);
      if (!epubData.chapters || epubData.chapters.length === 0) throw new Error("No readable chapters found.");

      let chapterIndex = options.chapter;
      if (chapterIndex === undefined) {
        let maxLen = 0;
        chapterIndex = 0;
        for (let i = 0; i < epubData.chapters.length; i++) {
          if (epubData.chapters[i].htmlContent.length > maxLen) {
            maxLen = epubData.chapters[i].htmlContent.length;
            chapterIndex = i;
          }
        }
      }

      const chapter = epubData.chapters[chapterIndex];
      if (!chapter) throw new Error("Invalid chapter index");

      this.emit('progress', { stage: 'rendering', message: 'Rendering preview chapter...', percent: 40 });

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

      let pageBuffer;
      try {
        const page = await browser.newPage();
        const renderOptions = {
          width: this.options.width,
          height: this.options.height,
          ppi: this.options.ppi,
          fontPath: this.options.fontPath,
          fontFamily: this.options.fontFamily,
          googleFont: this.options.googleFont,
          fontSize: this.options.fontSize,
          lineHeight: this.options.lineHeight,
          padding: this.options.padding,
          images: epubData.images,
        };

        const screenshots = await renderChapter(page, chapter.htmlContent, renderOptions);

        let pageIndex = options.page;
        if (pageIndex === undefined) {
          pageIndex = screenshots.length > 2 ? Math.floor(screenshots.length / 2) : 0;
        } else {
          pageIndex = Math.min(pageIndex, screenshots.length - 1);
        }

        const rawBuffer = screenshots[pageIndex];
        if (!rawBuffer) throw new Error("Could not extract page");

        this.emit('progress', { stage: 'optimizing', message: 'Optimizing preview image...', percent: 80 });

        pageBuffer = await optimizeImage(rawBuffer, {
          preset: this.options.preset,
          width: this.options.width,
          height: this.options.height,
          outputFormat: this.options.outputFormat
        });

      } finally {
        await browser.close();
      }

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, pageBuffer);
      this.emit('progress', { stage: 'done', message: 'Preview saved!', percent: 100 });
    } catch (err) {
      this.emit('error', err);
      throw err;
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = { Converter, DEVICE_PRESETS };
