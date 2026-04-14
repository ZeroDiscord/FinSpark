/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react';

const TenantContext = createContext(null);

const TENANT_KEY = 'fs_active_tenant';

export function TenantProvider({ children }) {
  const [activeTenant, setActiveTenantState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TENANT_KEY)); } catch { return null; }
  });

  const setActiveTenant = useCallback((tenant) => {
    if (tenant) {
      localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
    } else {
      localStorage.removeItem(TENANT_KEY);
    }
    setActiveTenantState(tenant);
  }, []);

  return (
    <TenantContext.Provider value={{ activeTenant, setActiveTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenantContext must be used within TenantProvider');
  return ctx;
}
