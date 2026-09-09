const DEG = Math.PI / 180;
const SOLAR_ALTITUDE = -0.833 * DEG;

function utcDayStart(date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
}

function dayOfYearUtc(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((utcDayStart(date).getTime() - start) / 86400000) + 1;
}

function fractionalYear(dayOfYear) {
  return (2 * Math.PI / 365) * (dayOfYear - 1);
}

function equationOfTime(gamma) {
  return 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );
}

function solarDeclination(gamma) {
  return (
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.001480 * Math.sin(3 * gamma)
  );
}

function hourAngle(latitude, declination) {
  const phi = latitude * DEG;
  const denominator = Math.cos(phi) * Math.cos(declination);
  if (Math.abs(denominator) < 1e-12) return null;

  const cosine = (
    Math.sin(SOLAR_ALTITUDE) -
    Math.sin(phi) * Math.sin(declination)
  ) / denominator;

  if (cosine < -1 || cosine > 1) return null;
  return Math.acos(cosine) / DEG;
}

function dateFromUtcMinutes(dayStart, minutes) {
  return new Date(dayStart.getTime() + minutes * 60000);
}

export function solarEventsForDate(date, latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }

  const dayStart = utcDayStart(date);
  const gamma = fractionalYear(dayOfYearUtc(dayStart));
  const eqTime = equationOfTime(gamma);
  const declination = solarDeclination(gamma);
  const angle = hourAngle(lat, declination);
  if (angle === null) return null;

  const solarNoonUtcMinutes = 720 - 4 * lon - eqTime;
  return {
    sunrise: dateFromUtcMinutes(dayStart, solarNoonUtcMinutes - 4 * angle),
    sunset: dateFromUtcMinutes(dayStart, solarNoonUtcMinutes + 4 * angle)
  };
}

export function nextSolarEvent(now, latitude, longitude) {
  const current = new Date(now);
  if (!Number.isFinite(current.getTime())) return null;

  const base = utcDayStart(current);
  const candidates = [];

  // Include yesterday because extreme longitudes can move a civil-date event
  // across a UTC date boundary. Four forward days are enough for ordinary
  // latitudes while keeping the calculation tiny.
  for (let offset = -1; offset <= 4; offset += 1) {
    const day = new Date(base.getTime() + offset * 86400000);
    const events = solarEventsForDate(day, latitude, longitude);
    if (!events) continue;
    candidates.push(
      { kind: 'sunrise', at: events.sunrise },
      { kind: 'sunset', at: events.sunset }
    );
  }

  return candidates
    .filter(event => event.at.getTime() > current.getTime())
    .sort((left, right) => left.at - right.at)[0] || null;
}

export function remainingHoursMinutes(now, future) {
  const diff = Math.max(0, new Date(future).getTime() - new Date(now).getTime());
  const totalMinutes = Math.ceil(diff / 60000);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60
  };
}
