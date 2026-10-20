# OldForFuture: versão com refeições em campos individuais

Cópia de segurança da versão de 20/10/2026, em que **cada refeição era um bloco com campos próprios**
(hora, nome, linhas e subtítulos), com botões para mover, duplicar e apagar refeições e linhas.
Foi substituída por uma **caixa de texto livre**, porque a nutricionista copia o plano já escrito do
software da empresa e precisa de o colar de uma só vez.

Este ficheiro guarda o código completo dessa versão, para mais tarde voltar aos campos individuais
(por exemplo, com um botão "Colar plano" que reparte o texto pelos campos).

## O que existia e foi retirado

- **Modelo de dados:** `state.meals = [{ time, title, items: [{ kind: 'item' | 'sub', text }] }]`, com o texto em HTML limpo (`<b>`, `<i>`, `<br>`).
- **Editor (`renderMeal` em `js/app.js`):**
  - hora e nome editáveis na coluna esquerda da linha do tempo;
  - linhas editáveis: Enter divide a linha no cursor, Backspace no início junta à linha anterior, ⌥↑/↓ move a linha;
  - colar várias linhas cria uma linha por cada;
  - botões por linha (subtítulo/linha, ↑, ↓, ✕) e por refeição (↑, ↓, duplicar, apagar com "Anular");
  - menu "+ Adicionar refeição" com predefinições (`MEAL_PRESETS` em `js/config.js`).
- **PDF (`meals()` em `js/pdf.js`):** recebe o mesmo array `meals`. A nova versão continua a usá-lo:
  o texto colado é convertido nesse array por `parseMeals()` em `js/model.js`.

## Como migrar de volta

1. Repor `renderMeal`, `addMealMenu` e as funções auxiliares de `js/app.js` abaixo, e voltar a chamar `state.meals.map(renderMeal)` em `render()`.
2. Trocar `state.mealsText` por `state.meals` em `defaultPlan()` e repor `MEAL_PRESETS` (ver `js/config.js` abaixo).
3. Para manter a colagem do texto inteiro, chamar `parseMeals(texto)` (versão nova de `js/model.js`) e guardar o resultado em `state.meals`.
4. O CSS das refeições (`.meal`, `.meal-left`, `.items`, `.item-tools`, `.add-row`, `.menu`) está em `css/app.css` abaixo.


## `js/app.js`

