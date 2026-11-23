import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Spinner, ToastProvider } from '@medfinder/web-shared';
import { AuthProvider, useAuth } from './auth';
import Layout from './Layout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Pharmacies from './pages/Pharmacies';
import Patients from './pages/Patients';
import Orders from './pages/Orders';
import Complaints from './pages/Complaints';
import AppControl from './pages/AppControl';
import Medicines from './pages/Medicines';
import Settings from './pages/Settings';

function App() {
  const { admin, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!admin) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="pharmacies" element={<Pharmacies />} />
        <Route path="pharmacies/:id" element={<Pharmacies />} />
        <Route path="patients" element={<Patients />} />
        <Route path="orders" element={<Orders />} />
        <Route path="complaints" element={<Complaints />} />
        <Route path="app-control" element={<AppControl />} />
        <Route path="medicines" element={<Medicines />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider><App /></AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
