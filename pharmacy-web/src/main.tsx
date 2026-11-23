import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';

// GitHub Pages can't serve index.html for deep links, so static builds use #/ URLs.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;
import { Spinner, ToastProvider } from '@medfinder/web-shared';
import { AuthProvider, useAuth } from './auth';
import Layout from './Layout';
import AuthPage from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Stock from './pages/Stock';
import ImportStock from './pages/ImportStock';
import Orders from './pages/Orders';
import Subscription from './pages/Subscription';
import Profile from './pages/Profile';

function App() {
  const { pharmacy, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!pharmacy) return <AuthPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<Orders />} />
        <Route path="stock" element={<Stock />} />
        <Route path="stock/import" element={<ImportStock />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </Router>
  </StrictMode>,
);
