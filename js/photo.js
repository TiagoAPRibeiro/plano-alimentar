// Preparação das fotos para o PDF: reduz, mantém a proporção (entre quadrada e 4:3)
// e integra na página.
import { COLORS } from './config.js';

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// Fundo branco (ex.: pratos fotografados em estúdio) passa a ter a cor da página:
// multiplicar pela cor creme torna o branco igual à folha e mantém as sombras naturais.
function blendWhiteBackground(ctx, W, H) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  let near = 0, n = 0;
  const step = Math.max(1, Math.floor(W / 200));
  for (let x = 0; x < W; x += step) for (const y of [0, H - 1]) {
    const i = (y * W + x) * 4;
    if (Math.min(d[i], d[i + 1], d[i + 2]) >= 240) near++;
    n++;
  }
  for (let y = 0; y < H; y += step) for (const x of [0, W - 1]) {
    const i = (y * W + x) * 4;
    if (Math.min(d[i], d[i + 1], d[i + 2]) >= 240) near++;
    n++;
  }
  if (near / n < 0.9) return false;

  const page = hex(COLORS.page);
  const WHITE = 248; // pequenas variações do fundo (249–255) ficam branco puro
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, (d[i + c] * 255) / WHITE) * page[c] / 255;
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

export async function prepPhoto(blob, maxW = 1200) {
  const bmp = await createImageBitmap(blob);
  const ratio = Math.min(4 / 3, Math.max(1, bmp.width / bmp.height));
  const W = Math.min(maxW, bmp.width), H = Math.round(W / ratio);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, W, H);
  const s = Math.max(W / bmp.width, H / bmp.height);
  ctx.drawImage(bmp, (W - bmp.width * s) / 2, (H - bmp.height * s) / 2, bmp.width * s, bmp.height * s);

  const blended = blendWhiteBackground(ctx, W, H);
  if (!blended) {
    // foto normal: cantos arredondados com a cor da página
    const r = Math.round(W * 0.028);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, r);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = COLORS.page;
    ctx.fillRect(0, 0, W, H);
  }
  if (!blended) return c.toDataURL('image/jpeg', 0.86);

  // PNG mantém o fundo exatamente da cor da página (o JPEG desvia 1–2 tons e via-se um retângulo).
  // Reduz para 640 px: o PNG pesa mais e estas fotos aparecem pequenas no PDF.
  const PNG_W = 640;
  if (W <= PNG_W) return c.toDataURL('image/png');
  const small = document.createElement('canvas');
  small.width = PNG_W;
  small.height = Math.round(PNG_W * H / W);
  const sctx = small.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(c, 0, 0, small.width, small.height);
  return small.toDataURL('image/png');
}
