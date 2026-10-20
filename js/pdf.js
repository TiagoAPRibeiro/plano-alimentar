// Gera o PDF (pdfmake) a partir do estado da folha.
import { NUTRITIONIST, COLORS } from './config.js';
import { toRuns, isEmpty } from './richtext.js';
import { iconSvg } from './icons.js';
import { pairSections, sectionHasContent, formatDate, mealHasContent, isSingleLine, parseMeals } from './model.js';

const PAGE_W = 595.28;
const MARGIN_X = 46;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const GAP = 10;
const CARD_PAD = 12;
const MEAL_COL = 104;

const FONTS = {
  Lato: { normal: 'Lato-Regular.ttf', bold: 'Lato-Bold.ttf', italics: 'Lato-Italic.ttf', bolditalics: 'Lato-BoldItalic.ttf' },
  Cormorant: { normal: 'Cormorant-Medium.ttf', bold: 'Cormorant-SemiBold.ttf', italics: 'Cormorant-MediumItalic.ttf', bolditalics: 'Cormorant-MediumItalic.ttf' },
};

let assets;

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function loadAssets() {
  if (assets) return assets;
  const files = [...new Set(Object.values(FONTS).flatMap(Object.values))];
  const vfs = {};
  await Promise.all(files.map(async f => {
    const res = await fetch(`fonts/${f}`);
    vfs[f] = toBase64(await res.arrayBuffer());
  }));
  const logo = 'data:image/png;base64,' + toBase64(await (await fetch('img/logo.png')).arrayBuffer());
  assets = { vfs, logo };
  return assets;
}

const C = COLORS;
const rich = (html, extra = {}) => ({ text: toRuns(html), ...extra });
const upper = html => toRuns(html).map(r => ({ ...r, text: r.text.toUpperCase() }));

// ---------- Cabeçalho ----------

function header(h) {
  const right = [
    { text: h.title || 'Plano Alimentar', font: 'Cormorant', bold: true, fontSize: 30, color: C.ink, alignment: 'right', lineHeight: 0.9 },
  ];
  if (!isEmpty(h.client)) right.push(rich(h.client, { fontSize: 13, color: C.ink, alignment: 'right', margin: [0, 6, 0, 0] }));
  if (h.date) right.push({ text: formatDate(h.date), fontSize: 9, color: C.muted, alignment: 'right', margin: [0, 3, 0, 0] });
  if (h.nextVisit) right.push({
    text: [{ text: 'Próxima consulta  ', color: C.muted }, { text: formatDate(h.nextVisit), color: C.coral, bold: true }],
    fontSize: 9, alignment: 'right', margin: [0, 2, 0, 0],
  });

  const out = [
    { columns: [{ image: 'logo', width: 138 }, { width: '*', stack: right, margin: [0, 12, 0, 0] }] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.8, lineColor: C.line }], margin: [0, 12, 0, 14] },
  ];

  if (!isEmpty(h.objective)) {
    out.push({
      table: {
        widths: ['*'],
        body: [[{
          fillColor: C.tones.sage.bg,
          alignment: 'center',
          stack: [
            { text: 'OBJETIVO DA CONSULTA', fontSize: 6.5, bold: true, characterSpacing: 2, color: C.sage },
            rich(h.objective, { font: 'Cormorant', bold: true, fontSize: 18, color: C.ink, margin: [0, 2, 0, 0] }),
          ],
        }]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 9, paddingBottom: () => 8, paddingLeft: () => 12, paddingRight: () => 12 },
      margin: [0, 0, 0, 16],
    });
  }
  return out;
}

// ---------- Refeições ----------

function mealItems(meal) {
  const items = meal.items.filter(it => !isEmpty(it.text));
  if (isSingleLine(meal)) return [rich(items[0].text, { fontSize: 9.5, lineHeight: 1.22 })];

  const out = [];
  let list = null;
  for (const it of items) {
    if (it.kind === 'sub') {
      list = null;
      out.push({ text: upper(it.text), fontSize: 7.5, bold: true, color: C.muted, characterSpacing: 1, margin: [0, out.length ? 4 : 1, 0, 1.5] });
    } else {
      if (!list) {
        list = { ul: [], markerColor: C.tones.peach.accent, fontSize: 9.5, lineHeight: 1.22 };
        out.push(list);
      }
      list.ul.push({ text: toRuns(it.text), margin: [0, 0, 0, 1.5] });
    }
  }
  return out;
}

