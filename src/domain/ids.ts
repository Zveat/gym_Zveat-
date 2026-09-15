/** Stable, sortable-ish ids that work offline without a server round trip. */
let counter = 0;

export function newId(prefix = 'id'): string {
  counter = (counter + 1) % 0xffff;
  const time = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xfffff).toString(36);
  return `${prefix}_${time}${counter.toString(36)}${rand}`;
}

export function todayString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nowStamp(d: Date = new Date()): string {
  return d.toISOString();
}
