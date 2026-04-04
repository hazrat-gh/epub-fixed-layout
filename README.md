# xEPUB

Convert standard text-based EPUB files into predefined fixed-layout, image-based EPUBs formatted for E-Ink devices.

---

## Installation

Install `xEPUB` globally via npm:

```bash
npm install -g epub-fixed-layout
```

*(Note: If you downloaded the source code directly instead of from npm, open your terminal inside the downloaded folder and type `npm link` instead).*

---

## How to Use xEPUB (Examples)

All conversions are done by typing `xepub` followed by your desired settings in the terminal.

> **Pro-Tip (Zero-Config Automation):**
> If you are working in a folder that contains exactly **one** `.epub` file, you don't even need to type the name! Just type:
> ```bash
> xepub
> ```
> The tool will automatically detect your file and convert it immediately.
> 
> *Alternatively*, you can create an `input` folder and drop EPUBs in there. Running `xepub` will always automatically convert the newest one!

### 1. The Basic Conversion
If you just want to quickly convert a specific book for a standard 800x480 reader:
```bash
xepub mybook.epub
```
*Wait a few moments, and the final image-based `.epub` will be generated in an `output/` folder.*

### 2. Convert for other e-ink devices
You can optimize the output specifically for your device's screen and orientation:
```bash
xepub mybook.epub --device 
'kindle-paperwhite' --orientation portrait
```

### 3. Maximum Space Savings
If your e-ink device has very limited storage space, use maximum compression (this drops color depth dramatically to save 30-50% more space, without making text unreadable):
```bash
xepub mybook.epub --preset compact
```
*(Available presets: `compact`, `balanced`, `quality`)*

### 4. Custom Resolutions for Unsupported Devices
If your specific device is not in the presets list, you can bypass the preset system entirely and force its exact pixel dimensions manually:
```bash
xepub mybook.epub --width 1440 --height 1080 --orientation landscape
```

### 5. Customizing Fonts (Google Fonts & Local Fonts)
By default, `xepub` will automatically download and apply the "Noto Serif Bengali" Google font. However, you can change this to any other Google Font *or* completely override it using a local `.ttf` file.

**A) Using a different Google Font:**
```bash
xepub mybook.epub --font-size 35 --google-font "Noto Sans Bengali"
```

**B) Using a local font file from your computer:**
*(Make sure to provide both the file path and the internal font name)*
```bash
xepub mybook.epub --font-size 35 --font "./my_fonts/CustomFont.ttf" --font-name "CustomFont"
```

### 6. Create a Quick Preview Image
To generate a single-page screenshot to test your visual settings:
```bash
xepub mybook.epub --preview --font-size 35 --google-font "Noto Serif Bengali"
```
*This will skip the full conversion process and instantly create a `mybook_preview.png` image.*

### 7. Preview a Specific Chapter or Page
If you want to test how chapter 4 specifically looks on page 2:
```bash
xepub mybook.epub --preview --preview-chapter 4 --preview-page 2
```

### 8. Estimate File Size
See exactly how many pages your output EPUB will have, and how large the file will be, before you start the conversion:
```bash
xepub mybook.epub --estimate --device boox-poke
```

---

## Default Configuration File

If you find yourself perfectly tuning your settings, you can create a `default.json` file in your working folder. `xepub` will automatically load it.

**Example `default.json`:**
```json
{
  "device": "kindle-paperwhite",
  "fontSize": 30,
  "googleFont": "Noto Serif Bengali",
  "preset": "compact",
  "padding": 20
}
```
Now, simply typing `xepub mybook.epub` will automatically use all of these settings!

---

## Advanced Options Reference

| Flag | Description | Default |
|---|---|---|
| `--output`, `-o` | Output file path | `./output/<input>_xEPUB.epub` |
| `--device`, `-d` | Device preset (e.g. `kindle-paperwhite`, `xteink-x4`) | `custom` |
| `--orientation` | Force orientation (`landscape` or `portrait`) | Device specific |
| `--preset`, `-p` | Compression (`quality`, `balanced`, `compact`) | `compact` |
| `--font`, `-f` | Path to custom `.ttf` font file | `fonts/Kalpurush.ttf` |
| `--google-font` | Google Font name | `Noto Serif Bengali` |
| `--font-size` | Logical font size in pixels | `30` |
| `--line-height` | Line height multiplier | `1.6` |
| `--padding` | Page padding in pixels | `20` |
| `--list-devices` | List available device presets | |
| `--preview` | Generate a single preview page image | |
| `--preview-chapter <n>`| Specify chapter index for preview | `0` |
| `--preview-page <n>` | Specify page index for preview | Middle page |
| `--estimate` | Estimate output file size without converting | |
