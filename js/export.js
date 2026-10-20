// Janela de pré-visualização e envio do PDF.
import { NUTRITIONIST, APP_VERSION } from './config.js';
import { pdfBlob, fileName } from './pdf.js';
import { toRuns } from './richtext.js';

const dlg = document.getElementById('export');
const $ = sel => dlg.querySelector(sel);

let current = null; // { blob, file, url }
let onDone = () => {};

$('.version').textContent = `Versão ${APP_VERSION}`;

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
    const share = canShareFile();
    $('#btn-share').hidden = !share;
    $('.share-note').hidden = !share;
    $('.wa-row').hidden = share;
    $('.divider span').textContent = share ? 'ou por email' : 'ou abrir a conversa';
    $('.no-share-note').hidden = share;
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

const canShareFile = () => !!(current && navigator.canShare && navigator.canShare({ files: [current.file] }));

// Partilha só o ficheiro: com ficheiro + texto juntos, o WhatsApp para Mac envia apenas o texto.
// A mensagem vai para a área de transferência, para colar na conversa.
// O PDF já está pronto antes do clique e nada é aguardado antes do share(), para não perder
// o "gesto" do utilizador exigido pelo Safari.
async function shareFile() {
  const msg = $('#msg').value.trim();
  // share() é chamado primeiro: o Safari só permite uma ação por clique e o PDF é o essencial.
  const sharing = navigator.share({ files: [current.file] });
  const copied = msg && navigator.clipboard ? navigator.clipboard.writeText(msg).then(() => true, () => false) : Promise.resolve(false);
  try {
    await sharing;
    onDone();
    setStatus(await copied
      ? 'PDF enviado. A mensagem foi copiada: cole-a na conversa com ⌘V.'
      : 'PDF enviado. Pode copiar a mensagem acima e colá-la na conversa.');
  } catch (err) {
    if (err.name !== 'AbortError') setStatus(`Não foi possível partilhar (${err.name}). Descarregue o PDF e arraste-o para a conversa.`);
  }
}

$('#btn-share').addEventListener('click', () => current && shareFile());

$('#btn-whatsapp').addEventListener('click', () => {
  if (!current) return;
  // Com partilha disponível (Mac), é a única forma de o PDF seguir anexado: escolher WhatsApp na lista.
  if (canShareFile()) return shareFile();
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
