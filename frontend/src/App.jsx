import React from 'react';
import ChatLayout from './components/ChatLayout';
import PWAPrompt from './components/PWAPrompt';
import { LanguageProvider } from './hooks/useLanguage';

/**
 * Shell aplikasi.
 *
 * State percakapan dan sesi dikelola di ChatLayout.
 * LanguageProvider mengelola bahasa antarmuka (i18n).
 * PWAPrompt menangani instalasi Progressive Web App untuk mobile/desktop.
 */
function App() {
  return (
    <LanguageProvider>
      <ChatLayout />
      <PWAPrompt />
    </LanguageProvider>
  );
}

export default App;