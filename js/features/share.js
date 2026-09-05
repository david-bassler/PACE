import { $, emptyMessage, openDialog } from '../core/ui.js';

// This feature deliberately uses the current browser URL at click time, so it
// also works correctly if PACE is ever hosted below a different path.
function renderCurrentUrlQr() {
  const target = $('qrCode');
  const url = window.location.href;
  target.innerHTML = '';
  $('qrUrl').textContent = url;

  if (!window.QRCode) {
    target.appendChild(emptyMessage('Der QR-Code-Generator ist noch nicht geladen. Bitte kurz online neu laden.'));
    return;
  }

  new window.QRCode(target, {
    text: url,
    width: 256,
    height: 256,
    correctLevel: window.QRCode.CorrectLevel.M
  });
}

export function initShareFeature() {
  $('qrButton').addEventListener('click', () => {
    renderCurrentUrlQr();
    openDialog('qrDialog');
  });
}
