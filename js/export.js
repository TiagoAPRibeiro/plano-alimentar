// Janela de pré-visualização e envio do PDF.
import { NUTRITIONIST } from './config.js';
import { pdfBlob, fileName } from './pdf.js';
import { toRuns } from './richtext.js';

const dlg = document.getElementById('export');
const $ = sel => dlg.querySelector(sel);

let current = null; // { blob, file, url }
let onDone = () => {};

function clientFirstName(state) {
  const name = toRuns(state.header.client).map(r => r.text).join('').trim();
  return name.split(/\s+/)[0] || '';
}

function defaultMessage(state) {
  const first = clientFirstName(state);
  return `Olá${first ? ' ' + first : ''}! Segue em anexo o seu plano alimentar. Qualquer dúvida, disponha.\n\n${NUTRITIONIST.name}\n${NUTRITIONIST.title}`;
}

function download() {
  const a = document.createElement('a');
  a.href = current.url;
  a.download = current.file.name;
  document.body.append(a);
  a.click();
  a.remove();
  onDone();
}

// Número português de 9 dígitos recebe o indicativo 351.
function normalizePhone(raw) {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) d = '351' + d;
  return d;
}

function setStatus(msg) {
  $('.status').textContent = msg;
}

export async function openExport(state, done) {
  onDone = done;
  const name = fileName(state);
  $('.file-name').textContent = name;
  $('#msg').value = defaultMessage(state);
  $('.preview').classList.add('loading');
  $('iframe').removeAttribute('src');
  setStatus('');
  $('#btn-share').hidden = true;
  dlg.showModal();

  try {
    const blob = await pdfBlob(state);
    const file = new File([blob], name, { type: 'application/pdf' });
    if (current) URL.revokeObjectURL(current.url);
    current = { blob, file, url: URL.createObjectURL(blob) };
    $('iframe').src = current.url + '#view=FitH';
    $('#btn-share').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  } catch (err) {
    console.error(err);
    setStatus('Ocorreu um erro ao gerar o PDF.');
  } finally {
    $('.preview').classList.remove('loading');
  }
}

$('#btn-close').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

$('#btn-download').addEventListener('click', () => current && download());

// O PDF já está pronto antes do clique, para não perder o "gesto" exigido pelo Safari.
$('#btn-share').addEventListener('click', async () => {
  if (!current) return;
  try {
    await navigator.share({ files: [current.file], title: current.file.name, text: $('#msg').value });
    onDone();
  } catch (err) {
    if (err.name !== 'AbortError') setStatus('Não foi possível partilhar. Use as opções abaixo.');
  }
});

$('#btn-whatsapp').addEventListener('click', () => {
  if (!current) return;
  const phone = normalizePhone($('#phone').value);
  if ($('#phone').value && phone.length < 11) return setStatus('Verifique o número de telemóvel.');
  download();
  const text = encodeURIComponent($('#msg').value);
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener');
  setStatus('PDF descarregado. Arraste-o dos Transferências para a conversa do WhatsApp.');
});

$('#btn-email').addEventListener('click', () => {
  if (!current) return;
  const to = $('#email').value.trim();
  download();
  const subject = encodeURIComponent(current.file.name.replace(/\.pdf$/, ''));
  const body = encodeURIComponent($('#msg').value);
  location.href = `mailto:${to.replace(/[^\w.+@-]/g, '')}?subject=${subject}&body=${body}`;
  setStatus('PDF descarregado. Anexe-o ao email que abriu (arraste-o dos Transferências).');
});

dlg.addEventListener('close', () => {
  $('iframe').removeAttribute('src');
});
