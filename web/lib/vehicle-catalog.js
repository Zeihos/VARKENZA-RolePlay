'use strict';
// Fixed, server-side alpha dealership catalog; prices cannot be provided by clients.
const catalog = Object.freeze([
  Object.freeze({ model: 410, name: 'Manana', price: 2500 }),
  Object.freeze({ model: 436, name: 'Previon', price: 4200 }),
  Object.freeze({ model: 492, name: 'Greenwood', price: 6500 }),
  Object.freeze({ model: 445, name: 'Admiral', price: 9000 }),
]);
const findModel = model => catalog.find(v => v.model === model);
const sellPrice = price => Math.floor(price * 0.7);
const MAX_GARAGE_SLOTS = 3;
// The initial dealership/garage spawn point in Los Santos.
const DEPOT = Object.freeze({ x: 1548.9, y: -1679.2, z: 13.15, a: 90, interior: 0, world: 0 });
module.exports = { catalog, findModel, sellPrice, MAX_GARAGE_SLOTS, DEPOT };
