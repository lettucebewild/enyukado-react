import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';

// TODO as you convert more pages, add them here:
// import AdminDashboard from './pages/AdminDashboard.jsx';
// import AdminLogin from './pages/AdminLogin.jsx';

function Placeholder({ name }) {
  return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>{name} — not converted yet.</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/admin" element={<Placeholder name="Admin Dashboard" />} />
      <Route path="/admin-login" element={<Placeholder name="Admin Login" />} />
    </Routes>
  );
}
