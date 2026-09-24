// external script fetched through the host: uses fetch + promises
fetch('/data.json').then(function (r) { return r.json(); }).then(function (rows) {
  var p = document.createElement('p');
  p.textContent = 'fetched: ' + rows.length + ' rows';
  document.getElementById('app').appendChild(p);
}).catch(function (e) { console.error('fetch failed', e.message); });
