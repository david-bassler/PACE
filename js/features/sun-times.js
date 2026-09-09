import {
  nextSolarEvent,
  remainingHoursMinutes
} from './sun-times-domain.js';

const POSITION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 6 * 60 * 60 * 1000
};

let coordinates = null;
let row = null;
let timer = null;

function installStyles() {
  if (document.querySelector('style[data-pace-sun-times]')) return;

  const style = document.createElement('style');
  style.dataset.paceSunTimes = 'true';
  style.textContent = `
    .sun-times-row{
      min-height:25px;
      display:flex;
      align-items:center;
      justify-content:flex-start;
      padding:4px 5px 0;
      color:#5d7781;
      font-size:.76rem;
      line-height:1.25;
      font-variant-numeric:tabular-nums;
    }
    .sun-times-row[hidden]{display:none}
    .sun-times-label{white-space:nowrap}
  `;
  document.head.appendChild(style);
}

function createRow() {
  const hero = document.querySelector('.hero');
  if (!hero) return false;

  row = document.createElement('div');
  row.className = 'sun-times-row';
  row.hidden = true;
  row.setAttribute('aria-live', 'polite');

  hero.insertAdjacentElement('beforebegin', row);
  return true;
}

function formatClock(date) {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatRemaining(now, at) {
  const { hours, minutes } = remainingHoursMinutes(now, at);
  const hourLabel = hours === 1 ? 'Std.' : 'Std.';
  return `${hours} ${hourLabel} ${minutes} Min.`;
}

function render() {
  if (!row || !coordinates) return;

  const now = new Date();
  const event = nextSolarEvent(now, coordinates.latitude, coordinates.longitude);
  if (!event) {
    row.hidden = true;
    return;
  }

  const label = event.kind === 'sunrise' ? 'Sonnenaufgang' : 'Sonnenuntergang';
  row.textContent = `${label} ${formatClock(event.at)} (${formatRemaining(now, event.at)})`;
  row.hidden = false;
}

function startClock() {
  clearInterval(timer);
  render();
  timer = setInterval(render, 60000);
}

function usePosition(position) {
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  coordinates = { latitude, longitude };
  startClock();
}

function positionFailed() {
  if (row) row.hidden = true;
}

export function initSunTimesFeature() {
  installStyles();
  if (!createRow()) return;

  if (!navigator.geolocation) {
    positionFailed();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    usePosition,
    positionFailed,
    POSITION_OPTIONS
  );

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && coordinates) render();
  });
}
