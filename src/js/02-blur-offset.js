// ══════════════════════════════════════════════════════
// BLUR-BASED CONTOUR EXPANSION (Ink Spreading Simulation)
// ══════════════════════════════════════════════════════
// Rasterize glyph → apply Gaussian blur → adjust contrast → extract new margins.
// This simulates ink spreading / thicker stroke without geometric path operations.

const _BLUR_RASTER_SCALE = 4;  // 4x resolution for rasterization
const _BLUR_KERNEL_SIGMA = 1.5; // Gaussian sigma for blur

// Simple Gaussian blur using separable convolution (faster than full 2D).
// Approximation: 3x passes with simple kernel.
function _gaussianBlur(data, width, height, sigma) {
  const kernel = [0.27901, 0.44198, 0.27901]; // 3-tap approximation of Gaussian

  // Horizontal pass
  const tmp = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let sum = 0;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = Math.max(0, Math.min(width - 1, x + dx));
        sum += data[(y * width + nx) * 4] * kernel[dx + 1];
      }
      tmp[idx] = tmp[idx + 1] = tmp[idx + 2] = Math.round(sum);
      tmp[idx + 3] = 255;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = Math.max(0, Math.min(height - 1, y + dy));
        sum += tmp[(ny * width + x) * 4] * kernel[dy + 1];
      }
      data[idx] = data[idx + 1] = data[idx + 2] = Math.round(sum);
      data[idx + 3] = 255;
    }
  }
}

// Adjust contrast: amplify values away from mid-point (128).
// contrast: 0–2, where 1 = no change, 2 = doubled contrast.
function _adjustContrast(data, contrast) {
  const mid = 128;
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i]; // grayscale, R=G=B
    const adjusted = Math.round(mid + (val - mid) * contrast);
    data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, adjusted));
    data[i + 3] = 255;
  }
}

// Rasterize a glyph at high resolution, apply blur+contrast, extract new margins.
// Returns { left, right, leftGeom, rightGeom, advanceWidth } similar to computeGlyphMargins output.
// Returns null if rasterization fails.
function expandGlyphViaBlur(glyph, glyphPath, upm, blurFU, contrastFactor, zones) {
  if (!glyph || !glyph.advanceWidth || !glyphPath) return null;
  if (blurFU === 0) return null; // no expansion

  zones = zones || 12; // default to 12 zones if not specified

  const scale = _BLUR_RASTER_SCALE; // upscale for rasterization
  const advWidth = (glyph.advanceWidth || 0) * scale;
  const ascender = (800 * scale) / upm; // approximate ascender
  const descender = (200 * scale) / upm;
  const W = Math.ceil(advWidth) + 40; // buffer
  const H = Math.ceil(ascender + descender) + 40;

  // Create off-screen canvas and render glyph
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  // Clear to black (background)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Draw glyph in white
  ctx.fillStyle = '#fff';
  ctx.translate(20, ascender);
  const path = glyphPath.toPathData(2);
  ctx.fill(new Path2D(path));

  // Extract image data
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;

  // Apply blur
  _gaussianBlur(data, W, H, _BLUR_KERNEL_SIGMA);

  // Adjust contrast to sharpen the blurred edge
  _adjustContrast(data, contrastFactor || 1.5);

  // Put modified data back
  ctx.putImageData(imgData, 0, 0);

  // Scan for margin boundaries: find leftmost and rightmost white pixels at each row.
  // Threshold: pixels > 127 are considered "ink".
  const THRESHOLD = 127;
  const zoneH = H / zones;
  const left = [];
  const right = [];
  const leftGeom = [];
  const rightGeom = [];

  const pixels = data;

  for (let z = 0; z < zones; z++) {
    const yStart = Math.round(z * zoneH);
    const yEnd = Math.round((z + 1) * zoneH);
    let minX = null, maxX = null;

    for (let y = yStart; y < yEnd; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const val = pixels[idx]; // grayscale
        if (val > THRESHOLD) {
          if (minX === null) minX = x;
          maxX = x;
        }
      }
    }

    // Convert from raster pixels back to font units
    const leftPx = minX !== null ? minX - 20 : null; // offset by canvas buffer
    const rightPx = maxX !== null ? W - (maxX + 1) - 20 : null;
    const leftFU = leftPx !== null ? Math.max(0, leftPx / scale) : null;
    const rightFU = rightPx !== null ? Math.max(0, rightPx / scale) : null;

    left.push(leftFU);
    right.push(rightFU);
    leftGeom.push(leftFU);
    rightGeom.push(rightFU);
  }

  return {
    left, right, leftGeom, rightGeom,
    charLabel: glyph.name || '?',
    advanceWidth: glyph.advanceWidth || 0
  };
}

if (typeof module !== 'undefined') module.exports = { expandGlyphViaBlur };
