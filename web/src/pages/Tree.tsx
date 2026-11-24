import { useStore } from '../lib/store';
import { Banyan } from '../components/Banyan';
import { SearchBox, go } from '../components/common';
import { useTreeList } from '../components/TreeList';
import { MeCard } from '../components/MeCard';
import { HelpTip } from '../components/Help';
import { Gopuram } from '../components/Gopuram';
import { useHeritage } from '../components/Heritage';
import { useMemo } from 'react';
import { fullName } from '../lib/format';

/** The whole family tree on one screen: built for phones first. */
export function Tree({ focusId }: { focusId?: string }) {
  const { south } = useHeritage();
  const { snap, family, myId } = useStore();
  const counts = useMemo(() => Array.from({ length: family.maxGen }, (_, i) => snap.persons.filter((p) => family.gen.get(p.id) === i + 1).length), [family, snap.persons]);
  const mine = myId ? family.gen.get(myId) : undefined;
  const founders = snap.persons.filter((p) => family.gen.get(p.id) === 1).map((p) => fullName(p)).join(' and ');
  const describe = (g: number) => (g === 1 ? founders : g === mine ? 'Your generation.' : '');
  const tree = useTreeList({ current: focusId || null, onPick: (id) => go('p/' + id), roomy: true });
  return (
    <div className="wrap treepage">
      <section className="tree-hero">
        <h2 className="headline">Family tree.<HelpTip sections={['tree', 'corrections']} /></h2>
        <p className="subhead">{snap.persons.length} people across {family.maxGen} generations. Tap a name to open their page, or the arrow to see their children.</p>
      </section>
      <div className="treegopuram">{south ? <Gopuram counts={counts} mine={mine} describe={describe} /> : <Banyan counts={counts} mine={mine} describe={describe} />}</div>
      <MeCard compact />
      <div className="treebar">
        <div className="tsearch"><SearchBox placeholder="Find someone in the tree…" onPick={(id) => go('p/' + id)} /></div>
        <div className="treebtns">
          {tree.hasMe && <button className="pill small" onClick={tree.showMe}>Show me</button>}
          <button className="btn" onClick={tree.expandAll}>Expand all</button>
          <button className="btn" onClick={tree.collapse}>Collapse</button>
        </div>
      </div>
      <div className="treecard">{tree.el}</div>
      <p className="uphint">Highlighted: <span className="legend mine">you</span> <span className="legend line">your line</span>. Numbers show how many descendants are folded away.{snap.signedIn && <> <span className="sdot on" aria-hidden="true" /> on the site <span className="sdot off" aria-hidden="true" /> not yet.</>}</p>
    </div>
  );
}