function meals(list) {
  const rows = list.filter(mealHasContent).map(m => [
    {
      alignment: 'right',
      stack: [
        isEmpty(m.time) ? null : { text: m.time, color: C.coral, bold: true, fontSize: 9.5 },
        { text: upper(m.title), bold: true, fontSize: 7.5, characterSpacing: 1.2, color: C.sage, margin: [0, 1.5, 0, 0] },
      ].filter(Boolean),
    },
    {
      stack: [
        // marcador da linha do tempo
        { canvas: [{ type: 'ellipse', x: 0, y: 0, r1: 3, r2: 3, color: C.page, lineColor: C.tones.sage.accent, lineWidth: 1.2 }], relativePosition: { x: -14.6, y: 5.5 } },
        ...mealItems(m),
      ],
    },
  ]);
  if (!rows.length) return [];
  return [{
    table: { widths: [MEAL_COL, '*'], dontBreakRows: true, body: rows },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: i => (i === 1 ? 1 : 0),
      vLineColor: () => C.line,
      paddingLeft: i => (i === 1 ? 14 : 0),
      paddingRight: i => (i === 0 ? 12 : 0),
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
  }];
}

// ---------- Secções ----------

function listNode(s, width) {
  const items = s.items.filter(t => !isEmpty(t));
  if (!items.length) return null;
  const cols = Math.max(1, Math.min(s.columns || 1, items.length));
  const accent = C.tones[s.tone].accent;
  const one = chunk => {
    if (s.list === 'number') return { ol: chunk.map(t => ({ text: toRuns(t), margin: [0, 0, 0, 3] })), markerColor: accent, fontSize: 9.5, lineHeight: 1.22 };
    if (s.list === 'none') return { stack: chunk.map(t => ({ text: toRuns(t), margin: [0, 0, 0, 4] })), fontSize: 9.5, lineHeight: 1.22 };
    return { ul: chunk.map(t => ({ text: toRuns(t), margin: [0, 0, 0, 2] })), markerColor: accent, fontSize: 9.5, lineHeight: 1.22 };
  };
  if (cols === 1) return one(items);
  const per = Math.ceil(items.length / cols);
  const chunks = [];
  for (let i = 0; i < items.length; i += per) chunks.push(items.slice(i, i + per));
  // numeração contínua entre colunas
  const columns = chunks.map((c, i) => {
    const n = one(c);
    if (n.ol) n.start = i * per + 1;
    return n;
  });
  return { columns, columnGap: 14, width };
}

function titleRow(s) {
  const accent = C.tones[s.tone].accent;
  return {
    columns: [
      { svg: iconSvg(s.icon, accent), width: 15, height: 15 },
      { text: s.title, font: 'Cormorant', bold: true, fontSize: 15.5, color: C.ink, margin: [7, -1.5, 0, 0] },
    ],
    margin: [0, 0, 0, 6],
  };
}

// Fotos padrão vêm de ficheiro (img/…); o pdfmake precisa delas em dataURL.
const photoCache = {};
async function resolvePhotos(state) {
  const srcs = state.sections.filter(s => s.type === 'photos').flatMap(s => s.photos).filter(p => !p.startsWith('data:'));
  await Promise.all(srcs.filter(p => !photoCache[p]).map(async p => {
    const blob = await (await fetch(p)).blob();
    photoCache[p] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  }));
}
const photoSrc = p => (p.startsWith('data:') ? p : photoCache[p]);

function photosNode(s, innerW) {
  const photos = s.photos.slice(0, 2);
  const gap = 10;
  let row;
  if (photos.length === 1) {
    // altura máxima para não empurrar as secções seguintes para outra página
    const box = innerW > 300 ? [300, 225] : [innerW, 125];
    row = { image: photoSrc(photos[0]), fit: box, alignment: 'center' };
  } else {
    const w = (innerW - gap) / 2;
    row = { columns: photos.map(p => ({ image: photoSrc(p), width: w })), columnGap: gap };
  }
  const out = [row];
  if (!isEmpty(s.caption)) out.push(rich(s.caption, { italics: true, fontSize: 8.5, color: C.muted, alignment: 'center', margin: [0, 6, 0, 0] }));
  return out;
}

