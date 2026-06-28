import { appPages } from '../../pages/pageRegistry.js';
import LegacyHtmlPage from './LegacyHtmlPage.jsx';
import {
  floatingBlocks,
  modalBlocks,
  shellBlocks,
} from './sharedUiRegistry.js';

function DynamicBlockList({ blocks }) {
  return blocks.map((block) => (
    <LegacyHtmlPage key={block.id} html={block.html} />
  ));
}

function AppHeader() {
  return (
    <header className="aiiens-global-header" aria-label="AIIENS EDU">
      <div className="aiiens-global-brand">AIIENS EDU</div>
    </header>
  );
}

export default function LegacyAppShell() {
  return (
    <main className="aimeasy-app page-layout">
      <AppHeader />
      <DynamicBlockList blocks={shellBlocks} />
      <DynamicBlockList blocks={appPages} />
      <DynamicBlockList blocks={floatingBlocks} />
      <DynamicBlockList blocks={modalBlocks} />
      <div className="adsense-banner google-ad-banner"></div>
      <footer className="site-footer footer">@2025 AIIENS Edu All Rights Reserved</footer>
    </main>
  );
}
