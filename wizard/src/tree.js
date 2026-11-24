// A quick preview of the tree from the sheet's records: families as nested couples, plus anyone not linked.
// Pure, so tests/wizard.test.mjs can check it.

/**
 * rec: { persons, links, partners } from rowsToRecords().
 * Returns { roots: Node[], loose: Person[], generations, living, passed }
 * Node = { person, spouses: [{ person, ownFamily }], children: Node[], depth }
 * A spouse with parents in the sheet has `ownFamily: true` (they also appear under their parents).
 */
export function buildPreview(rec) {
  const byId = new Map(rec.persons.map((p) => [p.id, p]));
  const parentsOf = new Map(), childrenOf = new Map(), spousesOf = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(v)) m.get(k).push(v); };
  for (const l of rec.links) if (byId.has(l.child_id) && byId.has(l.parent_id)) { push(parentsOf, l.child_id, l.parent_id); push(childrenOf, l.parent_id, l.child_id); }
  for (const p of rec.partners) if (byId.has(p.person_a) && byId.has(p.person_b)) { push(spousesOf, p.person_a, p.person_b); push(spousesOf, p.person_b, p.person_a); }

  const hasParents = (id) => (parentsOf.get(id) || []).length > 0;
  const order = (ids) => [...ids].sort((a, b) => String(byId.get(a).sort_key || '9999').localeCompare(String(byId.get(b).sort_key || '9999')));
  const placed = new Set();      // people shown somewhere (as a node or beside their spouse)
  const asNode = new Set();      // people shown with their own line (spouses with parents also get one, under their parents)
  const expanded = new Set();    // people whose children have been listed
  let generations = 0;

  const node = (id, depth) => {
    placed.add(id); asNode.add(id);
    generations = Math.max(generations, depth + 1);
    const spouses = (spousesOf.get(id) || []).map((s) => { placed.add(s); return { person: byId.get(s), ownFamily: hasParents(s) }; });
    const kids = new Set();
    for (const who of [id, ...(spousesOf.get(id) || [])]) {
      if (expanded.has(who)) continue;
      expanded.add(who);
      for (const c of childrenOf.get(who) || []) kids.add(c);
    }
    const children = order([...kids].filter((c) => !asNode.has(c))).map((c) => (asNode.has(c) ? null : node(c, depth + 1))).filter(Boolean);
    return { person: byId.get(id), spouses, children, depth };
  };

  // founders: no parents in the sheet, and not married to someone who has parents (they're shown beside them)
  const founders = order(rec.persons.map((p) => p.id).filter((id) => !hasParents(id) && !(spousesOf.get(id) || []).some(hasParents)));
  const roots = [];
  for (const id of founders) {
    if (placed.has(id)) continue;   // already shown beside their husband or wife
    if (!(childrenOf.get(id) || []).length && !(spousesOf.get(id) || []).some((s) => (childrenOf.get(s) || []).length) && !(spousesOf.get(id) || []).length) continue; // alone: listed as loose
    roots.push(node(id, 0));
  }
  // anyone still not shown (e.g. a loop in the sheet) starts their own branch
  for (const p of rec.persons) if (!asNode.has(p.id) && hasParents(p.id)) roots.push(node(p.id, 0));
  const loose = rec.persons.filter((p) => !placed.has(p.id));

  return {
    roots, loose, generations,
    living: rec.persons.filter((p) => p.is_living).length,
    passed: rec.persons.filter((p) => !p.is_living).length,
  };
}

export const fullName = (p) => [p.given_name, p.surname].filter(Boolean).join(' ');
