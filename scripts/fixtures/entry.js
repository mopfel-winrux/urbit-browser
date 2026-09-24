import Thing, { greet } from './lib.js';
const p = document.createElement('p'); p.id = 'entry'; p.textContent = 'entry:' + greet(Thing.name); document.body.appendChild(p);
