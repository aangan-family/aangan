import { useEffect, useState } from 'react';
import { isInstalled, platform, promptInstall } from '../lib/app';
import { Sheet } from './common';
import { AppSteps } from './GetTheApp';
import { useT } from '../lib/menulang';

/** Menu → "Add to home screen": the website opens like an app on Android and iPhone, no app store needed. */
export function InstallApp({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(isInstalled());
  useEffect(() => { const f = () => setInstalled(true); window.addEventListener('appinstalled', f); return () => window.removeEventListener('appinstalled', f); }, []);
  if (installed) return null;
  async function start() {
    if (await promptInstall()) { setInstalled(true); onDone?.(); return; }
    setOpen(true);
  }
  return (
    <>
      <button className="installbtn" onClick={start}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M12 7.5v7M9 11.5l3 3 3-3" /></svg>
        {t('Add to home screen')}</button>
      {open && (
        <Sheet title="Add to your home screen." sub="The family website then opens like an app, full screen, with its own icon. No app store needed." onClose={() => setOpen(false)}
          footer={<button className="btn primary" onClick={() => setOpen(false)}>Done</button>}>
          <AppSteps p={platform()} />
        </Sheet>
      )}
    </>
  );
}
