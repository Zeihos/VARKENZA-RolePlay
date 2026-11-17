'use strict';
// VARKENZA test economy; the bridge is trusted and loopback-only.
const FUEL_CAPACITY = 60; // alpha units, not real-world litres
const FUEL_COST = 4; // in-game $ per fuel unit
const FUEL_BURN_INTERVAL_MS = 45_000;
const VEHICLE_WEAR_PER_TICK = 2;
// Alpha workshop near the Los Santos repair district. Gameplay uses the same coordinates.
const REPAIR_STATION = Object.freeze({ x:1024.7, y:-1024.9, z:32.1, radius:20 });
const REPAIR_COST_PER_50_HP = 25;
function repairPrice(health) {
  if (!Number.isInteger(health) || health < 250 || health > 1000) throw new RangeError('Invalid vehicle health');
  return Math.ceil((1000 - health) / 50) * REPAIR_COST_PER_50_HP;
}
function validStation(body, station) {
  const coords = ['x','y','z'].map(k=> Number(body[k]));
  const [x,y,z] = coords;
  return coords.every(Number.isFinite) && Math.hypot(x-station.x,y-station.y,z-station.z) <= station.radius &&
    String(body.interior)==='0' && String(body.world)==='0';
}
const FUEL_STATION = Object.freeze({ x:1004.0, y:-937.0, z:42.2, radius:18 });
function vehicleState(v) {
  const fuel = Number.isInteger(v.fuel) && v.fuel >= 0 && v.fuel <= FUEL_CAPACITY ? v.fuel : FUEL_CAPACITY;
  const health = Number.isInteger(v.health) && v.health >= 250 && v.health <= 1000 ? v.health : 1000;
  return {fuel, health, locked: typeof v.locked === 'boolean' ? v.locked : true};
}
module.exports = { FUEL_CAPACITY, FUEL_COST, FUEL_BURN_INTERVAL_MS, VEHICLE_WEAR_PER_TICK, FUEL_STATION, REPAIR_STATION, REPAIR_COST_PER_50_HP, repairPrice, validStation, vehicleState };
