/**
 * Salin teks ke clipboard secara universal (mendukung HTTPS, HTTP, iOS Safari, dan PWA).
 */
export const copyToClipboard = async (text) => {
  if (!text) return false;

  // 1. Coba Modern Clipboard API jika tersedia & konteks aman
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Modern navigator.clipboard gagal, beralih ke fallback execCommand:', err);
    }
  }

  // 2. Fallback untuk non-HTTPS / Safari iOS / PWA / browser lama
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-9999px';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.setAttribute('readonly', '');

    document.body.appendChild(textArea);

    // Khusus iOS Safari
    if (navigator.userAgent.match(/ipad|iphone/i)) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      textArea.setSelectionRange(0, 999999);
    } else {
      textArea.focus();
      textArea.select();
    }

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback execCommand copy gagal:', err);
    return false;
  }
};

export default copyToClipboard;
