/**
 * Background Keep-Alive & Notification Utilities
 *
 * 1. Screen Wake Lock API:
 *    Mencegah layar HP/laptop mati/sleep selama proses AI berpikir & streaming.
 *
 * 2. Silent Audio Keep-Alive (Web Audio API):
 *    Memutar buffer hening volume 0 agar browser mobile (Chrome, Samsung Internet, Safari)
 *    tidak men-suspend atau membekukan thread JavaScript saat tab di-minimize/background.
 *
 * 3. Web Notification API:
 *    Mengirim notifikasi ketika AI selesai menjawab jika tab sedang di-minimize/background.
 */

class BackgroundKeepaliveManager {
  constructor() {
    this.wakeLock = null;
    this.audioContext = null;
    this.silentOscillator = null;
    this.silentGainNode = null;
    this.isActive = false;
  }

  /** Request notification permission jika belum diminta */
  async requestNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'default') {
      try {
        return await Notification.requestPermission();
      } catch (e) {
        console.warn('[Keepalive] Notification permission error:', e);
        return Notification.permission;
      }
    }
    return Notification.permission;
  }

  /** Aktifkan WakeLock & Silent Audio Keepalive saat proses streaming dimulai */
  async startKeepalive() {
    this.isActive = true;

    // 1. Screen Wake Lock
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        if (!this.wakeLock) {
          this.wakeLock = await navigator.wakeLock.request('screen');
          this.wakeLock.addEventListener('release', () => {
            this.wakeLock = null;
          });
        }
      } catch (err) {
        // WakeLock bisa ditolak jika baterai sangat rendah atau tab tidak aktif
        console.debug('[Keepalive] Screen wake lock unavailable:', err?.message);
      }
    }

    // 2. Silent Web Audio (khusus browser mobile agar tab tidak dibekukan OS)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && !this.audioContext) {
        this.audioContext = new AudioCtx();
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume().catch(() => {});
        }
        // Buat oscillator hening (gain 0.00001 agar tidak bersuara sama sekali)
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.00001, this.audioContext.currentTime);
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start();
        this.silentOscillator = osc;
        this.silentGainNode = gain;
      }
    } catch (err) {
      console.debug('[Keepalive] Web Audio keepalive unavailable:', err?.message);
    }
  }

  /** Hentikan WakeLock & Audio saat streaming selesai */
  async stopKeepalive() {
    this.isActive = false;

    // Release Wake Lock
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch (_) {}
      this.wakeLock = null;
    }

    // Stop & close silent audio
    if (this.silentOscillator) {
      try {
        this.silentOscillator.stop();
        this.silentOscillator.disconnect();
      } catch (_) {}
      this.silentOscillator = null;
    }
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch (_) {}
      this.audioContext = null;
    }
  }

  /**
   * Kirim notifikasi browser jika tab sedang diminimize / tersembunyi
   */
  notifyWhenHidden({ title, body, icon = '/favicon.ico', onClick = null }) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return; // Hanya notifikasi jika tab sedang di-minimize/background

    try {
      const notif = new Notification(title, {
        body,
        icon,
        tag: 'ai-assistant-reply',
        renotify: true,
      });

      notif.onclick = () => {
        window.focus();
        if (typeof onClick === 'function') onClick();
        notif.close();
      };
    } catch (err) {
      console.debug('[Keepalive] Notification trigger error:', err);
    }
  }
}

export const keepaliveManager = new BackgroundKeepaliveManager();
