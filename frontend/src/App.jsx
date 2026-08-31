import React from 'react';
import ChatLayout from './components/ChatLayout';
import PWAPrompt from './components/PWAPrompt';
import { LanguageProvider } from './hooks/useLanguage';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled React Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#0F172A',
          color: '#F8FAFC',
          fontFamily: 'sans-serif',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '500px',
            backgroundColor: '#1E293B',
            padding: '32px',
            borderRadius: '16px',
            border: '1px solid #334155',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px', color: '#F87171' }}>
              Terjadi Kesalahan Tampilan (UI Error)
            </h2>
            <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '20px' }}>
              {this.state.error?.message || 'Gagal memuat komponen halaman.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  backgroundColor: '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Muat Ulang (Reload)
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  backgroundColor: '#334155',
                  color: '#CBD5E1',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Reset Cache
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Shell aplikasi.
 *
 * State percakapan dan sesi dikelola di ChatLayout.
 * LanguageProvider mengelola bahasa antarmuka (i18n).
 * PWAPrompt menangani instalasi Progressive Web App untuk mobile/desktop.
 */
function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ChatLayout />
        <PWAPrompt />
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;