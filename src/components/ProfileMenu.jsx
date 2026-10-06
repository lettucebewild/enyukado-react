import { useEffect, useRef, useState } from 'react';

export default function ProfileMenu({ initials, profileImage, onProfile, onChangePassword, onLogout }) {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="avatar-menu-wrap" ref={ref}>
      <button className="avatar-btn" title="My account" onClick={() => setOpen((o) => !o)}>
        {profileImage && !imageFailed ? <img src={profileImage} alt="" onError={() => setImageFailed(true)} /> : initials}
      </button>
      <div className={`avatar-dropdown${open ? ' open' : ''}`}>
        <button className="avatar-dropdown-item" onClick={() => { setOpen(false); onProfile(); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          Profile
        </button>
        <button className="avatar-dropdown-item" onClick={() => { setOpen(false); onChangePassword(); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
          Change password
        </button>
        <div className="avatar-dropdown-sep" />
        <button className="avatar-dropdown-item danger" onClick={() => { setOpen(false); onLogout(); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          Logout
        </button>
      </div>
    </div>
  );
}
