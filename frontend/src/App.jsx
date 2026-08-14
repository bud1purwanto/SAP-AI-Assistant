import React, { useState, useEffect } from 'react';
import ChatLayout from './components/ChatLayout';

const STORAGE_KEY = 'sap_assistant_chat';
const THEME_KEY = 'sap_assistant_theme';
// Role tetap; dropdown pemilih role sudah dihapus. Backend RBAC hanya menolak "Guest".
const USER_ROLE = 'Production';

function App() {
  // Theme state tersimpan di localStorage
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'light';
    } catch {
      return 'light';
    }
  });

  // Muat riwayat chat dari localStorage saat pertama render.
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isThinking, setIsThinking] = useState(false);

  // Simpan & terapkan theme ke document root + localStorage
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

  // Simpan setiap perubahan chat ke localStorage agar tidak hilang saat refresh.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* abaikan kalau storage penuh/diblokir */
    }
  }, [messages]);

  const handleSendMessage = async (text) => {
    // Optimistic update
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setIsThinking(true);

    // Kirim riwayat sebelumnya sebagai konteks (map ke format backend).
    const history = messages.map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content
    }));

    try {
      // Panggil backend FastAPI
      const response = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': USER_ROLE
        },
        body: JSON.stringify({ message: text, history })
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Access Denied: You don't have permission to perform this action.");
        }
        throw new Error("Failed to connect to the server.");
      }

      const data = await response.json();
      
      setMessages([...newMessages, { 
        role: 'ai', 
        content: data.reply,
        sources: data.sources
      }]);
    } catch (error) {
      setMessages([...newMessages, { 
        role: 'ai', 
        content: `**Error:** ${error.message}\n\nPlease check if the backend is running on http://localhost:8000 and you have selected a valid role.`
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* abaikan */
    }
  };

  return (
    <ChatLayout
      messages={messages}
      isThinking={isThinking}
      onSendMessage={handleSendMessage}
      onClearChat={handleClearChat}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
}

export default App;