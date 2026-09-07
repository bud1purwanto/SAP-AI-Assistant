import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Membersihkan teks markdown menjadi teks narasi polos yang nyaman dibacakan
 * oleh mesin Text-to-Speech (TTS).
 */
export function cleanMarkdownForSpeech(text) {
  if (!text || typeof text !== 'string') return '';

  let clean = text;

  // 1. Buang blok kode program
  clean = clean.replace(/```[\s\S]*?```/g, ' [Kode program terlampir] ');

  // 2. Buang inline code
  clean = clean.replace(/`([^`]+)`/g, '$1');

  // 3. Buang blok action-card JSON atau artefak
  clean = clean.replace(/```(?:json:action-card|action-card)[\s\S]*?```/gi, ' [Draf konfirmasi terlampir] ');

  // 4. Bersihkan tabel markdown
  clean = clean.replace(/\|[^\n]+\|/g, (match) => {
    if (/\|[\s\-:]+\|/.test(match)) return '';
    const cells = match
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    return cells.join(', ') + '. ';
  });

  // 5. Buang gambar dan tautan
  clean = clean.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  clean = clean.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // 6. Buang penanda header (#, ##, ###)
  clean = clean.replace(/^#{1,6}\s+/gm, '');

  // 7. Buang format bold/italic
  clean = clean.replace(/(\*\*|__)(.*?)\1/g, '$2');
  clean = clean.replace(/(\*|_)(.*?)\1/g, '$2');

  // 8. Buang bullet list dashes/asterisks
  clean = clean.replace(/^[\*\-\+]\s+/gm, '');
  clean = clean.replace(/^\d+\.\s+/gm, '');

  // 9. Buang blockquote (>)
  clean = clean.replace(/^>\s+/gm, '');

  // 10. Normalisasi spasi berlebih
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

export function useTextToSpeech({ language = 'id' } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const voicesRef = useRef([]);

  // Muat daftar suara saat siap
  useEffect(() => {
    if (!isSupported) return;

    const updateVoices = () => {
      try {
        voicesRef.current = window.speechSynthesis.getVoices() || [];
      } catch {
        voicesRef.current = [];
      }
    };

    updateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, [isSupported]);

  // Hentikan suara saat unmount
  useEffect(() => {
    return () => {
      if (isSupported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Abaikan
        }
      }
    };
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Abaikan
    }
    setIsSpeaking(false);
    setIsPaused(false);
    setActiveMessageId(null);
  }, [isSupported]);

  const pause = useCallback(() => {
    if (!isSupported) return;
    try {
      window.speechSynthesis.pause();
      setIsPaused(true);
    } catch {
      // Abaikan
    }
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    try {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } catch {
      // Abaikan
    }
  }, [isSupported]);

  const speak = useCallback((text, messageId = null, forceLang = null) => {
    if (!isSupported || !text) return;

    // Jika sedang berbicara untuk pesan yang sama, toggle pause / resume
    if (isSpeaking && activeMessageId === messageId) {
      if (isPaused) {
        resume();
      } else {
        pause();
      }
      return;
    }

    // Hentikan ujaran sebelumnya jika ada
    stop();

    const narration = cleanMarkdownForSpeech(text);
    if (!narration) return;

    const targetLang = forceLang || (language === 'en' ? 'en-US' : 'id-ID');
    const utterance = new SpeechSynthesisUtterance(narration);

    const voices = voicesRef.current.length > 0
      ? voicesRef.current
      : (window.speechSynthesis.getVoices() || []);

    const matchedVoice = voices.find((v) => {
      const vLang = (v.lang || '').toLowerCase();
      if (targetLang.startsWith('id')) {
        return vLang.startsWith('id') || v.name.toLowerCase().includes('indonesia');
      }
      return vLang.startsWith('en');
    });

    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }
    utterance.lang = matchedVoice?.lang || targetLang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
      setActiveMessageId(messageId);
    };

    utterance.onpause = () => {
      setIsPaused(true);
    };

    utterance.onresume = () => {
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setActiveMessageId(null);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setActiveMessageId(null);
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('SpeechSynthesis error:', err);
      setIsSpeaking(false);
      setIsPaused(false);
      setActiveMessageId(null);
    }
  }, [isSupported, isSpeaking, isPaused, activeMessageId, language, resume, pause, stop]);

  return {
    isSupported,
    isSpeaking,
    isPaused,
    activeMessageId,
    speak,
    pause,
    resume,
    stop,
  };
}

