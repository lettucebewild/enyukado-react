import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getConversations,
  getThread,
  sendMessage,
  searchUsers,
} from '../api/messagesApi.js';
import { getUser } from '../api/usersApi.js';
import AppHeader from './AppHeader.jsx';
import './MessagesPanel.css';

const BOT_ID = 4;

function timeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initialsOf(name) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function MessagesPanel({ initialUserID, initialUserName, token, myUserID, onBack, headerProps }) {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [activeID, setActiveID] = useState(initialUserID || null);
  const [activeName, setActiveName] = useState(initialUserName || null);
  const [activeSub, setActiveSub] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);
  const searchTimer = useRef(null);
  const textareaRef = useRef(null);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const convs = await getConversations(token);
      setConversations(Array.isArray(convs) ? convs : []);
    } catch {
      /* ignore */
    }
  }, [token]);

  const loadThread = useCallback(async (userID) => {
    if (!userID || !token) return;
    try {
      const msgs = await getThread(userID, token);
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeID) loadThread(activeID);
  }, [activeID, loadThread]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadConversations();
      if (activeID) loadThread(activeID);
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [activeID, loadConversations, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (!activeID || activeID === BOT_ID) {
      setActiveSub(activeID === BOT_ID ? 'Enyukado · Automated Notifications' : '');
      return;
    }
    getUser(activeID)
      .then((u) => {
        const sub = [u.Course, u.Year, u.CampusArea].filter(Boolean).join(' · ');
        setActiveSub(sub || 'NU Manila Student');
        // opened straight from the URL (refresh / shared link): no name was passed in
        const full = [u.FirstName, u.LastName].filter(Boolean).join(' ');
        if (full) setActiveName((n) => n || full);
      })
      .catch(() => {});
  }, [activeID]);

  function openThread(userID, name) {
    setActiveID(userID);
    setActiveName(name);
    setSearchOpen(false);
    setSearchQuery('');
    // keep the address bar in step with the open conversation (no extra history entry)
    navigate(`/messages/${userID}`, { replace: true, state: { userName: name } });
  }

  function handleSearchInput(q) {
    setSearchQuery(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setSearchOpen(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const users = await searchUsers(q.trim(), token);
        setSearchResults(Array.isArray(users) ? users : []);
        setSearchOpen(true);
      } catch {
        /* ignore */
      }
    }, 300);
  }

  function handleImageSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  async function handleSend() {
    const content = input.trim();
    if ((!content && !imageFile) || !activeID) return;
    setInput('');
    if (textareaRef.current) autoResize(textareaRef.current);

    const formData = new FormData();
    formData.append('receiverID', activeID);
    if (content) formData.append('content', content);
    if (imageFile) formData.append('messageImage', imageFile);
    removeImage();

    try {
      await sendMessage(formData, token);
      loadThread(activeID);
      loadConversations();
    } catch {
      /* ignore */
    }
  }

  function goToProfile() {
    if (!activeID || activeID === BOT_ID) return;
    if (String(activeID) === String(myUserID)) navigate('/profile');
    else navigate(`/profile?id=${activeID}`);
  }

  let lastDate = null;

  return (
    <div className="fullpanel-overlay">
      <AppHeader {...headerProps} active="messages" onBack={onBack} title="💬 Messages" />

      <div className="fullpanel-body" style={{ display: 'flex', minHeight: 0 }}>
        {/* Conversation list */}
        <div className="conv-list">
          <div className="conv-list-header">
            <div className="conv-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                type="text"
                placeholder="Find or start a conversation…"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
              />
              {searchOpen && (
                <div className="conv-search-results open">
                  {searchResults.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: '0.82rem', color: 'var(--charcoal-3)' }}>No students found.</div>
                  ) : (
                    searchResults.map((u) => (
                      <div
                        key={u.UserID}
                        className="conv-search-result-item"
                        onClick={() => openThread(u.UserID, `${u.FirstName} ${u.LastName}`)}
                      >
                        <div className="conv-search-avatar">{(u.FirstName[0] + u.LastName[0]).toUpperCase()}</div>
                        <div>
                          <div className="conv-search-name">{u.FirstName} {u.LastName}</div>
                          <div className="conv-search-sub">{[u.Course, u.Year].filter(Boolean).join(' · ') || 'NU Manila'}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="conv-section-label">{conversations.length ? 'Recent' : ''}</div>
          <div>
            {conversations.length === 0 ? (
              <div className="conv-empty">No conversations yet.<br />Find or start one above!</div>
            ) : (
              conversations.map((c) => {
                const isBot = c.OtherUserID === BOT_ID;
                const initials = isBot ? '🤖' : (c.OtherFirstName[0] + c.OtherLastName[0]).toUpperCase();
                const name = `${c.OtherFirstName} ${c.OtherLastName}`;
                const preview = c.LastImageURL ? '📷 Image' : (c.LastMessage
                  ? (c.LastMessage.length > 32 ? c.LastMessage.slice(0, 32) + '…' : c.LastMessage)
                  : 'Start the conversation');
                return (
                  <div
                    key={c.OtherUserID}
                    className={`conv-item${activeID === c.OtherUserID ? ' active' : ''}`}
                    onClick={() => openThread(c.OtherUserID, name)}
                  >
                    <div className="conv-avatar" style={isBot ? { background: 'linear-gradient(135deg,#326fca,#4e87d4)', fontSize: '0.9rem' } : undefined}>
                      {initials}
                    </div>
                    <div className="conv-info">
                      <div className="conv-name">{name}</div>
                      <div className="conv-last-msg">{preview}</div>
                    </div>
                    <div className="conv-meta">
                      {c.LastMessageDate && <div className="conv-time">{timeAgo(new Date(c.LastMessageDate))}</div>}
                      {c.UnreadCount > 0 && <div className="conv-unread">{c.UnreadCount}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="msg-thread">
          {!activeID ? (
            <div className="msg-thread-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dde2ec" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              <span style={{ color: 'var(--charcoal-3)', fontSize: '0.9rem' }}>Select a conversation to start messaging</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="msg-thread-header">
                <div
                  className="msg-thread-header-avatar"
                  style={activeID === BOT_ID ? { background: 'linear-gradient(135deg,#326fca,#4e87d4)', cursor: 'default', fontSize: '0.85rem' } : undefined}
                  onClick={activeID === BOT_ID ? undefined : goToProfile}
                >
                  {activeID === BOT_ID ? '🤖' : initialsOf(activeName || '')}
                </div>
                <div className="msg-thread-header-info">
                  <div
                    className="msg-thread-header-name"
                    style={activeID === BOT_ID ? { cursor: 'default' } : undefined}
                    onClick={activeID === BOT_ID ? undefined : goToProfile}
                  >
                    {activeName}
                  </div>
                  <div className="msg-thread-header-sub">{activeSub}</div>
                </div>
              </div>

              <div className="msg-messages">
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--charcoal-3)', fontSize: '0.84rem', padding: 32 }}>Say hi! 👋</div>
                ) : (
                  messages.map((m, i) => {
                    const isMine = m.SenderID === myUserID;
                    const isBot = m.SenderID === BOT_ID;
                    const msgDate = new Date(m.DateSent);
                    const dateStr = msgDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                    const time = msgDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
                    const showDateSep = dateStr !== lastDate;
                    lastDate = dateStr;
                    const initials = isMine ? '' : isBot ? '🤖' : initialsOf(activeName || '');
                    return (
                      <div key={m.MessageID || i}>
                        {showDateSep && <div className="msg-date-sep">{dateStr}</div>}
                        <div className={`msg-bubble-row ${isMine ? 'mine' : 'theirs'}`}>
                          {!isMine && (
                            <div
                              className="msg-row-avatar"
                              style={isBot ? { background: 'linear-gradient(135deg,#326fca,#4e87d4)', cursor: 'default', fontSize: '0.85rem' } : undefined}
                              onClick={isBot ? undefined : goToProfile}
                            >
                              {initials}
                            </div>
                          )}
                          <div className="msg-bubble">
                            {m.ImageURL ? (
                              <img src={m.ImageURL} className="msg-image" onClick={() => setLightbox(m.ImageURL)} alt="Image" />
                            ) : (m.Content || '')}
                          </div>
                        </div>
                        <div className="msg-time-row" style={{ justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                          <span>{time}</span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {imagePreview && (
                <div className="msg-img-preview-wrap show">
                  <img src={imagePreview} className="msg-img-preview" alt="preview" />
                  <button className="msg-img-preview-remove" onClick={removeImage}>✕</button>
                </div>
              )}

              <div className="msg-input-row">
                <div className="msg-input-wrap">
                  <textarea
                    ref={textareaRef}
                    placeholder="Type a message…"
                    rows={1}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <div className="msg-input-action-wrap">
                    <button className="msg-input-action" title="Send image" type="button">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                      <input type="file" accept="image/*" onChange={handleImageSelected} />
                    </button>
                  </div>
                </div>
                <button className="msg-send-btn" onClick={handleSend}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div className="msg-lightbox" style={{ display: 'flex' }} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Full" />
        </div>
      )}
    </div>
  );
}