```js
import { defaultPlan, section, MEAL_PRESETS, SECTION_PRESETS, NUTRITIONIST, COLORS } from './config.js';
import { cleanHtml, isEmpty } from './richtext.js';
import { iconSvg } from './icons.js';
import { pairSections, isSingleLine, sectionHasContent } from './model.js';
import { openExport } from './export.js';

let state = defaultPlan();
let dirty = false;
const sheetsEl = document.getElementById('sheets');

// ---------- utilitários DOM ----------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const touch = () => { dirty = true; };

function caretToEnd(el, atStart = false) {
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(atStart);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

function focusKey(key, atStart = false) {
  const el = sheetsEl.querySelector(`[data-key="${key}"]`);
  if (el) caretToEnd(el, atStart);
}

// Separa o conteúdo a partir do cursor (para "Enter" dividir uma linha em duas).
function splitAtCaret(el) {
  const sel = getSelection();
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return '';
  const r = sel.getRangeAt(0);
  r.deleteContents();
  const tail = document.createRange();
  tail.setStart(r.endContainer, r.endOffset);
  tail.setEnd(el, el.childNodes.length);
  const box = document.createElement('div');
  box.append(tail.extractContents());
  return cleanHtml(box);
}

function caretAtStart(el) {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(sel.anchorNode, sel.anchorOffset);
  return r.toString().length === 0;
}

/**
 * Campo editável.
 * single: sem quebras de linha. onEnter/onBackspaceStart/onPasteLines: comportamento de lista.
 */
function editable({ html, ph, cls = '', key, single = false, onInput, onEnter, onBackspaceStart, onPasteLines, onMove }) {
  const el = h('div', { class: `ed ${cls}`, contenteditable: 'true', 'data-ph': ph, 'data-key': key, spellcheck: 'true' });
  el.innerHTML = html || '';
  el.addEventListener('input', () => {
    if (isEmpty(cleanHtml(el)) && !el.querySelector('img')) el.innerHTML = '';
    onInput(cleanHtml(el));
    touch();
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && onEnter) {
      e.preventDefault();
      const tail = single ? '' : splitAtCaret(el);
      onInput(cleanHtml(el));
      onEnter(tail);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!single) document.execCommand('insertLineBreak');
    } else if (e.key === 'Backspace' && onBackspaceStart && caretAtStart(el)) {
      e.preventDefault();
      onBackspaceStart(cleanHtml(el));
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && onMove) {
      e.preventDefault();
      onMove(e.key === 'ArrowUp' ? -1 : 1);
    }
  });
  el.addEventListener('paste', e => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const lines = text.split(/\r?\n/).map(s => s.replace(/^\s*[-•·*]\s*/, '').trim()).filter(Boolean);
    if (onPasteLines && lines.length > 1) onPasteLines(lines);
    else document.execCommand('insertText', false, single || onEnter ? text.replace(/\s*\r?\n\s*/g, ' ') : text);
  });
  return el;
}

const escapeText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---------- operações estruturais ----------

function commit(fn, focus) {
  fn();
  touch();
  render();
  if (focus) requestAnimationFrame(() => focusKey(...[].concat(focus)));
}

function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}

function removeWithUndo(label, fn) {
  const snapshot = structuredClone(state);
  commit(fn);
  toast(`${label} removida`, 'Anular', () => { state = snapshot; render(); });
}

let toastTimer;
function toast(msg, action, onAction) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const t = h('div', { class: 'toast', role: 'status' },
    h('span', {}, msg),
    action && h('button', { onclick: () => { onAction(); t.remove(); } }, action));
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), 6000);
}

function iconBtn(label, title, onclick, cls = '') {
  return h('button', { class: `tb ${cls}`, type: 'button', title, 'aria-label': title, onmousedown: e => e.preventDefault(), onclick }, label);
}

// Menu suspenso simples (adicionar refeição / secção).
function menuButton(label, entries) {
  const wrap = h('div', { class: 'menu-wrap' });
  const btn = h('button', { class: 'add-block', type: 'button' }, label);
  btn.addEventListener('click', () => {
    if (wrap.querySelector('.menu')) return closeMenus();
    closeMenus();
    const menu = h('div', { class: 'menu', role: 'menu' },
      entries.map(([text, icon, fn]) => h('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenus(); fn(); } },
        icon ? h('span', { class: 'mi', html: icon }) : null, text)));
    wrap.append(menu);
  });
  wrap.append(btn);
  return wrap;
}
function closeMenus() { document.querySelectorAll('.menu').forEach(m => m.remove()); }
document.addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) closeMenus(); });

// ---------- cabeçalho ----------

function renderHeader() {
  const hd = state.header;
  const dateInput = (key, cls) => h('input', {
    type: 'date', class: cls, value: hd[key],
    oninput: e => { hd[key] = e.target.value; touch(); e.target.closest('.next')?.classList.toggle('empty', !e.target.value); },
  });
  return [
    h('header', { class: 'plan-head' },
      h('img', { class: 'logo', src: 'img/logo.png', alt: NUTRITIONIST.name }),
      h('div', { class: 'head-right' },
        editable({ html: escapeText(hd.title), cls: 'plan-title', single: true, ph: 'Título', onInput: v => (hd.title = v) }),
        editable({ html: hd.client, cls: 'client', single: true, key: 'client', ph: 'Nome do cliente', onInput: v => (hd.client = v) }),
        dateInput('date', 'date'),
        h('label', { class: `next ${hd.nextVisit ? '' : 'empty'}`, title: 'Opcional: se ficar vazio não aparece no PDF' },
          h('span', {}, 'Próxima consulta'), dateInput('nextVisit', 'next-date'),
          hd.nextVisit ? null : h('span', { class: 'hint' }, '(opcional)')),
      ),
    ),
    h('div', { class: 'rule' }),
    h('div', { class: 'objective' },
      h('span', { class: 'eyebrow' }, 'Objetivo da consulta'),
      editable({ html: hd.objective, cls: 'objective-text', single: true, key: 'objective', ph: 'Ex.: Menopausa, ganho de massa muscular…', onInput: v => (hd.objective = v) })),
  ];
}

// ---------- refeições ----------

function renderMeal(m, mi) {
  const key = i => `m${mi}-i${i}`;
  const items = h('ul', { class: 'items' }, m.items.map((it, ii) => {
    const field = editable({
      html: it.text, key: key(ii), cls: it.kind === 'sub' ? 'sub' : '',
      ph: it.kind === 'sub' ? 'Subtítulo (ex.: Opção 1, Sobremesa)' : 'Escrever…',
      onInput: v => (it.text = v),
      onEnter: tail => commit(() => m.items.splice(ii + 1, 0, { kind: 'item', text: tail }), [key(ii + 1), true]),
      onBackspaceStart: cur => {
        if (ii === 0) { if (isEmpty(cur) && m.items.length > 1) commit(() => m.items.splice(0, 1), key(0)); return; }
        const prev = m.items[ii - 1];
        commit(() => { prev.text += cur; m.items.splice(ii, 1); }, key(ii - 1));
      },
      onPasteLines: lines => commit(() => {
        const first = isEmpty(it.text);
        m.items.splice(first ? ii : ii + 1, first ? 1 : 0, ...lines.map(t => ({ kind: 'item', text: escapeText(t) })));
      }, key(ii + lines.length - (isEmpty(it.text) ? 1 : 0))),
      onMove: d => { if (move(m.items, ii, d)) commit(() => {}, key(ii + d)); },
    });
    return h('li', { class: `item kind-${it.kind}` }, field,
      h('span', { class: 'item-tools' },
        iconBtn(it.kind === 'sub' ? '•' : 'T', it.kind === 'sub' ? 'Transformar em linha' : 'Transformar em subtítulo',
          () => commit(() => (it.kind = it.kind === 'sub' ? 'item' : 'sub'), key(ii))),
        iconBtn('↑', 'Subir (Alt+↑)', () => move(m.items, ii, -1) && commit(() => {})),
        iconBtn('↓', 'Descer (Alt+↓)', () => move(m.items, ii, 1) && commit(() => {})),
        iconBtn('✕', 'Apagar linha', () => commit(() => m.items.splice(ii, 1)), 'danger')));
  }));

  return h('article', { class: `meal ${isSingleLine(m) ? 'single' : ''}` },
    h('div', { class: 'meal-left' },
      editable({ html: escapeText(m.time), cls: 'meal-time', single: true, ph: 'Hora', onInput: v => (m.time = v) }),
      editable({ html: m.title, cls: 'meal-title', key: `m${mi}-t`, single: true, ph: 'Refeição',
        onInput: v => (m.title = v),
        onEnter: () => (m.items.length ? focusKey(key(0), true) : commit(() => m.items.push({ kind: 'item', text: '' }), key(0))) })),
    h('div', { class: 'meal-body' },
      h('span', { class: 'dot' }),
      items,
      h('div', { class: 'add-row' },
        h('button', { type: 'button', onclick: () => commit(() => m.items.push({ kind: 'item', text: '' }), key(m.items.length)) }, '+ linha'),
        h('button', { type: 'button', onclick: () => commit(() => m.items.push({ kind: 'sub', text: '' }), key(m.items.length)) }, '+ subtítulo'))),
    blockTools(state.meals, mi, 'Refeição'));
}

function blockTools(arr, i, label, extra = []) {
  return h('div', { class: 'block-tools' },
    extra,
    iconBtn('↑', 'Subir', () => move(arr, i, -1) && commit(() => {})),
    iconBtn('↓', 'Descer', () => move(arr, i, 1) && commit(() => {})),
    iconBtn('⧉', 'Duplicar', () => commit(() => arr.splice(i + 1, 0, structuredClone(arr[i])))),
    iconBtn('✕', `Apagar ${label.toLowerCase()}`, () => removeWithUndo(label, () => arr.splice(i, 1)), 'danger'));
}

function addMealMenu() {
  const add = title => commit(() => state.meals.push({ time: '', title, items: [{ kind: 'item', text: '' }] }),
    `m${state.meals.length}-i0`);
  return menuButton('+ Adicionar refeição', [
    ...MEAL_PRESETS.map(t => [t, null, () => add(t)]),
    ['Refeição em branco', null, () => commit(() => state.meals.push({ time: '', title: '', items: [{ kind: 'item', text: '' }] }), `m${state.meals.length}-t`)],
  ]);
}

// ---------- secções ----------

function seg(options, current, onPick, title) {
  return h('span', { class: 'seg', title },
    options.map(([value, label, tip]) => h('button', {
      type: 'button', class: value === current ? 'on' : '', title: tip,
      onmousedown: e => e.preventDefault(), onclick: () => commit(() => onPick(value)),
    }, label)));
}

function sectionTools(s, si) {
  const extra = [
    seg([['full', '▭', 'Largura inteira'], ['half', '◧', 'Meia largura (fica lado a lado com a seguinte)']], s.width, v => (s.width = v), 'Largura'),
  ];
  if (s.type !== 'photos') {
    extra.push(
      seg([[1, '1', '1 coluna'], [2, '2', '2 colunas'], [3, '3', '3 colunas']], s.columns, v => (s.columns = v), 'Colunas da lista'),
      seg([['bullet', '•', 'Marcadores'], ['number', '1.', 'Numerada'], ['none', '¶', 'Sem marcadores']], s.list, v => (s.list = v), 'Estilo da lista'),
      seg(['sage', 'peach', 'blue'].map(t => [t, h('i', { class: `swatch t-${t}` }), 'Cor']), s.tone, v => (s.tone = v), 'Cor'),
    );
  }
  return blockTools(state.sections, si, 'Secção', extra);
}

function renderSectionBody(s, si) {
  const key = i => `s${si}-i${i}`;
  if (s.type === 'photos') return renderPhotos(s, si);

  const list = h('ul', { class: `sec-list list-${s.list} cols-${s.columns}` }, s.items.map((t, ii) =>
    h('li', {},
      editable({
        html: t, key: key(ii), ph: 'Escrever…',
        onInput: v => (s.items[ii] = v),
        onEnter: tail => commit(() => s.items.splice(ii + 1, 0, tail), [key(ii + 1), true]),
        onBackspaceStart: cur => {
          if (ii === 0) { if (isEmpty(cur)) commit(() => s.items.splice(0, 1), `s${si}-intro`); return; }
          commit(() => { s.items[ii - 1] += cur; s.items.splice(ii, 1); }, key(ii - 1));
        },
        onPasteLines: lines => commit(() => {
          const first = isEmpty(t);
          s.items.splice(first ? ii : ii + 1, first ? 1 : 0, ...lines.map(escapeText));
        }, key(ii + lines.length - (isEmpty(t) ? 1 : 0))),
        onMove: d => { if (move(s.items, ii, d)) commit(() => {}, key(ii + d)); },
      }),
      h('span', { class: 'item-tools' }, iconBtn('✕', 'Apagar linha', () => commit(() => s.items.splice(ii, 1)), 'danger')))));

  return [
    editable({ html: s.intro, cls: 'sec-intro', key: `s${si}-intro`, ph: 'Texto (opcional)', onInput: v => (s.intro = v) }),
    s.items.length ? list : null,
    h('div', { class: 'add-row' },
      h('button', { type: 'button', onclick: () => commit(() => s.items.push(''), key(s.items.length)) }, '+ linha')),
  ];
}

function renderPhotos(s, si) {
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true,
    onchange: e => addPhotos(s, e.target.files) });
  const slots = s.photos.map((src, pi) => h('figure', { class: 'photo' },
    h('img', { src, alt: '' }),
    iconBtn('✕', 'Remover foto', () => commit(() => s.photos.splice(pi, 1)), 'danger photo-del')));
  if (!s.photos.length) {
    slots.push(h('button', { type: 'button', class: 'photo-drop', onclick: () => input.click() },
      h('span', { html: iconSvg('photo', COLORS.muted, 28) }), 'Adicionar foto', h('small', {}, 'clique ou arraste para aqui (até 2)')));
  }
  const box = h('div', { class: `photos n${Math.max(1, s.photos.length)}` }, slots, input);
  // arrastar uma imagem para qualquer parte da secção
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over'); });
  box.addEventListener('dragleave', () => box.classList.remove('over'));
  box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('over'); addPhotos(s, e.dataTransfer.files); });
  return [
    box,
    editable({ html: s.caption, cls: 'caption', single: true, ph: 'Legenda (opcional)', onInput: v => (s.caption = v) }),
    s.photos.length === 1
      ? h('div', { class: 'add-row' }, h('button', { type: 'button', onclick: () => input.click() }, '+ 2.ª foto'))
      : null,
  ];
}

// Recorta em 4:3, reduz e arredonda os cantos (com a cor da página) para um PDF leve.
async function prepPhoto(file) {
  const bmp = await createImageBitmap(file);
  const W = 1200, H = 900, R = 34;
  const c = h('canvas', { width: W, height: H });
  const ctx = c.getContext('2d');
  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, R);
  ctx.clip();
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const w = bmp.width * scale, hh = bmp.height * scale;
  ctx.drawImage(bmp, (W - w) / 2, (H - hh) / 2, w, hh);
  return c.toDataURL('image/jpeg', 0.86);
}

async function addPhotos(s, files) {
  const imgs = [...files].filter(f => f.type.startsWith('image/')).slice(0, 2 - s.photos.length);
  try {
    const urls = await Promise.all(imgs.map(prepPhoto));
    commit(() => s.photos.push(...urls));
  } catch {
    toast('Não foi possível abrir essa imagem.');
  }
}

function renderSections() {
  const pairedIdx = new Set(pairSections(state.sections).filter(r => r.length === 2).flat().map(s => state.sections.indexOf(s)));
  return state.sections.map((s, si) => h('section', {
    class: `sec tone-${s.tone} ${pairedIdx.has(si) ? 'paired' : ''} ${sectionHasContent(s) ? '' : 'is-empty'} type-${s.type}`,
  },
  h('div', { class: 'sec-head' },
    h('span', { class: 'sec-icon', html: iconSvg(s.icon, COLORS.tones[s.tone].accent, 18) }),
    editable({ html: escapeText(s.title), cls: 'sec-title', single: true, ph: 'Título da secção', onInput: v => (s.title = v) })),
  renderSectionBody(s, si),
  h('p', { class: 'empty-note' }, 'Secção vazia: não aparece no PDF'),
  sectionTools(s, si)));
}

function addSectionMenu() {
  return menuButton('+ Adicionar secção', Object.entries(SECTION_PRESETS).map(([type, p]) =>
    [p.title, iconSvg(p.icon, COLORS.tones[p.tone].accent, 16), () => commit(() => {
      state.sections.push(section(type, type === 'photos' ? {} : { items: [''] }));
    }, type === 'photos' ? null : `s${state.sections.length}-i0`)]));
}

// ---------- folhas ----------

function footer() {
  return h('footer', { class: 'sheet-foot' },
    h('span', {}, h('b', {}, NUTRITIONIST.name), `  ·  ${NUTRITIONIST.title}  ·  Cédula profissional n.º ${NUTRITIONIST.license}`),
    h('span', {}, `Tel. ${NUTRITIONIST.phone}`));
}

function miniHeader() {
  return h('div', { class: 'mini-head' }, h('img', { src: 'img/logo.png', alt: '' }), h('span', {}, 'Plano alimentar'));
}

function render() {
  const active = document.activeElement?.dataset?.key;
  const meals = h('div', { class: 'meals' }, state.meals.map(renderMeal));
  const sections = h('div', { class: 'sections' }, renderSections());

  const page1 = h('div', { class: 'sheet' },
    h('div', { class: 'sheet-body' }, renderHeader(), meals, addMealMenu(),
      state.sectionsOnNewPage ? null : [sections, addSectionMenu()]),
    footer());

  const sheets = [page1];
  if (state.sectionsOnNewPage) {
    sheets.push(h('div', { class: 'sheet' },
      h('div', { class: 'sheet-body' }, miniHeader(), sections, addSectionMenu()), footer()));
  }
  sheetsEl.replaceChildren(...sheets);
  if (active) focusKey(active);
}

// ---------- barra superior ----------

document.getElementById('toggle-newpage').checked = state.sectionsOnNewPage;
document.getElementById('toggle-newpage').addEventListener('change', e => {
  commit(() => (state.sectionsOnNewPage = e.target.checked));
});

document.getElementById('btn-new').addEventListener('click', () => {
  if (dirty && !confirm('Começar um plano novo? O plano atual será descartado.')) return;
  state = defaultPlan();
  dirty = false;
  document.getElementById('toggle-newpage').checked = state.sectionsOnNewPage;
  render();
  window.scrollTo({ top: 0 });
  focusKey('client');
});

document.getElementById('btn-export').addEventListener('click', () => {
  document.activeElement?.blur();
  openExport(state, () => { dirty = false; });
});

window.addEventListener('beforeunload', e => {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

render();
focusKey('client');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}

// Para testes automáticos.
window.__plan = { get state() { return state; }, set state(s) { state = s; render(); } };
```

