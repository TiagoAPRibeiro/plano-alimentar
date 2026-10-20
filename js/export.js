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
  $('.wa-web').hidden = true;
}

export async function openExport(state, done) {
  onDone = done;
  const name = fileName(state);
  $('.file-name').textContent = name;
  $('#msg').value = defaultMessage(state);
  // limpos a cada plano, para nunca enviar para o cliente anterior
  $('#phone').value = '';
  $('#email').value = '';
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

// No Safari, abrir logo a app (WhatsApp/Mail) cancela a descarga que acabou de começar.
// Espera um momento para o PDF chegar às Transferências e só depois abre a app.
function downloadThenOpen(url) {
  download();
  setTimeout(() => { location.href = url; }, 1200);
}

function fail(input, msg) {
  setStatus(msg);
  input.focus();
}

// Descarrega o PDF e abre a app WhatsApp na conversa do número, com a mensagem já escrita.
// O PDF não pode seguir sozinho (um site não consegue anexar ficheiros noutra app):
// a nutricionista arrasta-o das Transferências para a conversa.
$('#btn-whatsapp').addEventListener('click', () => {
  if (!current) return;
  const phone = normalizePhone($('#phone').value);
  if (phone.length < 11) return fail($('#phone'), 'Indique o número de telemóvel do cliente.');
  const text = encodeURIComponent($('#msg').value);
  downloadThenOpen(`whatsapp://send?phone=${phone}&text=${text}`);
  setStatus('PDF descarregado. Na conversa que abriu, arraste o PDF das Transferências (↓ no Safari) e envie.');
  $('.wa-web').href = `https://wa.me/${phone}?text=${text}`;
  $('.wa-web').hidden = false;
});

$('#btn-email').addEventListener('click', () => {
  if (!current) return;
  const to = $('#email').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail($('#email'), 'Indique o email do cliente.');
  const subject = encodeURIComponent(current.file.name.replace(/\.pdf$/, ''));
  const body = encodeURIComponent($('#msg').value);
  downloadThenOpen(`mailto:${to}?subject=${subject}&body=${body}`);
  setStatus('PDF descarregado. No email que abriu, arraste o PDF das Transferências (↓ no Safari) e envie.');
});

// Enter no campo carrega no botão ao lado
$('#phone').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-whatsapp').click(); });
$('#email').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-email').click(); });

dlg.addEventListener('close', () => {
  $('iframe').removeAttribute('src');
});
