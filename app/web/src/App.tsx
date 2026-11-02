import { Route, Routes } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Booking } from './pages/Booking';
import { Login } from './pages/Login';
import { ClientApp } from './pages/ClientApp';
import { AdminPanel } from './pages/admin/AdminPanel';
import { ProClients, ProPanel } from './pages/ProPanel';
import { Checkin, Club, NotFound, PaymentStatus } from './pages/Misc';
import { PublicLayout } from './components/Shell';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicLayout><Landing /></PublicLayout>} />
      <Route path="/agendar" element={<PublicLayout><Booking /></PublicLayout>} />
      <Route path="/clube" element={<Club />} />
      <Route path="/entrar" element={<Login />} />
      <Route path="/app" element={<ClientApp />} />
      <Route path="/app/:section" element={<ClientApp />} />
      <Route path="/pro" element={<ProPanel />} />
      <Route path="/pro/clientes" element={<ProClients />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/admin/:section" element={<AdminPanel />} />
      <Route path="/checkin/:token" element={<Checkin />} />
      <Route path="/pagamento/:id" element={<PaymentStatus />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
