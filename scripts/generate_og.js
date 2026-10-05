const fs = require('fs');
const sharp = require('sharp');

const width = 1200;
const height = 630;

// High-resolution SVG template for Jackpot 1200x630 OpenGraph & Twitter Social Card
const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <!-- Background Radial Gradient -->
    <radialGradient id="bgGlow" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#3d1b09" />
      <stop offset="45%" stop-color="#210d04" />
      <stop offset="85%" stop-color="#120602" />
      <stop offset="100%" stop-color="#0a0301" />
    </radialGradient>

    <!-- Luxury Gold Border Gradient -->
    <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="25%" stop-color="#f59e0b" />
      <stop offset="50%" stop-color="#b45309" />
      <stop offset="75%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#78350f" />
    </linearGradient>

    <!-- Title Gold Gradient -->
    <linearGradient id="titleGold" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="22%" stop-color="#fef08a" />
      <stop offset="60%" stop-color="#f59e0b" />
      <stop offset="88%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#92400e" />
    </linearGradient>

    <!-- Card 1: Star (Red/Gold) -->
    <linearGradient id="cardStar" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b110e" />
      <stop offset="100%" stop-color="#1a0604" />
    </linearGradient>

    <!-- Card 2: Circle (Amber) -->
    <linearGradient id="cardCircle" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3a220a" />
      <stop offset="100%" stop-color="#1a0c03" />
    </linearGradient>

    <!-- Card 3: Triangle (Emerald) -->
    <linearGradient id="cardTriangle" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d331e" />
      <stop offset="100%" stop-color="#05170d" />
    </linearGradient>

    <!-- Card 4: Cross (Blue) -->
    <linearGradient id="cardCross" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f2b46" />
      <stop offset="100%" stop-color="#061220" />
    </linearGradient>

    <!-- Card 5: Square (Purple) -->
    <linearGradient id="cardSquare" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2a123d" />
      <stop offset="100%" stop-color="#12061c" />
    </linearGradient>

    <!-- Drop Shadows -->
    <filter id="cardShadow" x="-20%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000000" flood-opacity="0.85" />
    </filter>

    <filter id="glowGold" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <filter id="textShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.9" />
    </filter>
  </defs>

  <!-- Canvas Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGlow)" />

  <!-- Outer Double Gold Frame -->
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="24" fill="none" stroke="url(#goldBorder)" stroke-width="4" opacity="0.9" />
  <rect x="36" y="36" width="${width - 72}" height="${height - 72}" rx="18" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="8 6" opacity="0.4" />

  <!-- Corner Flourishes -->
  <g fill="#f59e0b" opacity="0.75">
    <polygon points="52,52 64,44 76,52 64,60" />
    <polygon points="${width - 52},52 ${width - 64},44 ${width - 76},52 ${width - 64},60" />
    <polygon points="52,${height - 52} 64,${height - 60} 76,${height - 52} 64,${height - 44}" />
    <polygon points="${width - 52},${height - 52} ${width - 64},${height - 60} ${width - 76},${height - 52} ${width - 64},${height - 44}" />
  </g>

  <!-- Ambient Light Cone on Top -->
  <ellipse cx="600" cy="80" rx="380" ry="120" fill="#f59e0b" opacity="0.12" />

  <!-- TOP PILL: Multi-player party game tag -->
  <g transform="translate(600, 72)">
    <rect x="-190" y="-18" width="380" height="36" rx="18" fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" stroke-width="1.5" />
    <text x="0" y="6" text-anchor="middle" fill="#fde68a" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" letter-spacing="3">
      👑 REAL-TIME MULTIPLAYER CARD GAME
    </text>
  </g>

  <!-- Crown Icon Above Title -->
  <g transform="translate(600, 116)" filter="url(#textShadow)">
    <path d="M-42,28 L-32,6 L-10,18 L0,0 L10,18 L32,6 L42,28 Z" fill="url(#goldBorder)" />
    <!-- Crown Jewels -->
    <circle cx="-32" cy="5" r="4" fill="#fef08a" />
    <circle cx="0" cy="-1" r="5" fill="#fef08a" />
    <circle cx="32" cy="5" r="4" fill="#fef08a" />
    <circle cx="0" cy="20" r="3.5" fill="#ef4444" />
    <circle cx="-18" cy="20" r="3" fill="#3b82f6" />
    <circle cx="18" cy="20" r="3" fill="#3b82f6" />
  </g>

  <!-- MAIN TITLE: JACKPOT -->
  <text x="600" y="224" text-anchor="middle" fill="url(#titleGold)" font-family="system-ui, -apple-system, sans-serif" font-size="94" font-weight="900" letter-spacing="8" filter="url(#textShadow)">
    JACKPOT
  </text>

  <!-- SUBTITLE -->
  <text x="600" y="268" text-anchor="middle" fill="#fef3c7" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="600" letter-spacing="1.5" opacity="0.95" filter="url(#textShadow)">
    Secret Signals • Rapid Card Passing • Bluff &amp; Suspect
  </text>

  <!-- FAN OF 5 JACKPOT CARDS (Showcasing all 5 shapes) -->
  <g transform="translate(600, 420)">
    <!-- Card 1: STAR (Far Left, rotated -18 deg) -->
    <g transform="translate(-240, 20) rotate(-18)" filter="url(#cardShadow)">
      <rect x="-60" y="-86" width="120" height="172" rx="14" fill="url(#cardStar)" stroke="#ef4444" stroke-width="2.5" />
      <rect x="-53" y="-79" width="106" height="158" rx="10" fill="none" stroke="rgba(239, 68, 68, 0.4)" stroke-width="1" />
      <text x="-40" y="-55" fill="#f87171" font-family="system-ui, sans-serif" font-size="20" font-weight="900">8</text>
      <!-- Star Suit Symbol -->
      <polygon points="0,-24 7,-8 24,-8 11,3 16,19 0,9 -16,19 -11,3 -24,-8 -7,-8" fill="#ef4444" filter="url(#glowGold)" />
      <text x="0" y="44" text-anchor="middle" fill="#fca5a5" font-family="system-ui, sans-serif" font-size="12" font-weight="800" letter-spacing="1">STAR</text>
      <text x="40" y="68" fill="#f87171" font-family="system-ui, sans-serif" font-size="20" font-weight="900">8</text>
    </g>

    <!-- Card 2: CIRCLE (Mid Left, rotated -9 deg) -->
    <g transform="translate(-120, 0) rotate(-9)" filter="url(#cardShadow)">
      <rect x="-60" y="-86" width="120" height="172" rx="14" fill="url(#cardCircle)" stroke="#f59e0b" stroke-width="2.5" />
      <rect x="-53" y="-79" width="106" height="158" rx="10" fill="none" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1" />
      <text x="-40" y="-55" fill="#fbbf24" font-family="system-ui, sans-serif" font-size="20" font-weight="900">4</text>
      <!-- Circle Suit Symbol -->
      <circle cx="0" cy="-2" r="20" fill="none" stroke="#f59e0b" stroke-width="9" filter="url(#glowGold)" />
      <text x="0" y="44" text-anchor="middle" fill="#fde68a" font-family="system-ui, sans-serif" font-size="12" font-weight="800" letter-spacing="1">CIRCLE</text>
      <text x="40" y="68" fill="#fbbf24" font-family="system-ui, sans-serif" font-size="20" font-weight="900">4</text>
    </g>

    <!-- Card 3: TRIANGLE (Center, elevated, 0 deg) -->
    <g transform="translate(0, -18)" filter="url(#cardShadow)">
      <rect x="-64" y="-92" width="128" height="184" rx="15" fill="url(#cardTriangle)" stroke="#10b981" stroke-width="3" />
      <rect x="-56" y="-84" width="112" height="168" rx="11" fill="none" stroke="rgba(16, 185, 129, 0.4)" stroke-width="1" />
      <text x="-42" y="-60" fill="#34d399" font-family="system-ui, sans-serif" font-size="22" font-weight="900">7</text>
      <!-- Triangle Suit Symbol -->
      <polygon points="0,-24 24,18 -24,18" fill="none" stroke="#10b981" stroke-width="8" stroke-linejoin="round" filter="url(#glowGold)" />
      <text x="0" y="48" text-anchor="middle" fill="#6ee7b7" font-family="system-ui, sans-serif" font-size="12" font-weight="800" letter-spacing="1">TRIANGLE</text>
      <text x="42" y="72" fill="#34d399" font-family="system-ui, sans-serif" font-size="22" font-weight="900">7</text>
    </g>

    <!-- Card 4: CROSS (Mid Right, rotated 9 deg) -->
    <g transform="translate(120, 0) rotate(9)" filter="url(#cardShadow)">
      <rect x="-60" y="-86" width="120" height="172" rx="14" fill="url(#cardCross)" stroke="#3b82f6" stroke-width="2.5" />
      <rect x="-53" y="-79" width="106" height="158" rx="10" fill="none" stroke="rgba(59, 130, 246, 0.4)" stroke-width="1" />
      <text x="-40" y="-55" fill="#60a5fa" font-family="system-ui, sans-serif" font-size="20" font-weight="900">1</text>
      <!-- Cross Suit Symbol -->
      <path d="M-8,-22 L8,-22 L8,-8 L22,-8 L22,8 L8,8 L8,22 L-8,22 L-8,8 L-22,8 L-22,-8 L-8,-8 Z" fill="#3b82f6" filter="url(#glowGold)" />
      <text x="0" y="44" text-anchor="middle" fill="#93c5fd" font-family="system-ui, sans-serif" font-size="12" font-weight="800" letter-spacing="1">CROSS</text>
      <text x="40" y="68" fill="#60a5fa" font-family="system-ui, sans-serif" font-size="20" font-weight="900">1</text>
    </g>

    <!-- Card 5: SQUARE (Far Right, rotated 18 deg) -->
    <g transform="translate(240, 20) rotate(18)" filter="url(#cardShadow)">
      <rect x="-60" y="-86" width="120" height="172" rx="14" fill="url(#cardSquare)" stroke="#a855f7" stroke-width="2.5" />
      <rect x="-53" y="-79" width="106" height="158" rx="10" fill="none" stroke="rgba(168, 85, 247, 0.4)" stroke-width="1" />
      <text x="-40" y="-55" fill="#c084fc" font-family="system-ui, sans-serif" font-size="20" font-weight="900">5</text>
      <!-- Square Suit Symbol -->
      <rect x="-18" y="-18" width="36" height="36" rx="4" fill="none" stroke="#a855f7" stroke-width="8" filter="url(#glowGold)" />
      <text x="0" y="44" text-anchor="middle" fill="#d8b4fe" font-family="system-ui, sans-serif" font-size="12" font-weight="800" letter-spacing="1">SQUARE</text>
      <text x="40" y="68" fill="#c084fc" font-family="system-ui, sans-serif" font-size="20" font-weight="900">5</text>
    </g>
  </g>

  <!-- BOTTOM BAR: Highlights & URL -->
  <g transform="translate(600, 565)">
    <!-- Feature Chips -->
    <g transform="translate(-250, 0)">
      <rect x="-85" y="-16" width="170" height="32" rx="16" fill="rgba(26, 12, 5, 0.9)" stroke="rgba(245, 158, 11, 0.5)" stroke-width="1.5" />
      <text x="0" y="6" text-anchor="middle" fill="#fde68a" font-family="system-ui, sans-serif" font-size="13" font-weight="800">
        🤫 SECRET SIGNALS
      </text>
    </g>

    <g transform="translate(0, 0)">
      <rect x="-85" y="-16" width="170" height="32" rx="16" fill="rgba(26, 12, 5, 0.9)" stroke="rgba(245, 158, 11, 0.5)" stroke-width="1.5" />
      <text x="0" y="6" text-anchor="middle" fill="#fde68a" font-family="system-ui, sans-serif" font-size="13" font-weight="800">
        👥 4–8 PLAYERS
      </text>
    </g>

    <g transform="translate(250, 0)">
      <rect x="-85" y="-16" width="170" height="32" rx="16" fill="rgba(26, 12, 5, 0.9)" stroke="rgba(245, 158, 11, 0.5)" stroke-width="1.5" />
      <text x="0" y="6" text-anchor="middle" fill="#fde68a" font-family="system-ui, sans-serif" font-size="13" font-weight="800">
        ⚡ INSTANT PLAY
      </text>
    </g>
  </g>
