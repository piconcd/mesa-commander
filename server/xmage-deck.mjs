// Convert Mesa's {name, cmd: [name], list: [{n, q}]} to Nexus deck DTO.
// The caller supplies a trusted server-side deck, never a client game state.
export function toNexusDeck(deck) {
  if (!deck || !Array.isArray(deck.cmd) || !Array.isArray(deck.list)) throw new Error('Invalid Mesa deck');
  const nameOf = n => {
    if (typeof n !== 'string' || !n.trim() || n.length > 250) throw new Error('Invalid card name');
    return n.trim();
  };
  const commanders = deck.cmd.map(nameOf);
  if (commanders.length < 1 || commanders.length > 2 || new Set(commanders.map(n=>n.toLowerCase())).size !== commanders.length) throw new Error('Explicit commander(s) required');
  const entries = new Map();
  for (const row of deck.list) {
    const n = nameOf(row?.n);
    const amount = row.q ?? row.qty ?? row.count ?? row.amount;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100) throw new Error('Invalid card quantity: ' + n);
    const key = n.toLowerCase();
    const old = entries.get(key);
    if (old) old.amount += amount;
    else entries.set(key, {cardName:n, amount});
  }
  // Mesa decks may already omit the commander from the library. Nexus expects
  // explicit commanders and will move them to the sideboard itself.
  for (const n of commanders) {
    const key = n.toLowerCase();
    const row = entries.get(key);
    if (row && --row.amount === 0) entries.delete(key);
  }
  const cards = [...entries.values()];
  if (cards.reduce((sum,c)=>sum+c.amount,commanders.length) !== 100) throw new Error('Commander deck must contain exactly 100 cards including commanders');
  return {name: typeof deck.name === 'string' ? deck.name.slice(0,120) : 'Mesa Commander', cards, sideboard:[], commanders: commanders.map(cardName=>({cardName,amount:1}))};
}

// Nexus validation is advisory upstream, but Mesa must refuse unknown cards,
// silent printing substitutions and a validator that is not ready.
export async function validateNexusDeck(request, deck, {deckType, gameType} = {}) {
  if (!deckType || !gameType) throw new Error('Exact XMage format and game type required');
  const payload = toNexusDeck(deck);
  const report = await request('validateDeck', {deck:payload});
  if (report?.ready !== true || !Array.isArray(report.missing) || !Array.isArray(report.mismatches)) throw new Error('XMage card catalog is not ready');
  if (report.missing.length || report.mismatches.length) throw new Error('XMage deck has unsupported cards or mismatched printings');
  // Preserve the explicit commanders. The proxy resolves blank printings
  // using its own catalog and applies its own Commander validator.
  const format = await request('validateDeckFormat', {deck:payload,deckType,gameType});
  if (format?.ready !== true || format.supported !== true || format.valid !== true) throw new Error('XMage rejected Commander deck format');
  return payload;
}
