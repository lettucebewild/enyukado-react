import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';

import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import Terms from './pages/Terms.jsx';
import Privacy from './pages/Privacy.jsx';

function Placeholder({ name }) {
  return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>{name} — not converted yet.</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      {/* Dashboard is the shell for the browse page and for the full-page views
          that sit on top of it. Each view has its own URL, so the address bar,
          refresh, the back button and shared links all work. */}
      <Route element={<Dashboard />}>
        <Route path="/dashboard" />
        <Route path="/product/:productId" />
        <Route path="/messages" />
        <Route path="/messages/:userId" />
        <Route path="/cart" />
        <Route path="/sell" />
      </Route>
      <Route path="/profile" element={<Profile />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin-login" element={<AdminLogin />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
    </Routes>
  );
}
