import { defaultPlan, section, SECTION_PRESETS, NUTRITIONIST, COLORS } from './config.js';
import { cleanHtml, isEmpty } from './richtext.js';
import { iconSvg } from './icons.js';
import { pairSections, isSingleLine, sectionHasContent, parseMeals, mealHasContent } from './model.js';
import { openExport } from './export.js';
import { prepPhoto } from './photo.js';

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

// ---------- refeições (texto livre colado do software) ----------

let editingMeals = false;

const MEALS_HINT = 'Cole aqui o plano tal como vem do software. A formatação é automática: '
  + 'uma linha com hora (ex.: “6h30 Em jejum:”) começa uma refeição, “- ” cria um ponto, '
  + 'uma linha terminada em “:” é um subtítulo e **texto** fica a negrito.';

const MEALS_PLACEHOLDER = '6h30 Em jejum:\n- 1 copo de água\n\n6h45 Pequeno-almoço:\n- 1 cevada sem açúcar + ½ pão de massa mãe + queijo magro\n\n12h30 - 13h00 Almoço:\nPrato de sobremesa:\n- …';

function renderMealView(m) {
  const items = m.items.filter(it => !isEmpty(it.text));
  return h('article', { class: `meal ${isSingleLine(m) ? 'single' : ''}`, 'data-line': m.line },
    h('div', { class: 'meal-left' },
      m.time ? h('div', { class: 'meal-time' }, m.time) : null,
      h('div', { class: 'meal-title', html: m.title })),
    h('div', { class: 'meal-body' },
      h('span', { class: 'dot' }),
      h('ul', { class: 'items' }, items.map(it =>
        h('li', { class: `item kind-${it.kind}` }, h('div', { class: it.kind === 'sub' ? 'sub' : '', html: it.text }))))));
}

function renderMeals() {
  const meals = parseMeals(state.mealsText).filter(mealHasContent);
  if (!editingMeals && meals.length) {
    const view = h('div', { class: 'meals view', tabindex: '0', role: 'button', 'aria-label': 'Editar o texto do plano', title: 'Clique para editar ou colar o texto' },
      meals.map(renderMealView),
      h('span', { class: 'edit-badge' }, '✎ Editar texto'));
    const open = e => {
      const art = e.target.closest?.('.meal');
      editMeals(view, art ? Number(art.dataset.line) : null, art ? art.getBoundingClientRect().top : null);
    };
    view.addEventListener('click', open);
    view.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); open(e); } });
    return view;
  }

  const ta = h('textarea', { class: 'meals-text', 'data-key': 'meals-text', spellcheck: 'true', placeholder: MEALS_PLACEHOLDER, 'aria-label': 'Texto do plano' });
  ta.value = state.mealsText;
  const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  ta.addEventListener('input', () => { state.mealsText = ta.value; touch(); fit(); });
  requestAnimationFrame(fit);

  const box = h('div', { class: 'meals editing' },
    h('p', { class: 'meals-hint' }, MEALS_HINT),
    ta,
    h('div', { class: 'meals-actions' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => closeMeals(box) }, 'Ver formatado')));
  // sair do texto mostra logo o plano formatado (sem reconstruir o resto da folha)
  box.addEventListener('focusout', e => {
    if (box.contains(e.relatedTarget)) return;
    if (state.mealsText.trim()) setTimeout(() => box.isConnected && closeMeals(box));
  });
  return box;
}

function closeMeals(box) {
  editingMeals = false;
  box.replaceWith(renderMeals());
}

// Abre a caixa de texto com o cursor na refeição clicada, sem a página saltar.
function editMeals(view, line, prevTop) {
  editingMeals = true;
  const box = renderMeals();
  view.replaceWith(box);
  const ta = box.querySelector('textarea');
  ta.style.height = ta.scrollHeight + 'px';
  let offset = ta.value.length;
  if (line != null) offset = ta.value.split('\n').slice(0, line).join('\n').length + (line ? 1 : 0);
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(offset, offset);
  if (prevTop != null) {
    const lh = parseFloat(getComputedStyle(ta).lineHeight);
    const pad = parseFloat(getComputedStyle(ta).paddingTop);
    window.scrollBy(0, ta.getBoundingClientRect().top + pad + line * lh - prevTop);
  }
}

function blockTools(arr, i, label, extra = []) {
  return h('div', { class: 'block-tools' },
    extra,
    iconBtn('↑', 'Subir', () => move(arr, i, -1) && commit(() => {})),
    iconBtn('↓', 'Descer', () => move(arr, i, 1) && commit(() => {})),
    iconBtn('⧉', 'Duplicar', () => commit(() => arr.splice(i + 1, 0, structuredClone(arr[i])))),
    iconBtn('✕', `Apagar ${label.toLowerCase()}`, () => removeWithUndo(label, () => arr.splice(i, 1)), 'danger'));
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

async function addPhotos(s, files) {
  const imgs = [...files].filter(f => f.type.startsWith('image/')).slice(0, 2 - s.photos.length);
  try {
    const urls = await Promise.all(imgs.map(f => prepPhoto(f)));
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
  const meals = renderMeals();
  const sections = h('div', { class: 'sections' }, renderSections());

  const page1 = h('div', { class: 'sheet' },
    h('div', { class: 'sheet-body' }, renderHeader(), meals,
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
  editingMeals = false;
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
