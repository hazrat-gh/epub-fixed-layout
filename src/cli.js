/**
 * @fileoverview Command Line Interface for the xEPUB Converter.
 * Orchestrates the conversion of standard EPUBs into fixed-layout image EPUBs
 * optimized for e-ink devices. Handles argument parsing, file discovery, and defaults.
 */

const path = require('path');
const fs = require('fs');
const { Converter, DEVICE_PRESETS } = require('./converter'); //

/**
 * Parses command line arguments into a structured options object.
 * * @param {string[]} args - Raw arguments array from process.argv.
 * @returns {Object} Parsed configuration options.
 */
function parseArgs(args) {
  const opts = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--list-devices') {
      opts.listDevices = true;
    } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      opts.output = args[++i];
    } else if ((arg === '--device' || arg === '-d') && args[i + 1]) {
      opts.device = args[++i];
    } else if (arg === '--orientation' && args[i + 1]) {
      opts.orientation = args[++i];
    } else if (arg === '--width' && args[i + 1]) {
      opts.width = parseInt(args[++i], 10);
    } else if (arg === '--height' && args[i + 1]) {
      opts.height = parseInt(args[++i], 10);
    } else if ((arg === '--preset' || arg === '-p') && args[i + 1]) {
      opts.preset = args[++i];
    } else if ((arg === '--font' || arg === '-f') && args[i + 1]) {
      opts.fontPath = path.resolve(args[++i]);
    } else if (arg === '--font-name' && args[i + 1]) {
      opts.fontFamily = args[++i];
    } else if (arg === '--google-font' && args[i + 1]) {
      opts.googleFont = args[++i];
    } else if (arg === '--font-size' && args[i + 1]) {
      opts.fontSize = parseInt(args[++i], 10);
    } else if (arg === '--line-height' && args[i + 1]) {
      opts.lineHeight = parseFloat(args[++i]);
    } else if (arg === '--padding' && args[i + 1]) {
      opts.padding = parseInt(args[++i], 10);
    } else if (arg === '--estimate') {
      opts.estimate = true;
    } else if (arg === '--preview') {
      opts.preview = true;
    } else if (arg === '--preview-chapter' && args[i + 1]) {
      opts.previewChapter = parseInt(args[++i], 10);
    } else if (arg === '--preview-page' && args[i + 1]) {
      opts.previewPage = parseInt(args[++i], 10);
    } else {
      positional.push(arg);
    }
  }

  opts.input = positional[0];
  return opts;
}

/**
 * Displays usage instructions and available command-line options.
 */
function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║                     xEPUB CLI                     ║
║Convert EPUB with custom settings for E-Ink Devices║
╚═══════════════════════════════════════════════════╝

Usage: xepub [input.epub] [options]

If no input file is provided, the script will automatically convert a 
single EPUB if one exists in the current directory, or fallback to the 
newest EPUB found in an ./input/ directory.

Options:
  --output, -o <path>    Output file path (default: ./output/<input>_xEPUB.epub)
  --device, -d <name>    Device preset (default: custom)
  --orientation <val>    Force orientation (default: device specific)
  --width <px>           Custom viewport width (default: device specific)
  --height <px>          Custom viewport height (default: device specific)
  --preset, -p <name>    Compression: quality | balanced | compact (default: compact)
  --font, -f <path>      Path to custom .ttf font file (default: fonts/Kalpurush.ttf)
  --font-name <name>     Font family name (default: Kalpurush)
  --google-font <name>   Google Font name (default: Noto Serif Bengali)
  --font-size <px>       Logical font size (default: 30)
  --line-height <n>      Line height multiplier (default: 1.6)
  --padding <px>         Logical page padding (default: 20)
  --estimate             Estimate output file size without converting
  --preview              Generate a single preview page image
  --preview-chapter <n>  Specify chapter index for preview
  --preview-page <n>     Specify page index for preview
  --list-devices         List available device presets
  --help, -h             Show this help message

  Examples:
  xepub book.epub
  xepub book.epub -d xteink-x3 --orientation portrait
  xepub book.epub -d kindle-paperwhite -p compact
  xepub book.epub -f fonts/kalpurush.ttf --font-name Kalpurush
  xepub book.epub --width 1024 --height 768 -o output.epub
  xepub book.epub --preview --font-size 35 --google-font "Noto Serif Bengali"
