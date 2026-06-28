import React from 'react';
import {
  getCatalogState,
  installCatalogStoreGlobals,
  refreshCatalog,
  subscribeCatalog,
} from './academicCatalogStore.js';

const AcademicCatalogContext = React.createContext(getCatalogState());

export function useAcademicCatalog() {
  return React.useContext(AcademicCatalogContext);
}

export function AcademicCatalogProvider({ children }) {
  const [catalog, setCatalog] = React.useState(getCatalogState);

  React.useEffect(() => {
    installCatalogStoreGlobals();

    const sync = () => setCatalog(getCatalogState());
    const unsubscribe = subscribeCatalog(sync);

    const onWindowEvent = () => sync();
    window.addEventListener('aiiens:catalog-updated', onWindowEvent);

    refreshCatalog().catch((error) => {
      console.warn('[AcademicCatalogProvider] initial refresh failed:', error);
    });

    return () => {
      unsubscribe();
      window.removeEventListener('aiiens:catalog-updated', onWindowEvent);
    };
  }, []);

  return (
    <AcademicCatalogContext.Provider value={catalog}>{children}</AcademicCatalogContext.Provider>
  );
}
