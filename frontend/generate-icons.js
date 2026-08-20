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
  // Safe margins for maskable / standard icons
  const cornerRadius = isMaskable || isAppleTouch ? '0' : '108';
  const viewBoxSize = 512;
  const padding = isMaskable ? 48 : 20;
  const cardSize = viewBoxSize - (padding * 2);
  const cardRadius = isMaskable ? 80 : 96;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${viewBoxSize}" height="${viewBoxSize}">
  <defs>
    <!-- Outer Dark Ambient Gradient for PWA Canvas -->
    <linearGradient id="canvasBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090D16"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>

    <!-- Main Icon Brand Gradient: Blue to Indigo (same as App Header) -->
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="50%" stop-color="#1D4ED8"/>
      <stop offset="100%" stop-color="#4338CA"/>
    </linearGradient>

    <!-- Light reflection shine on top half -->
    <linearGradient id="topShine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>

    <!-- AI Corner Badge Gradient -->
    <linearGradient id="aiBadgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="50%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#818CF8"/>
    </linearGradient>

    <!-- AI Spark Glow -->
    <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#BAE6FD"/>
    </linearGradient>

    <!-- Filters for crisp shadow & glow -->
    <filter id="badgeShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="-2" dy="-2" stdDeviation="6" flood-color="#0F172A" flood-opacity="0.6"/>
    </filter>

    <filter id="sparkGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  ${isMaskable ? `<rect width="512" height="512" fill="url(#canvasBg)"/>` : ''}

  <!-- Main Rounded App Icon Container -->
  <g transform="${isMaskable ? 'translate(48, 48)' : 'translate(20, 20)'}">
    <!-- Base Icon Box -->
    <rect width="${cardSize}" height="${cardSize}" rx="${cardRadius}" fill="url(#brandGrad)"/>
    
    <!-- Top Glass Highlight -->
    <rect width="${cardSize}" height="${cardSize / 2}" rx="${cardRadius}" fill="url(#topShine)" opacity="0.4"/>
    
    <!-- Subtle Border Stroke -->
    <rect width="${cardSize}" height="${cardSize}" rx="${cardRadius}" fill="none" stroke="#60A5FA" stroke-width="4" stroke-opacity="0.4"/>

    <!-- Subtle Tech Grid / Circuit Accents in Background -->
    <g opacity="0.15" stroke="#FFFFFF" stroke-width="2">
      <circle cx="90" cy="90" r="45" fill="none" stroke-dasharray="8,6"/>
      <line x1="135" y1="90" x2="220" y2="90"/>
      <circle cx="220" cy="90" r="4" fill="#FFFFFF"/>
    </g>

    <!-- Center Typography: "SAP" (Heavy Enterprise Font) -->
    <!-- Clip path to keep AI badge inside rounded bounds -->
    <g clip-path="url(#cardClip)">
      <!-- Main "SAP" Wordmark -->
      <text 
        x="${cardSize / 2}" 
        y="${cardSize / 2 + 38}" 
        fill="#FFFFFF" 
        font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, sans-serif" 
        font-weight="900" 
        font-size="${isMaskable ? '145' : '165'}" 
        letter-spacing="-4" 
        text-anchor="middle"
        style="text-shadow: 0 4px 16px rgba(0,0,0,0.35);"
      >SAP</text>
    </g>

    <!-- Top-Left AI Star Sparkle -->
    <g transform="translate(60, 60)" filter="url(#sparkGlow)">
      <path d="M 0 -18 C 0 -6 6 0 18 0 C 6 0 0 6 0 18 C 0 6 -6 0 -18 0 C -6 0 0 -6 0 -18 Z" fill="url(#sparkGrad)"/>
      <circle cx="0" cy="0" r="3" fill="#FFFFFF"/>
    </g>

    <!-- Bottom-Right "AI" Badge (Integrated in Corner) -->
    <g transform="translate(${cardSize - (isMaskable ? 140 : 160)}, ${cardSize - (isMaskable ? 78 : 90)})" filter="url(#badgeShadow)">
      <!-- Badge Pillow with Cyan-Indigo Gradient -->
      <path 
        d="M 28 0 L ${isMaskable ? 140 : 160} 0 L ${isMaskable ? 140 : 160} ${isMaskable ? 78 : 90} L 0 ${isMaskable ? 78 : 90} C 0 ${isMaskable ? 50 : 60} 10 0 28 0 Z" 
        fill="url(#aiBadgeGrad)"
        opacity="0.96"
      />
      <!-- Inner Border Glow -->
      <path 
        d="M 28 0 L ${isMaskable ? 140 : 160} 0 L ${isMaskable ? 140 : 160} ${isMaskable ? 78 : 90} L 0 ${isMaskable ? 78 : 90} C 0 ${isMaskable ? 50 : 60} 10 0 28 0 Z" 
        fill="none" 
        stroke="#E0F2FE" 
        stroke-width="2.5" 
        stroke-opacity="0.8"
      />
      <!-- AI Text -->
      <text 
        x="${(isMaskable ? 140 : 160) / 2 + 10}" 
        y="${(isMaskable ? 78 : 90) / 2 + 19}" 
        fill="#FFFFFF" 
        font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, sans-serif" 
        font-weight="900" 
        font-size="${isMaskable ? '48' : '56'}" 
        letter-spacing="1" 
        text-anchor="middle"
        style="text-shadow: 0 2px 8px rgba(0,0,0,0.3);"
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