function sectionCell(s, cellW) {
  const tone = C.tones[s.tone] || C.tones.none;
  const innerW = cellW - CARD_PAD * 2;
  const stack = [titleRow(s)];
  if (s.type === 'photos') stack.push(...photosNode(s, innerW));
  else {
    if (!isEmpty(s.intro)) stack.push(rich(s.intro, { fontSize: 9.5, lineHeight: 1.25, margin: [0, 0, 0, 5] }));
    const list = listNode(s, innerW);
    if (list) stack.push(list);
  }
  return { stack, fillColor: tone.bg || undefined };
}

function sectionRow(row) {
  const pair = row.length === 2;
  const cellW = pair ? (CONTENT_W - GAP) / 2 : CONTENT_W;
  const cells = row.map(s => sectionCell(s, cellW));
  const accents = row.map(s => (s.tone !== 'none' ? C.tones[s.tone].accent : null));
  const widths = pair ? ['*', GAP, '*'] : ['*'];
  const body = pair ? [[cells[0], { text: '' }, cells[1]]] : [cells];
  return {
    table: { widths, dontBreakRows: true, body },
    layout: {
      hLineWidth: () => 0,
      // barra de cor à esquerda de cada cartão
      vLineWidth: i => ((i === 0 && accents[0]) || (pair && i === 2 && accents[1]) ? 2.5 : 0),
      vLineColor: i => (i === 0 ? accents[0] : accents[1]),
      paddingLeft: i => (pair && i === 1 ? 0 : CARD_PAD),
      paddingRight: i => (pair && i === 1 ? 0 : CARD_PAD),
      paddingTop: () => 10,
      paddingBottom: () => 10,
    },
    margin: [0, 0, 0, GAP],
  };
}

// ---------- Documento ----------

export function docDefinition(state) {
  const h = state.header;
  const visible = state.sections.filter(sectionHasContent);
  const content = [...header(h), ...meals(parseMeals(state.mealsText))];

  if (visible.length) {
    const rows = pairSections(visible).map(sectionRow);
    if (state.sectionsOnNewPage && content.length) rows[0].pageBreak = 'before';
    else rows[0].margin = [0, 18, 0, GAP];
    content.push(...rows);
  }

  const client = toRuns(h.client).map(r => r.text).join('').trim();

  return {
    pageSize: 'A4',
    pageMargins: [MARGIN_X, 58, MARGIN_X, 62],
    info: { title: `Plano alimentar${client ? ' – ' + client : ''}`, author: NUTRITIONIST.name, subject: toRuns(h.objective).map(r => r.text).join('') },
    defaultStyle: { font: 'Lato', fontSize: 9.5, color: C.ink },
    images: { logo: assets.logo },
    background: () => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W, h: 841.89, color: C.page }] }),
    header: page => (page === 1 ? null : {
      margin: [MARGIN_X, 16, MARGIN_X, 0],
      columns: [
        { image: 'logo', width: 62 },
        { text: `Plano alimentar${client ? '  ·  ' + client : ''}`, alignment: 'right', fontSize: 8, color: C.muted, margin: [0, 13, 0, 0] },
      ],
    }),
    footer: (page, count) => ({
      margin: [MARGIN_X, 18, MARGIN_X, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.8, lineColor: C.tones.sage.accent }] },
        {
          margin: [0, 7, 0, 0],
          columns: [
            { text: [{ text: NUTRITIONIST.name, bold: true, color: C.ink }, `  ·  ${NUTRITIONIST.title}  ·  Cédula profissional n.º ${NUTRITIONIST.license}`], fontSize: 8, color: C.muted, width: '*' },
            { text: `Tel. ${NUTRITIONIST.phone}${count > 1 ? `      ${page} / ${count}` : ''}`, fontSize: 8, color: C.muted, alignment: 'right', width: 'auto' },
          ],
        },
      ],
    }),
    content,
  };
}

export async function createPdf(state) {
  const { vfs } = await loadAssets();
  await resolvePhotos(state);
  return pdfMake.createPdf(docDefinition(state), null, FONTS, vfs);
}

export async function pdfBlob(state) {
  const doc = await createPdf(state);
  return new Promise(resolve => doc.getBlob(resolve));
}

export function fileName(state) {
  const client = toRuns(state.header.client).map(r => r.text).join('').trim();
  const date = state.header.date || '';
  return ['Plano Alimentar', client, date].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]/g, '') + '.pdf';
}
