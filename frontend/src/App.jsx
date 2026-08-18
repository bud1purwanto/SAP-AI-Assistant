import React, { useState, useEffect } from 'react';
import ChatLayout from './components/ChatLayout';
import LoginModal from './components/LoginModal';

const API_BASE_URL = 'http://127.0.0.1:8000';
const THEME_KEY = 'sap_assistant_theme';
const USER_KEY = 'sap_assistant_user';
const GUEST_DATE_KEY = 'sap_assistant_guest_date';

function App() {
  // User Authentication state (defaults to Guest user if not logged in)
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem(USER_KEY);
      return savedUser ? JSON.parse(savedUser) : { username: 'Guest', role: 'user' };
    } catch {
      return { username: 'Guest', role: 'user' };
    }
  });

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginCustomMessage, setLoginCustomMessage] = useState('');

  // Theme state
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'light';
    } catch {
      return 'light';
    }
  });

  // MCP Servers state - 'sap' = SAP default, 'sap:<alias>' = sub-server spesifik. RAG selalu aktif.
  const [selectedServer, setSelectedServer] = useState('sap');
  const [mcpServers, setMcpServers] = useState({});

  const fetchMcpServers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/mcp/servers`);
      if (res.ok) {
        const data = await res.json();
        setMcpServers(data || {});
      }
    } catch (err) {
      console.error("Gagal mengambil status server MCP:", err);
    }
  };

  useEffect(() => {
    fetchMcpServers();
  }, []);

  // Sessions & Messages state (dengan session-isolated memory & thinking tracking)
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  // messagesMap menyimpan pesan per session_id: { [sessionId]: Array<Message>, 'new': Array<Message> }
  const [messagesMap, setMessagesMap] = useState({});
  // thinkingMap mencatat proses thinking per session_id: { [sessionId]: boolean, 'new': boolean }
  const [thinkingMap, setThinkingMap] = useState({});
  // Status loading saat fetch riwayat session dari database
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  // Guest prompt tracking
  const [guestPromptDate, setGuestPromptDate] = useState(() => {
    try {
      return localStorage.getItem(GUEST_DATE_KEY) || '';
    } catch {
      return '';
    }
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const guestUsedToday = guestPromptDate === todayStr;

  // Apply Theme
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Ambil pesan dan status thinking untuk sesi yang sedang aktif
  const currentSessionKey = activeSessionId || 'new';
  const currentMessages = messagesMap[currentSessionKey] || [];
  const isCurrentThinking = !!thinkingMap[currentSessionKey];

  // Fetch sessions when logged-in user changes
  const fetchSessions = async (username) => {
    if (!username || username === 'Guest') {
      setSessions([]);
      setActiveSessionId(null);
      setMessagesMap({});
      return;
    }
    try {
      const res = await fetch('http://127.0.0.1:8000/api/sessions', {
        headers: { 'X-User-Name': username }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0) {
          // Select most recent session by default if none selected
          if (!activeSessionId) {
            selectSession(data[0].session_id, username);
          }
        } else {
          setActiveSessionId(null);
        }
      }
    } catch (err) {
      console.error("Gagal mengambil sesi:", err);
    }
  };

  const selectSession = async (sessionId, usernameOverride) => {
    const targetUser = usernameOverride || user?.username;
    if (!targetUser || targetUser === 'Guest') return;
    
    // Ganti activeSessionId seketika
    setActiveSessionId(sessionId);

    // Jika pesan belum ada di cache lokal, aktifkan loader halus
    if (!messagesMap[sessionId]) {
      setIsLoadingSession(true);
    }
    
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/sessions/${sessionId}/messages`, {
        headers: { 'X-User-Name': targetUser }
      });
      if (res.ok) {
        const data = await res.json();
        const formatted = data.map(m => {
          let sources = [];
          if (m.sources) {
            try {
              sources = typeof m.sources === 'string' ? JSON.parse(m.sources) : m.sources;
            } catch (e) {
              sources = [];
            }
          }
          return {
            role: (m.role === 'user' || m.sender === 'user') ? 'user' : 'ai',
            content: m.content,
            sources: sources
          };
        });
        
        setMessagesMap(prev => ({
          ...prev,
          [sessionId]: formatted
        }));
      }
    } catch (err) {
      console.error("Gagal mengambil pesan sesi:", err);
    } finally {
      setIsLoadingSession(false);
    }
  };

  useEffect(() => {
    if (user?.username && user.username !== 'Guest') {
      fetchSessions(user.username);
    } else {
      setMessagesMap({});
      setActiveSessionId(null);
    }
  }, [user]);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setIsLoginModalOpen(false);
    setLoginCustomMessage('');
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } catch {}
    fetchSessions(userData.username);
  };

  const handleLogout = () => {
    const guestUser = { username: 'Guest', role: 'user' };
    setUser(guestUser);
    setSessions([]);
    setActiveSessionId(null);
    setMessagesMap({});
    setThinkingMap({});
    try {
      localStorage.removeItem(USER_KEY);
    } catch {}
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessagesMap(prev => ({
      ...prev,
      'new': []
    }));
  };

  const handleDeleteSession = async (sessionId) => {
    if (!user?.username || user.username === 'Guest') return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'X-User-Name': user.username }
      });
      if (res.ok) {
        const updated = sessions.filter(s => s.session_id !== sessionId);
        setSessions(updated);
        setMessagesMap(prev => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
        setThinkingMap(prev => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
        if (activeSessionId === sessionId) {
          if (updated.length > 0) {
            selectSession(updated[0].session_id);
          } else {
            handleNewChat();
          }
        }
      }
    } catch (err) {
      console.error("Gagal menghapus sesi:", err);
    }
  };

  const handleSendMessage = async (text) => {
    const isLoggedIn = user?.username && user.username !== 'Guest';

    // Cek limit Guest Mode (1 prompt/hari)
    if (!isLoggedIn) {
      if (guestUsedToday) {
        setLoginCustomMessage('Anda telah mencapai batas 1 prompt gratis per hari untuk Guest. Silakan login untuk melanjutkan tanpa batas!');
        setIsLoginModalOpen(true);
        return;
      }
    }

    const sessionKey = activeSessionId || 'new';
    const existingMessages = messagesMap[sessionKey] || [];
    
    // Optimistic update pada session yang spesifik
    const newMessages = [...existingMessages, { role: 'user', content: text }];
    setMessagesMap(prev => ({
      ...prev,
      [sessionKey]: newMessages
    }));

    // Set thinking HANYA untuk session ini
    setThinkingMap(prev => ({
      ...prev,
      [sessionKey]: true
    }));

    const history = existingMessages.map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Name': user.username,
          'X-User-Role': user.role
        },
        body: JSON.stringify({ 
          message: text, 
          history,
          session_id: activeSessionId,
          server: selectedServer
        })
      });

      if (!response.ok) {
        throw new Error("Gagal terhubung ke backend server.");
      }

      const data = await response.json();
      const serverSessionId = data.session_id;
      
      const finalMessages = [...newMessages, { 
        role: 'ai', 
        content: data.reply,
        sources: data.sources
      }];

      setMessagesMap(prev => {
        const next = { ...prev };
        // Jika sesi baru dibuat dari 'new'
        if (sessionKey === 'new' && serverSessionId) {
          delete next['new'];
          next[serverSessionId] = finalMessages;
        } else {
          next[sessionKey] = finalMessages;
        }
        return next;
      });

      // Catat penggunaan prompt Guest hari ini
      if (!isLoggedIn) {
        setGuestPromptDate(todayStr);
        try {
          localStorage.setItem(GUEST_DATE_KEY, todayStr);
        } catch {}
      } else {
        // Jika sesi baru dibuat dan sebelumnya ada di 'new'
        if (serverSessionId && (!activeSessionId || sessionKey === 'new')) {
          setActiveSessionId(serverSessionId);
          fetchSessions(user.username);
        }
      }

    } catch (error) {
      const errorMessages = [...newMessages, { 
        role: 'ai', 
        content: `**Error:** ${error.message}\n\nMohon periksa apakah server backend berjalan di http://localhost:8000.`
      }];
      setMessagesMap(prev => ({
        ...prev,
        [sessionKey]: errorMessages
      }));
    } finally {
      setThinkingMap(prev => {
        const next = { ...prev };
        delete next[sessionKey];
        return next;
      });
    }
  };

  const handleClearChat = () => {
    const sessionKey = activeSessionId || 'new';
    setMessagesMap(prev => ({
      ...prev,
      [sessionKey]: []
    }));
  };

  return (
    <>
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onLoginSuccess={handleLoginSuccess}
        onGuestContinue={() => setIsLoginModalOpen(false)}
        customMessage={loginCustomMessage}
        onClose={() => setIsLoginModalOpen(false)}
      />
      
      <ChatLayout
        messages={currentMessages}
        isThinking={isCurrentThinking}
        isLoadingSession={isLoadingSession}
        onSendMessage={handleSendMessage}
        onClearChat={handleClearChat}
        theme={theme}
        onToggleTheme={toggleTheme}
        user={user}
        onLogout={handleLogout}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={selectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        guestUsedToday={guestUsedToday}
        onOpenLogin={() => {
          setLoginCustomMessage('');
          setIsLoginModalOpen(true);
        }}
        selectedServer={selectedServer}
        onSelectServer={setSelectedServer}
        mcpServers={mcpServers}
        onRefreshMcpServers={fetchMcpServers}
      />
    </>
  );
}

export default App;