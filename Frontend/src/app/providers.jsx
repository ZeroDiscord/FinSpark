import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '../context/AuthContext.jsx'
import { TenantProvider } from '../context/TenantContext.jsx'

export default function AppProviders({ children }) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          {children}
          <Toaster
            position="top-right"
            richColors
            theme="dark"
            toastOptions={{
              className:
                'border border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur-xl',
            }}
          />
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
