import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

/**
 * Generate standard and maskable SVG matching the SAP AI icon design:
 * Gradient Blue-to-Indigo background, bold white "SAP" typography,
 * and a glowing Cyan-Indigo "AI" badge on the bottom-right corner.
 */
function createSapAiSvg({ isMaskable = false, isAppleTouch = false } = {}) {
  const viewBoxSize = 512;

  // Maskable icons fill full square so Android/iOS can crop into any shape (circle, squircle, etc.)
  if (isMaskable) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${viewBoxSize}" height="${viewBoxSize}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#4338CA"/>
    </linearGradient>
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>
  </defs>

  <!-- Full Background for Maskable Icon -->
  <rect width="512" height="512" fill="url(#bgGrad)"/>

  <!-- Main Content centered within Safe Zone (circle radius ~200px) -->
  <g transform="translate(256, 256)">
    <!-- SAP Main Text -->
    <text
      x="-18"
      y="18"
      fill="#FFFFFF"
      font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
      font-weight="900"
      font-size="160"
      letter-spacing="-7"
      text-anchor="middle"
      dominant-baseline="central"
    >SAP</text>

    <!-- AI Badge in Bottom Right of Safe Area -->
    <g transform="translate(68, 52)">
      <rect
        x="0"
        y="0"
        width="118"
        height="76"
        rx="22"
        fill="url(#badgeGrad)"
      />
      <text
        x="59"
        y="38"
        fill="#FFFFFF"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        font-weight="900"
        font-size="52"
        letter-spacing="-1"
        text-anchor="middle"
        dominant-baseline="central"
      >AI</text>
    </g>
  </g>
</svg>`;
  }

  // Standard standalone & Apple touch icon
  const rx = isAppleTouch ? '0' : '112';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${viewBoxSize}" height="${viewBoxSize}">
  <defs>
    <!-- Background Gradient: from-blue-600 to-indigo-700 -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#4338CA"/>
    </linearGradient>

    <!-- Badge Gradient: from-sky-400 to-indigo-500 -->
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>

    <!-- Clipping path to keep corner badge perfectly clipped to icon rounded corner -->
    <clipPath id="iconClip">
      <rect width="512" height="512" rx="${rx}"/>
    </clipPath>
  </defs>

  <g clip-path="url(#iconClip)">
    <!-- Base Icon Background -->
    <rect width="512" height="512" rx="${rx}" fill="url(#bgGrad)"/>

    <!-- Main "SAP" Typography -->
    <text
      x="234"
      y="248"
      fill="#FFFFFF"
      font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
      font-weight="900"
      font-size="188"
      letter-spacing="-8"
      text-anchor="middle"
      dominant-baseline="central"
    >SAP</text>

    <!-- Bottom-Right "AI" Badge -->
    <!-- Positioned at the bottom-right corner with rounded-top-left -->
    <g transform="translate(276, 296)">
      <path
        d="M 46 0 L 236 0 L 236 216 L 0 216 L 0 46 C 0 20.6 20.6 0 46 0 Z"
        fill="url(#badgeGrad)"
      />
      <!-- AI Text centered inside the badge -->
      <text
        x="110"
        y="102"
        fill="#FFFFFF"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        font-weight="900"
        font-size="88"
        letter-spacing="-1"
        text-anchor="middle"
        dominant-baseline="central"
      >AI</text>
    </g>
  </g>
</svg>`;
}

async function run() {
  console.log('Generating official SAP AI icon suite...');

  const standardSvg = createSapAiSvg({ isMaskable: false, isAppleTouch: false });
  const appleSvg = createSapAiSvg({ isMaskable: false, isAppleTouch: true });
  const maskableSvg = createSapAiSvg({ isMaskable: true, isAppleTouch: false });

  // Write SVGs
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), standardSvg);
  fs.writeFileSync(path.join(publicDir, 'pwa-192x192.svg'), standardSvg);
  fs.writeFileSync(path.join(publicDir, 'pwa-512x512.svg'), standardSvg);
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.svg'), appleSvg);
  fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.svg'), maskableSvg);

  // Generate high-resolution PNGs using sharp
  await sharp(Buffer.from(standardSvg))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('✔ Generated pwa-192x192.png');

  await sharp(Buffer.from(standardSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('✔ Generated pwa-512x512.png');

  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('✔ Generated pwa-maskable-512x512.png');

  await sharp(Buffer.from(appleSvg))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✔ Generated apple-touch-icon.png');

  await sharp(Buffer.from(standardSvg))
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));
  console.log('✔ Generated favicon-32x32.png');

  console.log('All SAP AI icons generated successfully!');
}

run().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});