</svg>
`;

async function generateSocialImages() {
  console.log('Rendering 1200x630 Social Media Share Image...');
  const svgBuffer = Buffer.from(ogSvg);

  // Render 1200x630 PNG
  await sharp(svgBuffer)
    .resize(1200, 630)
    .png({ quality: 95, compressionLevel: 8 })
    .toFile('public/og-image.png');

  console.log('Saved public/og-image.png');

  // Also save public/twitter-image.png (same optimal dimensions)
  await sharp(svgBuffer)
    .resize(1200, 630)
    .png({ quality: 95, compressionLevel: 8 })
    .toFile('public/twitter-image.png');

  console.log('Saved public/twitter-image.png');

  // Also save a 600x600 square version for WhatsApp/Messenger thumbnail square previews
  // (WhatsApp often crops or uses a square thumbnail in small chat bubbles)
  const squareSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <radialGradient id="bgGlowSq" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#3d1b09" />
      <stop offset="45%" stop-color="#210d04" />
      <stop offset="100%" stop-color="#0a0301" />
    </radialGradient>
    <linearGradient id="goldBorderSq" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="35%" stop-color="#f59e0b" />
      <stop offset="70%" stop-color="#b45309" />
      <stop offset="100%" stop-color="#78350f" />
    </linearGradient>
    <linearGradient id="titleGoldSq" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="25%" stop-color="#fef08a" />
      <stop offset="65%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#92400e" />
    </linearGradient>
    <filter id="textShadowSq" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.9" />
    </filter>
  </defs>

  <rect width="600" height="600" fill="url(#bgGlowSq)" />
  <rect x="18" y="18" width="564" height="564" rx="28" fill="none" stroke="url(#goldBorderSq)" stroke-width="5" />
  <rect x="28" y="28" width="544" height="544" rx="20" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="8 6" opacity="0.4" />

  <!-- Crown -->
  <g transform="translate(300, 110)" filter="url(#textShadowSq)">
    <path d="M-52,36 L-40,8 L-12,24 L0,0 L12,24 L40,8 L52,36 Z" fill="url(#goldBorderSq)" />
    <circle cx="-40" cy="7" r="5" fill="#fef08a" />
    <circle cx="0" cy="-1" r="6" fill="#fef08a" />
    <circle cx="40" cy="7" r="5" fill="#fef08a" />
    <circle cx="0" cy="26" r="4.5" fill="#ef4444" />
    <circle cx="-24" cy="26" r="4" fill="#3b82f6" />
    <circle cx="24" cy="26" r="4" fill="#3b82f6" />
  </g>

  <!-- Title -->
  <text x="300" y="235" text-anchor="middle" fill="url(#titleGoldSq)" font-family="system-ui, sans-serif" font-size="82" font-weight="900" letter-spacing="6" filter="url(#textShadowSq)">
    JACKPOT
  </text>

  <!-- Subtitle -->
  <text x="300" y="285" text-anchor="middle" fill="#fef3c7" font-family="system-ui, sans-serif" font-size="20" font-weight="700" letter-spacing="2">
    SECRET SIGNAL PARTY GAME
  </text>

  <!-- 5 Shape Badges in a Row -->
  <g transform="translate(300, 375)">
    <!-- Star -->
    <g transform="translate(-160, 0)">
      <rect x="-30" y="-30" width="60" height="60" rx="14" fill="#3b110e" stroke="#ef4444" stroke-width="2" />
      <polygon points="0,-16 5,-5 16,-5 7,2 11,13 0,6 -11,13 -7,2 -16,-5 -5,-5" fill="#ef4444" />
    </g>
    <!-- Circle -->
    <g transform="translate(-80, 0)">
      <rect x="-30" y="-30" width="60" height="60" rx="14" fill="#3a220a" stroke="#f59e0b" stroke-width="2" />
      <circle cx="0" cy="0" r="14" fill="none" stroke="#f59e0b" stroke-width="6" />
    </g>
    <!-- Triangle -->
    <g transform="translate(0, 0)">
      <rect x="-30" y="-30" width="60" height="60" rx="14" fill="#0d331e" stroke="#10b981" stroke-width="2" />
      <polygon points="0,-16 16,14 -16,14" fill="none" stroke="#10b981" stroke-width="5" stroke-linejoin="round" />
    </g>
    <!-- Cross -->
    <g transform="translate(80, 0)">
      <rect x="-30" y="-30" width="60" height="60" rx="14" fill="#0f2b46" stroke="#3b82f6" stroke-width="2" />
      <path d="M-5,-16 L5,-16 L5,-5 L16,-5 L16,5 L5,5 L5,16 L-5,16 L-5,5 L-16,5 L-16,-5 L-5,-5 Z" fill="#3b82f6" />
    </g>
    <!-- Square -->
    <g transform="translate(160, 0)">
      <rect x="-30" y="-30" width="60" height="60" rx="14" fill="#2a123d" stroke="#a855f7" stroke-width="2" />
      <rect x="-12" y="-12" width="24" height="24" rx="3" fill="none" stroke="#a855f7" stroke-width="6" />
    </g>
  </g>

  <!-- Bottom CTA Tag -->
  <g transform="translate(300, 485)">
    <rect x="-170" y="-22" width="340" height="44" rx="22" fill="#241006" stroke="url(#goldBorderSq)" stroke-width="2" />
    <text x="0" y="6" text-anchor="middle" fill="#fde68a" font-family="system-ui, sans-serif" font-size="16" font-weight="900" letter-spacing="2">
      PLAY ONLINE WITH FRIENDS
    </text>
  </g>
</svg>
`;

  await sharp(Buffer.from(squareSvg))
    .resize(600, 600)
    .png({ quality: 95 })
    .toFile('public/og-image-square.png');

  console.log('Saved public/og-image-square.png');
}

generateSocialImages().catch(err => {
  console.error('Failed generating images:', err);
  process.exit(1);
});