## `js/pdf.js`

```js
// Gera o PDF (pdfmake) a partir do estado da folha.
import { NUTRITIONIST, COLORS } from './config.js';
import { toRuns, isEmpty } from './richtext.js';
import { iconSvg } from './icons.js';
import { pairSections, sectionHasContent, formatDate, mealHasContent, isSingleLine } from './model.js';

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

function photosNode(s, innerW) {
  const photos = s.photos.slice(0, 2);
  const gap = 10;
  const w = photos.length === 1 ? Math.min(innerW, innerW > 300 ? 300 : 160) : (innerW - gap) / 2;
  const images = photos.map(p => ({ image: p, width: w, height: w * 0.75 }));
  const row = photos.length === 1
    ? { columns: [{ width: '*', text: '' }, images[0], { width: '*', text: '' }] }
    : { columns: images, columnGap: gap };
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
  const content = [...header(h), ...meals(state.meals)];

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
```

## `js/model.js`

```js
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
```

## `js/config.js`

```js
// Dados fixos da nutricionista — alterar aqui se algo mudar.
export const NUTRITIONIST = {
  name: 'Elisabete Mendes',
  title: 'Nutricionista',
  license: '3197N',
  phone: '917 937 251',
};

// Paleta retirada do logótipo (folhas verde-salva/azul, ananás pêssego/coral).
export const COLORS = {
  page: '#FDFBF7',
  ink: '#3B4043',
  muted: '#80878A',
  line: '#D9E3DE',
  sage: '#6E8C7F',
  coral: '#D9826F',
  tones: {
    sage: { bg: '#EFF4F1', accent: '#7C998C' },
    peach: { bg: '#FBEFE7', accent: '#E29B7C' },
    blue: { bg: '#EDF3F4', accent: '#7FA0A8' },
    none: { bg: null, accent: '#7C998C' },
  },
};

export const MEAL_PRESETS = [
  'Em jejum', 'Pequeno-almoço', 'Meio da manhã', 'Almoço',
  'Lanche', 'Meio da tarde', 'Jantar', 'Ceia',
];

// Secções da página de recomendações. `icon` aponta para ICONS em icons.js.
export const SECTION_PRESETS = {
  fruit: { title: 'Fruta', icon: 'fruit', tone: 'peach', columns: 3, list: 'bullet' },
  water: { title: 'Água', icon: 'water', tone: 'blue', columns: 1, list: 'bullet' },
  supplements: { title: 'Suplementação', icon: 'pill', tone: 'sage', columns: 1, list: 'bullet' },
  plate: { title: 'Composição do prato', icon: 'plate', tone: 'sage', columns: 1, list: 'number' },
  cooking: { title: 'Confeções e temperos', icon: 'pan', tone: 'blue', columns: 1, list: 'none' },
  tips: { title: 'Dicas', icon: 'tips', tone: 'peach', columns: 1, list: 'bullet' },
  photos: { title: 'Fotografias', icon: 'photo', tone: 'none' },
};

const PROTEIN = 'carnes – aves (frango, peru, pato e avestruz), caça (coelho, lebre, perdiz, codorniz e javali), miúdos e vísceras <b>ou</b> peixes (todos), mariscos, moluscos, conservas ao natural, salmão fumado';

// Conteúdo com que a folha abre. Vive apenas no código: nada é guardado no computador.
export function defaultPlan() {
  const item = text => ({ kind: 'item', text });
  const sub = text => ({ kind: 'sub', text });
  const today = new Date();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    header: { title: 'Plano Alimentar', client: '', objective: '', date: iso(today), nextVisit: '' },
    sectionsOnNewPage: true,
    meals: [
      { time: '06h30', title: 'Em jejum', items: [item('1 copo de água')] },
      { time: '06h45', title: 'Pequeno-almoço', items: [item('1 cevada sem açúcar + ½ pão de massa mãe (cereais, integral ou centeio) + queijo magro')] },
      { time: '10h30', title: 'Meio da manhã', items: [
        item('1 iogurte magro bífidus/probióticos + 2 colheres de sopa de cereais sem açúcar + 1 fruta'),
        item('1 iogurte magro bífidus/probióticos + 2 tortilhas de milho ou arroz + 1 fruta'),
      ] },
      { time: '12h30 – 13h00', title: 'Almoço', items: [
        sub('Prato de sobremesa'),
        item('<b>Meio prato</b> de salada ou legumes – pouco cozinhados e com pouca gordura'),
        item(`<b>125 g de proteína</b> (tamanho da palma da mão): ${PROTEIN}`),
        item('<b>3 colheres de sopa (60 g)</b> de uma guarnição à escolha – ex.: grão de soja, grão-de-bico, ervilhas, lentilhas, feijão preto, vermelho ou branco, couscous, quinoa, arroz basmati, massa integral, batata-doce, batata…'),
        sub('Sobremesa'),
        item('1 gelatina sem açúcar'),
      ] },
      { time: '15h30', title: 'Lanche', items: [item('1 fruta + 6 frutos secos')] },
      { time: '17h30', title: 'Lanche', items: [item('½ pão de massa mãe + queijo magro ou 1 ovo + 1 chá ou cevada')] },
      { time: '19h00 – 19h30', title: 'Jantar', items: [item('Sopa de legumes')] },
      { time: '20h30', title: 'Jantar', items: [
        sub('Prato de sobremesa'),
        item('<b>Meio prato</b> de salada ou legumes – pouco cozinhados e com pouca gordura'),
        item(`<b>125 g de proteína</b> (tamanho da palma da mão): ${PROTEIN}`),
        sub('Sobremesa'),
        item('1 fruta com canela'),
      ] },
      { time: '', title: 'Ceia', items: [item('1 chá (boa noite, noites tranquilas, bons sonhos)')] },
    ],
    sections: [
      section('fruit', {
        intro: 'Cada porção de fruta equivale a:',
        items: ['3 ameixas', '1 a 2 pêssegos ou nectarinas', '1 laranja', '2 tangerinas', '1 toranja', '6 morangos',
          '12 amoras, framboesas ou mirtilos', '2 kiwis', '½ abacate', '1 maçã', '½ papaia', '1 pera',
          '1 fatia de melancia', '1 fatia de melão', '½ meloa', '3 alperces', '4 nêsperas', '1 romã',
          '½ marmelo (assado com canela)', '1 rodela de abacaxi', '12 cerejas', '12 uvas', '½ manga', '3 figos',
          '1 banana pequena', '1 anona', '1 dióspiro'],
      }),
      section('water', { width: 'half', intro: 'Beber <b>1,5 L de água</b> por dia.' }),
      section('supplements', { width: 'half', items: [
        '<b>Bisglicinato de magnésio</b> – 2 cápsulas à noite',
        '<b>Woman Balance Hot Flashes</b> – 1 comprimido por dia, de preferência depois do pequeno-almoço, e 1 cápsula (transparente) por dia, de preferência depois do jantar',
      ] }),
      section('plate', {
        intro: 'Prato e talheres de sobremesa:',
        items: [
          '<b>Meio prato</b> de salada ou legumes – pouco cozinhados e com pouca gordura.',
          `<b>Proteína: 125 g</b> (tamanho da palma da mão) – ${PROTEIN} e ovas.`,
          '<b>Hidratos: 3 colheres de sopa (80 g)</b> de uma guarnição à escolha – ex.: grão de soja, grão-de-bico, ervilhas, lentilhas, feijão preto, vermelho ou branco, couscous, quinoa, arroz, arroz basmati, massa, massa integral, batata-doce, batata…',
        ],
      }),
      section('photos', { width: 'half', caption: 'Exemplo de prato equilibrado' }),
      section('cooking', { width: 'half', items: [
        '<b>Confeções:</b> estufados em cru, assados com pouca gordura e sem tostar, grelhados sem gordura, cozidos a vapor e salteados com azeite e alho.',
        '<b>Temperos:</b> ervas aromáticas, especiarias, flor de sal ou sal rosa dos Himalaias, azeite, vinagre, vinho e cerveja.',
      ] }),
      section('tips'),
    ],
  };
}

export function section(type, overrides = {}) {
  const p = SECTION_PRESETS[type];
  const base = type === 'photos'
    ? { type, title: p.title, icon: p.icon, tone: p.tone, width: 'full', photos: [], caption: '' }
    : { type, title: p.title, icon: p.icon, tone: p.tone, width: 'full', columns: p.columns, list: p.list, intro: '', items: [] };
  return { ...base, ...overrides };
}
```

