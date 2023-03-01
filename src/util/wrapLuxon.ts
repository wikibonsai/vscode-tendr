const luxon = require('luxon');

export function printISONowDate(now: luxon.DateTime=luxon.DateTime.now()) {
  /* eslint-disable indent */
  const date = luxon.DateTime.local(now)          // current time
                             .toISODate();        // in iso
  /* eslint-enable indent */
  return date;
}

export function printISONowTimestamp(now: luxon.DateTime=luxon.DateTime.now()) {
  /* eslint-disable indent */
  const time = luxon.DateTime.local(now)          // current time
                             .toISO()             // in iso
                             .replace('T', ' ');  // using space delimeters
  /* eslint-enable indent */
  return time.substr(0,19) +
          ' ' +
          time.substr(23, time.length);           // remove milliseconds
}