`);
}

/**
 * Displays the list of configured device presets.
 */
function showDevices() {
  console.log('\nAvailable device presets:\n');
  for (const [key, preset] of Object.entries(DEVICE_PRESETS)) {
    console.log(`  ${key.padEnd(20)} ${preset.name.padEnd(20)} ${preset.width}×${preset.height}  (${preset.orientation}, ${preset.ppi || 217} PPI)`); //
  }
  console.log('');
}

/**
 * Scans a specified directory and returns the path to the most recently modified .epub file.
 * * @param {string} dirPath - path to the directory to scan.
 * @returns {string|null} path to the latest EPUB, or null if none found.
 */
function getLatestEpub(dirPath) {
  if (!fs.existsSync(dirPath)) return null;

  const files = fs.readdirSync(dirPath)
    .filter(f => f.toLowerCase().endsWith('.epub'))
    .map(f => {
      const fullPath = path.join(dirPath, f);
      return { path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime); // Descending order by modification time

  return files.length > 0 ? files[0].path : null;
}

/**
 * Main execution pipeline.
 * Initializes configuration, resolves file paths, and triggers the conversion process.
 */
async function main() {
  const args = process.argv.slice(2); //
  const opts = parseArgs(args);

  // Handle informational flags
  if (opts.help) {
    showHelp();
    process.exit(0);
  }

  if (opts.listDevices) {
    showDevices();
    process.exit(0);
  }

  // Resolve Input Path
  let inputPath = opts.input ? path.resolve(opts.input) : null;

  if (!inputPath) {
    const cwdFiles = fs.readdirSync(process.cwd())
      .filter(f => f.toLowerCase().endsWith('.epub') && !f.toLowerCase().includes('_xepub'));

    if (cwdFiles.length === 1) {
      inputPath = path.resolve(cwdFiles[0]);
      console.log(`Auto-detected single EPUB file: ${cwdFiles[0]}`);
    } else {
      console.log('No specific input file provided. Searching for the latest EPUB in ./input/...');
      inputPath = getLatestEpub(path.join(process.cwd(), 'input'));
    }

    if (!inputPath) {
      console.error('Error: Please specify an EPUB file, ensure exactly 1 EPUB is in this folder, or use an ./input/ folder.\n');
      process.exit(1);
    }
  }

  // Resolve Output Path
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const defaultOutputName = path.basename(inputPath).replace(/\.epub$/i, '_xEPUB.epub'); //
  const outputPath = opts.output
    ? path.resolve(opts.output) //
    : path.join(outputDir, defaultOutputName);

  // Configure Conversion Defaults
  let fileOptions = {};
  const configPath = path.join(process.cwd(), 'default.json');
  if (fs.existsSync(configPath)) {
    try {
      fileOptions = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log(`Note: Loaded personal settings from default.json`);
    } catch (e) {
      console.error(`Warning: Failed to parse default.json - ${e.message}`);
    }
  }

  const rawOptions = {
    device: opts.device || fileOptions.device || 'custom',
    fontSize: opts.fontSize || fileOptions.fontSize || 30,
    preset: opts.preset || fileOptions.preset || 'compact',
    lineHeight: opts.lineHeight || fileOptions.lineHeight || 1.6,
    padding: opts.padding || fileOptions.padding || 20,
    orientation: opts.orientation || fileOptions.orientation,
    width: opts.width || fileOptions.width,
    height: opts.height || fileOptions.height,
    fontPath: opts.fontPath || fileOptions.fontPath,
    fontFamily: opts.fontFamily || fileOptions.fontFamily,
    googleFont: opts.googleFont || fileOptions.googleFont,
  };

  // Strip explicitly undefined properties to prevent overwriting downstream defaults
  const cleanOptions = Object.fromEntries(
    Object.entries(rawOptions).filter(([_, val]) => val !== undefined)
  );

  // Logging & Initialization
  console.log(`\nxEPUB Converter initialized`);
  console.log(`   Input:       ${inputPath}`);
  console.log(`   Output:      ${outputPath}`);
  console.log(`   Device:      ${cleanOptions.device}`);
  console.log(`   Font Size:   ${cleanOptions.fontSize}px`);
  if (cleanOptions.orientation) console.log(`   Orientation: ${cleanOptions.orientation}`);
  console.log(`   Preset:      ${cleanOptions.preset}`);
  if (cleanOptions.fontPath) console.log(`   Font:        ${cleanOptions.fontPath}`);
  console.log('');

  const converter = new Converter(cleanOptions);

  if (opts.estimate) {
    const { estimateSize, formatBytes } = require('./optimizer');
    const inputSize = fs.statSync(inputPath).size;
    const est = estimateSize(inputSize, cleanOptions);
    console.log('\n--- SIZE ESTIMATE ---');
    console.log(`Input size:     ${formatBytes(inputSize)}`);
    console.log(`Avg Page Size:  ${formatBytes(est.avgPageSizeBytes)}`);
    console.log(`Est. Pages:     ${est.estimatedPages}`);
    console.log(`Est. Total:     ${est.estimatedTotalFormatted}`);
    console.log('---------------------\n');
    process.exit(0);
  }

  // Attach progress listener for CLI visual feedback
  converter.on('progress', ({ stage, message, percent }) => { //
    const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5)); //
    process.stdout.write(`\r  [${bar}] ${percent}% — ${message}          `); //
  });

  // Execute Conversion
  try {
    if (opts.preview) {
      const ext = converter.options.outputFormat === 'jpg' ? '.jpg' : '.png';
      const previewOut = outputPath.replace(/\.epub$/i, '_preview' + ext);
      await converter.extractPreview(inputPath, previewOut, {
        chapter: opts.previewChapter,
        page: opts.previewPage
      });
      console.log(`\n\nPreview image created successfully at: ${previewOut}\n`);
      process.exit(0);
    }

    await converter.convert(inputPath, outputPath); //
    console.log('\n\nProcess completed successfully.\n');
    process.exit(0);
  } catch (err) {
    console.error(`\n\nFatal Error during conversion: ${err.message}\n`);
    process.exit(1);
  }
}

main();