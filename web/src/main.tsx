import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { applyMode, applyTheme, savedMode, savedTheme, applyTextSize, savedTextSize } from './lib/theme';
import { applyElderLink, savedMenuLang } from './lib/menulang';
import { canonicalUrl } from './lib/google';

// one address for everyone (sign-in sessions are kept per address)
const canon = canonicalUrl(location.href);
if (canon) location.replace(canon);

applyMode(savedMode());
applyTextSize(savedTextSize());
document.documentElement.dataset.menu = savedMenuLang();
// an elder's invitation link: larger text (and Tamil menus if asked) on their phone
applyElderLink();
applyTheme(savedTheme());

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
