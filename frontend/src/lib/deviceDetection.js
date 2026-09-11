/**
 * Utilitas deteksi perangkat & terminal cerdas untuk pemantauan sesi pengguna.
 * Menghasilkan informasi sistem operasi, browser, tipe perangkat,
 * serta nama ramah perangkat (friendly device name).
 */

const DEVICE_NAME_KEY = 'sap_assistant_device_name';

export function getDeviceFriendlyName() {
  try {
    return localStorage.getItem(DEVICE_NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function setDeviceFriendlyName(name) {
  try {
    if (name) {
      localStorage.setItem(DEVICE_NAME_KEY, name.trim());
    } else {
      localStorage.removeItem(DEVICE_NAME_KEY);
    }
  } catch {
    /* localStorage tidak tersedia */
  }
}

export function detectBrowserAndOS() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      os: 'Web Client',
      browser: 'Web Browser',
      deviceType: 'desktop',
      screenResolution: 'N/A',
    };
  }

  const ua = navigator.userAgent || '';
  const uaLower = ua.toLowerCase();

  // 1. Deteksi Sistem Operasi
  let os = 'OS Lainnya';
  if (uaLower.includes('iphone') || uaLower.includes('ipod')) {
    os = 'iOS';
  } else if (uaLower.includes('ipad')) {
    os = 'iPadOS';
  } else if (uaLower.includes('android')) {
    os = 'Android';
  } else if (uaLower.includes('windows nt 10.0') || uaLower.includes('windows')) {
    os = 'Windows';
  } else if (uaLower.includes('macintosh') || uaLower.includes('mac os')) {
    os = 'macOS';
  } else if (uaLower.includes('linux')) {
    os = 'Linux';
  }

  // 2. Deteksi Tipe Perangkat (Desktop, Mobile, Tablet)
  let deviceType = 'desktop';
  const isTouch = navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;

  if (uaLower.includes('ipad') || (os === 'macOS' && isTouch) || uaLower.includes('tablet')) {
    deviceType = 'tablet';
  } else if (uaLower.includes('mobi') || uaLower.includes('iphone') || (uaLower.includes('android') && isSmallScreen)) {
    deviceType = 'mobile';
  } else {
    deviceType = 'desktop';
  }

  // 3. Deteksi Browser
  let browser = 'Web Browser';
  if (uaLower.includes('edg/')) {
    browser = 'Edge';
  } else if (uaLower.includes('opr/') || uaLower.includes('opera/')) {
    browser = 'Opera';
  } else if (uaLower.includes('chrome/') && !uaLower.includes('edg/')) {
    browser = 'Chrome';
  } else if (uaLower.includes('safari/') && !uaLower.includes('chrome/')) {
    browser = 'Safari';
  } else if (uaLower.includes('firefox/')) {
    browser = 'Firefox';
  }

  // 4. Resolusi Layar
  const screenResolution = `${window.screen?.width || window.innerWidth}x${window.screen?.height || window.innerHeight}`;

  return {
    os,
    browser,
    deviceType,
    screenResolution,
  };
}

export function getClientDeviceInfo() {
  const { os, browser, deviceType, screenResolution } = detectBrowserAndOS();
  const savedFriendlyName = getDeviceFriendlyName();

  let deviceName = savedFriendlyName;
  if (!deviceName) {
    if (deviceType === 'mobile') {
      deviceName = `HP ${os} (${browser})`;
    } else if (deviceType === 'tablet') {
      deviceName = `Tablet ${os} (${browser})`;
    } else {
      deviceName = `PC ${os} (${browser})`;
    }
  }

  return {
    device_name: deviceName,
    device_type: deviceType,
    os,
    browser,
    screen_resolution: screenResolution,
  };
}

