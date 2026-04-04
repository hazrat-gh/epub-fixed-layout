const sharp = require('sharp');

/**
 * Compression presets for different use cases
 */
const PRESETS = {
  quality: {
    name: 'High Quality',
    colors: 16,
    dither: 0.75,
    description: 'Best visual quality, larger files',
  },
  balanced: {
    name: 'Balanced',
    colors: 8,
    dither: 0.5,
    description: 'Good balance of quality and size',
  },
  compact: {
    name: 'Compact',
    colors: 4,
    dither: 0.25,
    description: 'Smallest files, reduced quality',
  },
};

/**
 * Optimize a single PNG screenshot for e-ink display.
 * Converts to grayscale and reduces to an indexed PNG with limited palette.
 *
 * @param {Buffer} pngBuffer - Raw PNG screenshot buffer
 * @param {object} [options]
 * @param {string} [options.preset='compact'] - Preset name: 'quality', 'balanced', 'compact'
 * @param {number} [options.colors] - Override: number of palette colors (2–256)
 * @param {number} [options.dither] - Override: dithering level (0–1)
 * @param {number} [options.width] - Resize width (if different from source)
 * @param {number} [options.height] - Resize height (if different from source)
 * @returns {Promise<Buffer>} Optimized JPG/PNG buffer
 */
async function optimizeImage(pngBuffer, options = {}) {
  const preset = PRESETS[options.preset] || PRESETS.compact;
  const colors = options.colors || preset.colors;
  const dither = options.dither != null ? options.dither : preset.dither;

  let pipeline = sharp(pngBuffer).grayscale();

  if (options.width && options.height) {
    pipeline = pipeline.resize(options.width, options.height, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    });
  }

  // Dynamic output based on device needs
  if (options.outputFormat === 'jpg') {
    // Map preset to quality for JPG
    const presetName = options.preset || 'compact';
    const qualityMap = { quality: 90, balanced: 80, compact: 65 };
    const quality = qualityMap[presetName] || 65;

    return await pipeline
      .jpeg({
        quality: quality,
        mozjpeg: true,
        chromaSubsampling: '4:2:0'
      })
      .toBuffer();
  } else {
    return await pipeline
      .png({
        palette: true,
        colors: colors,
        effort: 7,
        dither: dither,
        compressionLevel: 9,
      })
      .toBuffer();
  }
}

/**
 * Optimize all page images in batch.
 *
 * @param {Buffer[]} buffers - Array of raw PNG buffers
 * @param {object} [options] - Same options as optimizeImage
 * @param {function} [onProgress] - Callback (index, total)
 * @returns {Promise<Buffer[]>} Array of optimized PNG buffers
 */
async function optimizeAll(buffers, options = {}, onProgress) {
  const results = new Array(buffers.length);
  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  let completed = 0;

  // Process in chunks
  const concurrency = 10;
  for (let i = 0; i < buffers.length; i += concurrency) {
    const chunk = buffers.slice(i, i + concurrency);

    // Optimize the chunk in parallel
    const chunkResults = await Promise.all(chunk.map(async (original, idx) => {
      const optimized = await optimizeImage(original, options);
      return { index: i + idx, original, optimized };
    }));

    // Tally stats and update progress
    for (const res of chunkResults) {
      results[res.index] = res.optimized;
      totalOriginalSize += res.original.length;
      totalOptimizedSize += res.optimized.length;
      if (onProgress) onProgress(completed, buffers.length);
      completed++;
    }
  }

  const ratio = ((1 - totalOptimizedSize / totalOriginalSize) * 100).toFixed(1);
  console.log(
    `✓ Optimized ${buffers.length} images: ${formatBytes(totalOriginalSize)} → ${formatBytes(totalOptimizedSize)} (${ratio}% reduction)`
  );

  return results;
}

/**
 * Estimate output file size based on input parameters.
 * @param {number} inputSizeBytes - Size of the input EPUB in bytes
 * @param {object} options
 * @param {string} [options.preset='balanced'] - Compression preset
 * @param {number} [options.width=800] - Target viewport width
 * @param {number} [options.height=480] - Target viewport height
 * @returns {object} Estimated sizes
 */
function estimateSize(inputSizeBytes, options = {}) {
  const preset = options.preset || 'compact';
  const width = options.width || 800;
  const height = options.height || 480;
  const device = options.device || 'xteink-x4';

  // Estimate Pages (Scale base capacity by resolution ratio)
  const basePixels = 800 * 480;
  const targetPixels = width * height;

  // Exponent 0.4 dampens the resolution effect because fonts scale up via PPI
  const resolutionFactor = Math.pow(targetPixels / basePixels, 0.4);
  const bytesPerPageDivisor = 9000 * resolutionFactor;

  const estimatedPages = Math.max(5, Math.round(inputSizeBytes / bytesPerPageDivisor));

  // Estimate File Size (Base cost per page based on format)
  const isJpg = device.includes('xteink');
  let basePageSizeKB = 0;

  if (isJpg) {
    const jpgSizes = { quality: 80, balanced: 50, compact: 30 };
    basePageSizeKB = jpgSizes[preset] || 50;
    basePageSizeKB *= Math.pow(targetPixels / basePixels, 0.3);
  } else {
    const pngSizes = { quality: 120, balanced: 45, compact: 25 };
    basePageSizeKB = pngSizes[preset] || 45;
    basePageSizeKB *= Math.pow(targetPixels / basePixels, 0.15);
  }

  const avgPageSize = Math.round(basePageSizeKB * 1024);
  const estimatedTotal = estimatedPages * avgPageSize;
  const epubOverhead = 50000 + estimatedPages * 500;

  return {
    estimatedPages,
    avgPageSizeBytes: avgPageSize,
    estimatedTotalBytes: estimatedTotal + epubOverhead,
    estimatedTotalFormatted: formatBytes(estimatedTotal + epubOverhead),
    preset: PRESETS[preset]?.name || preset,
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = { optimizeImage, optimizeAll, estimateSize, PRESETS, formatBytes };