## `css/app.css`

```css
@font-face { font-family: 'Lato'; src: url(../fonts/Lato-Regular.ttf); font-weight: 400; }
@font-face { font-family: 'Lato'; src: url(../fonts/Lato-Bold.ttf); font-weight: 700; }
@font-face { font-family: 'Lato'; src: url(../fonts/Lato-Italic.ttf); font-weight: 400; font-style: italic; }
@font-face { font-family: 'Lato'; src: url(../fonts/Lato-BoldItalic.ttf); font-weight: 700; font-style: italic; }
@font-face { font-family: 'Cormorant'; src: url(../fonts/Cormorant-Medium.ttf); font-weight: 500; }
@font-face { font-family: 'Cormorant'; src: url(../fonts/Cormorant-SemiBold.ttf); font-weight: 600; }
@font-face { font-family: 'Cormorant'; src: url(../fonts/Cormorant-MediumItalic.ttf); font-weight: 500; font-style: italic; }

/* A app é usada sempre em tema claro: a folha imita papel. */
:root {
  color-scheme: light;
  --page: #FDFBF7;
  --desk: #ECE8E1;
  --ink: #3B4043;
  --muted: #80878A;
  --line: #D9E3DE;
  --sage: #6E8C7F;
  --coral: #D9826F;
  --sage-bg: #EFF4F1; --sage-ac: #7C998C;
  --peach-bg: #FBEFE7; --peach-ac: #E29B7C;
  --blue-bg: #EDF3F4; --blue-ac: #7FA0A8;
  --ui: #FFFFFF;
  --ui-border: #DDD7CE;
  --focus: #7C998C;
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--desk);
  color: var(--ink);
  font-family: 'Lato', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; color: inherit; cursor: pointer; }

/* ---------- barra superior ---------- */

.topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 16px;
  padding: 10px 20px;
  background: rgba(251, 248, 243, .92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--ui-border);
}
.brand { display: flex; align-items: center; gap: 10px; font-family: 'Cormorant'; font-weight: 600; font-size: 22px; }
.brand img { width: 30px; height: 30px; }
.shortcuts { margin: 0 auto 0 12px; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.actions { display: flex; align-items: center; gap: 10px; }

.btn {
  border: 1px solid var(--ui-border); background: var(--ui);
  border-radius: 999px; padding: 8px 16px; font-size: 14px;
  transition: background .15s, border-color .15s;
}
.btn:hover { border-color: var(--sage-ac); }
.btn.primary { background: var(--sage); border-color: var(--sage); color: #fff; font-weight: 700; }
.btn.primary:hover { background: #5E7C6F; }
.btn.ghost { background: transparent; }
.btn.wide { width: 100%; padding: 11px 16px; }
.btn small { font-weight: 400; opacity: .85; margin-left: 4px; }
.btn:focus-visible, .tb:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

.switch { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); cursor: pointer; user-select: none; }
.switch input { position: absolute; opacity: 0; }
.switch span { width: 32px; height: 18px; border-radius: 9px; background: #CFCAC2; position: relative; transition: background .15s; }
.switch span::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; }
.switch input:checked + span { background: var(--sage-ac); }
.switch input:checked + span::after { transform: translateX(14px); }
.switch input:focus-visible + span { outline: 2px solid var(--focus); outline-offset: 2px; }

/* ---------- folhas A4 (medidas em pt, iguais ao PDF) ---------- */

#sheets { display: flex; flex-direction: column; align-items: center; gap: 28px; padding: 32px 16px 120px; }
.sheet {
  width: 595pt; min-height: 842pt;
  background: var(--page);
  box-shadow: 0 1px 2px rgba(60, 50, 40, .08), 0 12px 32px rgba(60, 50, 40, .10);
  display: flex; flex-direction: column;
  font-size: 9.5pt; line-height: 1.22;
}
.sheet-body { padding: 58pt 46pt 24pt; flex: 1; }
.sheet-foot {
  margin: 0 46pt; padding: 7pt 0 34pt;
  border-top: .8pt solid var(--sage-ac);
  display: flex; justify-content: space-between; gap: 12pt;
  font-size: 8pt; color: var(--muted); white-space: pre;
}
.sheet-foot b { color: var(--ink); }

/* campos editáveis */
.ed { outline: none; border-radius: 3px; min-width: 2em; cursor: text; transition: background .12s, box-shadow .12s; }
.ed:hover { background: rgba(124, 153, 140, .07); }
.ed:focus { background: rgba(124, 153, 140, .10); box-shadow: 0 0 0 2px rgba(124, 153, 140, .35); }
.ed:empty::before { content: attr(data-ph); color: #B5B9B7; font-style: italic; font-weight: 400; letter-spacing: 0; text-transform: none; pointer-events: none; }

/* cabeçalho */
.plan-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16pt; }
.plan-head .logo { width: 138pt; height: auto; display: block; }
.head-right { flex: 1; display: flex; flex-direction: column; align-items: flex-end; text-align: right; padding-top: 12pt; gap: 3pt; }
.plan-title { font-family: 'Cormorant'; font-weight: 600; font-size: 30pt; line-height: .95; }
.client { font-size: 13pt; margin-top: 3pt; }
.head-right input[type=date] {
  font: inherit; font-size: 9pt; color: var(--muted); border: 0; background: transparent; text-align: right;
  padding: 1px 2px; border-radius: 3px; font-family: 'Lato';
}
.head-right input[type=date]:hover { background: rgba(124, 153, 140, .07); }
.head-right input[type=date]:focus { outline: 2px solid rgba(124, 153, 140, .35); }
.next { display: flex; align-items: center; gap: 4pt; font-size: 9pt; color: var(--muted); }
.next .next-date { color: var(--coral) !important; font-weight: 700 !important; }
.next.empty { opacity: .55; }
.next.empty .next-date { color: var(--muted) !important; font-weight: 400 !important; }
.next .hint { font-style: italic; font-size: 8pt; }

.rule { height: 0; border-top: .8pt solid var(--line); margin: 12pt 0 14pt; }

.objective { background: var(--sage-bg); text-align: center; padding: 9pt 12pt 8pt; margin-bottom: 16pt; }
.eyebrow { display: block; font-size: 6.5pt; font-weight: 700; letter-spacing: 2pt; color: var(--sage); text-transform: uppercase; }
.objective-text { font-family: 'Cormorant'; font-weight: 600; font-size: 18pt; margin-top: 2pt; display: inline-block; min-width: 60%; }
.objective-text:empty::before { font-family: 'Lato'; font-size: 11pt; }

/* refeições (linha do tempo) */
.meal { display: grid; grid-template-columns: 104pt 1fr; position: relative; }
.meal-left { display: flex; flex-direction: column; align-items: flex-end; text-align: right; padding: 6pt 12pt 6pt 0; gap: 1.5pt; }
.meal-time { color: var(--coral); font-weight: 700; }
.meal-time:empty::before, .meal-title:empty::before { font-size: 8pt; }
.meal-body { border-left: 1pt solid var(--line); padding: 6pt 0 6pt 14pt; position: relative; min-width: 0; }
.meal-body .dot { position: absolute; left: -3.5pt; top: 8.5pt; width: 6pt; height: 6pt; border-radius: 50%; background: var(--page); border: 1.2pt solid var(--sage-ac); }
.meal-title { font-weight: 700; font-size: 7.5pt; letter-spacing: 1.2pt; color: var(--sage); text-transform: uppercase; }

.items { list-style: none; margin: 0; padding: 0; }
.item { position: relative; padding-left: 10pt; margin-bottom: 1.5pt; }
.item::before { content: '•'; position: absolute; left: 0; top: 0; color: var(--peach-ac); }
.meal.single .item::before { content: none; }
.meal.single .item { padding-left: 0; }
.item.kind-sub { padding-left: 0; margin-top: 4pt; }
.item.kind-sub:first-child { margin-top: 1pt; }
.item.kind-sub::before { content: none; }
.ed.sub { font-size: 7.5pt; font-weight: 700; color: var(--muted); letter-spacing: 1pt; text-transform: uppercase; display: inline-block; }

/* ferramentas que aparecem ao passar o rato (não vão para o PDF) */
.item-tools, .block-tools { display: flex; gap: 2px; opacity: 0; pointer-events: none; transition: opacity .12s; }
.item-tools { position: absolute; right: -4pt; top: -2px; transform: translateX(100%); padding-left: 4px; }
li:hover > .item-tools, li:focus-within > .item-tools { opacity: 1; pointer-events: auto; }
.tb {
  border: 1px solid var(--ui-border); background: var(--ui); border-radius: 6px;
  min-width: 22px; height: 22px; padding: 0 5px; font-size: 12px; line-height: 1; color: var(--muted);
  display: inline-flex; align-items: center; justify-content: center;
}
.tb:hover { color: var(--ink); border-color: var(--sage-ac); }
.tb.danger:hover { color: #B4483A; border-color: #E2A196; background: #FDF1EE; }

.block-tools {
  position: absolute; top: 0; right: 0; transform: translateY(-60%); z-index: 5;
  background: var(--ui); border: 1px solid var(--ui-border); border-radius: 8px; padding: 3px;
  box-shadow: 0 4px 14px rgba(60, 50, 40, .12);
}
.block-tools .tb { border-color: transparent; }
.meal:hover > .block-tools, .meal:focus-within > .block-tools,
.sec:hover > .block-tools, .sec:focus-within > .block-tools { opacity: 1; pointer-events: auto; }

.seg { display: inline-flex; border-right: 1px solid var(--ui-border); padding-right: 3px; margin-right: 1px; }
.seg button { border: 0; background: transparent; min-width: 22px; height: 22px; border-radius: 5px; font-size: 12px; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; }
.seg button:hover { background: #F3F0EB; color: var(--ink); }
.seg button.on { background: var(--sage-bg); color: var(--sage); font-weight: 700; }
.swatch { width: 11px; height: 11px; border-radius: 50%; display: block; }
.swatch.t-sage { background: var(--sage-ac); }
.swatch.t-peach { background: var(--peach-ac); }
.swatch.t-blue { background: var(--blue-ac); }
.seg button.on .swatch { box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px currentColor; }

.add-row { display: flex; gap: 6px; height: 0; overflow: visible; opacity: 0; transition: opacity .12s; }
.add-row button { border: 0; background: none; color: var(--sage); font-size: 11px; padding: 2px 4px; border-radius: 4px; position: relative; top: 1px; }
.add-row button:hover { background: var(--sage-bg); }
.meal:hover .add-row, .meal:focus-within .add-row, .sec:hover .add-row, .sec:focus-within .add-row { opacity: 1; }

.menu-wrap { position: relative; margin: 14pt 0 4pt; }
.add-block {
  width: 100%; border: 1.5px dashed #CFD9D3; background: transparent; color: var(--sage);
  border-radius: 8px; padding: 8px; font-size: 12px; font-weight: 700; letter-spacing: .3px;
}
.add-block:hover { background: rgba(124, 153, 140, .06); border-color: var(--sage-ac); }
.menu {
  position: absolute; left: 50%; transform: translateX(-50%); top: calc(100% + 6px); z-index: 30;
  background: var(--ui); border: 1px solid var(--ui-border); border-radius: 10px; padding: 6px;
  box-shadow: 0 12px 32px rgba(60, 50, 40, .18); min-width: 230px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 2px;
}
.menu button { display: flex; align-items: center; gap: 8px; text-align: left; border: 0; background: none; padding: 7px 10px; border-radius: 6px; font-size: 13px; }
.menu button:hover, .menu button:focus-visible { background: var(--sage-bg); outline: none; }
.mi { display: inline-flex; }

/* secções (página de recomendações) */
.mini-head { display: flex; justify-content: space-between; align-items: center; margin: -42pt 0 9pt; font-size: 8pt; color: var(--muted); }
.mini-head img { width: 62pt; }
.sections { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; }
.sheet-body > .meals + .menu-wrap + .sections { margin-top: 18pt; }
.sec { grid-column: span 2; position: relative; padding: 10pt 12pt; border-left: 2.5pt solid transparent; min-width: 0; }
.sec.paired { grid-column: span 1; }
.sec.tone-sage { background: var(--sage-bg); border-left-color: var(--sage-ac); }
.sec.tone-peach { background: var(--peach-bg); border-left-color: var(--peach-ac); }
.sec.tone-blue { background: var(--blue-bg); border-left-color: var(--blue-ac); }
.sec.tone-none { border-left: 0; padding-left: 14.5pt; }
.sec.is-empty { opacity: .55; }
.sec.is-empty:hover, .sec.is-empty:focus-within { opacity: 1; }
.empty-note { display: none; margin: 4pt 0 0; font-size: 8pt; font-style: italic; color: var(--muted); }
.sec.is-empty .empty-note { display: block; }

.sec-head { display: flex; align-items: center; gap: 7pt; margin-bottom: 6pt; }
.sec-icon { display: inline-flex; width: 15pt; height: 15pt; }
.sec-icon svg { width: 100%; height: 100%; }
.sec-title { font-family: 'Cormorant'; font-weight: 600; font-size: 15.5pt; line-height: 1.1; }
.sec-intro { line-height: 1.25; margin-bottom: 5pt; }
.sec-intro:empty { margin-bottom: 0; font-size: 8.5pt; }
.sec:not(:hover):not(:focus-within) .sec-intro:empty { display: none; }

.sec-list { list-style: none; margin: 0; padding: 0; column-gap: 14pt; counter-reset: n; }
.sec-list.cols-2 { column-count: 2; }
.sec-list.cols-3 { column-count: 3; }
.sec-list li { position: relative; padding-left: 10pt; margin-bottom: 2pt; break-inside: avoid; counter-increment: n; }
.sec-list.list-bullet li::before { content: '•'; position: absolute; left: 0; color: var(--ac, var(--sage-ac)); }
.sec-list.list-number li { padding-left: 13pt; margin-bottom: 3pt; }
.sec-list.list-number li::before { content: counter(n) '.'; position: absolute; left: 0; color: var(--ac, var(--sage-ac)); }
.sec-list.list-none li { padding-left: 0; margin-bottom: 4pt; }
.tone-sage { --ac: var(--sage-ac); }
.tone-peach { --ac: var(--peach-ac); }
.tone-blue { --ac: var(--blue-ac); }
.sec-list .item-tools { right: 0; transform: none; top: -1px; }

/* fotografias */
.photos { display: flex; gap: 10pt; justify-content: center; }
.photo, .photo-drop { margin: 0; position: relative; width: 300pt; max-width: 100%; aspect-ratio: 4 / 3; }
.photos.n2 .photo, .photos.n2 .photo-drop { width: calc(50% - 5pt); }
.sec.paired .photos.n1 .photo, .sec.paired .photos.n1 .photo-drop { width: 160pt; }
.photo img { width: 100%; height: 100%; object-fit: cover; border-radius: 10pt; display: block; }
.photo-del { position: absolute; top: 6px; right: 6px; opacity: 0; transition: opacity .12s; }
.photo:hover .photo-del { opacity: 1; }
.photo-drop {
  border: 1.5px dashed #CFD9D3; border-radius: 10pt; background: rgba(255, 255, 255, .5);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  color: var(--muted); font-size: 12px;
}
.photo-drop small { font-size: 10px; opacity: .8; }
.photo-drop:hover, .over .photo-drop { border-color: var(--sage-ac); background: var(--sage-bg); }
.photos.over .photo img { outline: 2px dashed var(--sage-ac); outline-offset: 3px; }
.caption { text-align: center; font-style: italic; font-size: 8.5pt; color: var(--muted); margin: 6pt auto 0; max-width: 80%; }

/* ---------- janela de exportação ---------- */

dialog#export {
  border: 0; padding: 0; border-radius: 16px; width: min(1180px, 94vw); height: min(860px, 92vh);
  box-shadow: 0 30px 80px rgba(30, 25, 20, .35); background: var(--ui); color: var(--ink);
}
dialog#export::backdrop { background: rgba(40, 36, 32, .45); backdrop-filter: blur(2px); }
.export-grid { display: grid; grid-template-columns: 1fr 340px; height: 100%; }
.preview { position: relative; background: #DCD8D1; }
.preview iframe { width: 100%; height: 100%; border: 0; display: block; }
.spinner { display: none; position: absolute; inset: 0; align-items: center; justify-content: center; color: var(--muted); font-size: 14px; }
.preview.loading .spinner { display: flex; }
.export-panel { padding: 20px 22px; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.panel-head { display: flex; justify-content: space-between; align-items: center; }
.panel-head h2 { margin: 0; font-family: 'Cormorant'; font-weight: 600; font-size: 26px; }
.file-name { margin: -4px 0 6px; font-size: 12px; color: var(--muted); word-break: break-word; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 700; color: var(--muted); }
textarea, .inline-field input {
  font: inherit; font-size: 13px; font-weight: 400; color: var(--ink);
  border: 1px solid var(--ui-border); border-radius: 10px; padding: 9px 11px; background: #FFFDFA; resize: vertical;
}
textarea:focus, .inline-field input:focus { outline: 2px solid rgba(124, 153, 140, .45); border-color: var(--sage-ac); }
.divider { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--muted); margin: 8px 0 2px; }
.divider::before, .divider::after { content: ''; flex: 1; border-top: 1px solid var(--ui-border); }
.inline-field { display: flex; gap: 8px; }
.inline-field input { flex: 1; min-width: 0; border-radius: 999px; padding: 8px 14px; }
.note { font-size: 11.5px; color: var(--muted); line-height: 1.45; margin: 4px 0 0; }
.status { font-size: 12.5px; color: var(--sage); font-weight: 700; margin: 0; min-height: 1em; }

.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 50;
  background: #34393B; color: #fff; border-radius: 999px; padding: 10px 12px 10px 18px;
  display: flex; align-items: center; gap: 14px; font-size: 14px; box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
}
.toast button { border: 0; background: rgba(255, 255, 255, .14); color: #fff; border-radius: 999px; padding: 5px 12px; font-weight: 700; }

@media (max-width: 1100px) { .shortcuts { display: none; } }
@media (max-width: 860px) {
  .export-grid { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
  .switch { display: none; }
}
@media print { .topbar, .block-tools, .item-tools, .add-row, .menu-wrap { display: none !important; } }

/* ferramentas da refeição na margem esquerda, para não tapar o texto */
.meal > .block-tools { top: 4pt; right: auto; left: -40px; transform: none; flex-direction: column; }
.add-row { position: absolute; left: 12pt; bottom: -8px; height: auto; z-index: 4; }
.meal-body .add-row { left: 10pt; }
.add-row button { background: var(--page); top: 0; box-shadow: 0 0 0 1px #E3E9E5; }
.sec .add-row { left: 10pt; }
.sec .add-row button { background: #fff; }
```
