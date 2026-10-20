// Texto rico mínimo: só negrito, itálico e quebras de linha.
// O estado guarda HTML limpo (<b>, <i>, <br>); o PDF recebe "runs" do pdfmake.

const BLOCK = new Set(['DIV', 'P', 'LI']);

function isBold(el) {
  if (el.tagName === 'B' || el.tagName === 'STRONG') return true;
  const w = el.style && el.style.fontWeight;
  return w === 'bold' || Number(w) >= 600;
}
function isItalic(el) {
  return el.tagName === 'I' || el.tagName === 'EM' || (el.style && el.style.fontStyle === 'italic');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Percorre o DOM e devolve runs {text, bold, italics}.
function walk(node, fmt, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.nodeValue) out.push({ text: child.nodeValue.replace(/ /g, ' '), ...fmt });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      if (child.tagName === 'BR') { out.push({ text: '\n', ...fmt }); continue; }
      if (BLOCK.has(child.tagName) && out.length && !out[out.length - 1].text.endsWith('\n')) out.push({ text: '\n', ...fmt });
      walk(child, { bold: fmt.bold || isBold(child), italics: fmt.italics || isItalic(child) }, out);
    }
  }
  return out;
}

function parse(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  return tpl.content;
}

export function runsFromElement(el) {
  return merge(walk(el, { bold: false, italics: false }, []));
}

export function toRuns(html) {
  return merge(walk(parse(html), { bold: false, italics: false }, []));
}

function merge(runs) {
  const out = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.bold === r.bold && last.italics === r.italics) last.text += r.text;
    else out.push({ ...r });
  }
  // remove quebra final deixada pelo contenteditable
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\n+$/, '');
  return out.filter(r => r.text);
}

export function runsToHtml(runs) {
  return runs.map(r => {
    let s = escapeHtml(r.text).replace(/\n/g, '<br>');
    if (r.italics) s = `<i>${s}</i>`;
    if (r.bold) s = `<b>${s}</b>`;
    return s;
  }).join('');
}

// HTML limpo a partir do que está num elemento editável.
export function cleanHtml(el) {
  return runsToHtml(runsFromElement(el));
}

export function plainText(html) {
  return toRuns(html).map(r => r.text).join('').trim();
}

export function isEmpty(html) {
  return plainText(html) === '';
}
