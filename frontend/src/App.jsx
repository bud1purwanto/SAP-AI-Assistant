import React from 'react';
import ChatLayout from './components/ChatLayout';
import PWAPrompt from './components/PWAPrompt';

/**
 * Shell aplikasi.
 *
 * State percakapan dan sesi dikelola di ChatLayout.
 * PWAPrompt menangani instalasi Progressive Web App untuk mobile/desktop.
 */
function App() {
  return (
    <>
      <ChatLayout />
      <PWAPrompt />
    </>
  );
}

export default App;