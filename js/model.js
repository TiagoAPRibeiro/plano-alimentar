// Regras partilhadas entre o editor e o PDF, para que ambos mostrem o mesmo.
import { isEmpty } from './richtext.js';

// Duas secções "metade" seguidas ficam lado a lado; uma metade isolada ocupa a largura toda.
export function pairSections(sections) {
  const rows = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const next = sections[i + 1];
    if (s.width === 'half' && next && next.width === 'half') {
      rows.push([s, next]);
      i++;
    } else rows.push([s]);
  }
  return rows;
}

export function sectionHasContent(s) {
  if (s.type === 'photos') return s.photos.length > 0;
  return !isEmpty(s.intro) || s.items.some(t => !isEmpty(t));
}

export function mealHasContent(m) {
  return !isEmpty(m.title) || !isEmpty(m.time) || m.items.some(it => !isEmpty(it.text));
}

// Refeição com uma só linha (ex.: "1 copo de água") é mostrada sem marcador.
export function isSingleLine(m) {
  const items = m.items.filter(it => !isEmpty(it.text));
  return items.length === 1 && items[0].kind === 'item';
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---------- Texto colado → refeições ----------
// Exemplo de texto aceite (tal como sai do software da empresa):
//   6h30 Em jejum:
//   - 1 copo de água
//   12h30 - 13h00 Almoço:
//   PRATO DE SOBREMESA:
//   1• MEIO PRATO Salada ou Legumes …
//   Sobremesa: 1 gelatina sem açúcar
//   Ceia:

const TIME = String.raw`\d{1,2}\s*[h:]\s*\d{2}`;
const HEADING_TIME = new RegExp(String.raw`^(${TIME}(?:\s*(?:-|–|—|a|às)\s*${TIME})?)\s*[-–:.]?\s*(.*?)\s*:?\s*$`, 'i');
const MEAL_NAMES = /^(em jejum|jejum|pequeno[\s-]*almo[çc]o|meio da manh[ãa]|a meio da manh[ãa]|almo[çc]o|lanche|lanche da manh[ãa]|lanche da tarde|meio da tarde|merenda|jantar|ceia|pr[ée][\s-]*treino|p[óo]s[\s-]*treino)\b[^:]{0,20}:?$/i;
const BULLET = /^(?:[-–—•·*▪◦●]|\d{1,2}\s*[•.)](?!\d))\s*/;
const LABEL = /^([^:]{2,24}):\s+(.+)$/;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// **texto** fica a negrito
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

function normTime(t) {
  return t.split(/\s*(?:-|–|—|a|às)\s*(?=\d)/i)
    .map(p => p.replace(/\s/g, '').replace(':', 'h').replace(/^(\d)h/, '0$1h'))
    .join(' – ');
}

export function parseMeals(text) {
  const meals = [];
  let cur = null;
  let n = -1;
  const start = (time, title) => { cur = { time, title, items: [], line: n }; meals.push(cur); };

  for (const raw of (text || '').replace(/\r/g, '').split('\n')) {
    n++;
    const line = raw.replace(/\t/g, ' ').replace(/ /g, ' ').trim();
    if (!line) continue;

    const t = line.match(HEADING_TIME);
    if (t && !BULLET.test(line)) { start(normTime(t[1]), inline(t[2].replace(/:$/, ''))); continue; }
    if (MEAL_NAMES.test(line)) { start('', inline(line.replace(/:$/, ''))); continue; }

    if (!cur) start('', '');
    const body = line.replace(BULLET, '');
    if (!BULLET.test(line) && line.endsWith(':') && line.length <= 40) {
      cur.items.push({ kind: 'sub', text: inline(line.slice(0, -1)) });
      continue;
    }
    const label = body.match(LABEL);
    cur.items.push({ kind: 'item', text: label ? `<b>${inline(label[1])}:</b> ${inline(label[2])}` : inline(body) });
  }
  return meals;
}
