import { useEffect, useState } from 'react';

/**
 * Hook to detect whether the virtual on-screen keyboard is active on mobile devices.
 * Combines window.visualViewport height shrink detection with input focus tracking.
 *
 * Returns `true` only when on a mobile/touch device AND the virtual keyboard is open.
 * Returns `false` by default, or when on desktop, or when keyboard is closed.
 */
export function useVirtualKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const checkIsMobile = () =>
      window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640;

    const updateKeyboardState = () => {
      if (!checkIsMobile()) {
        setIsKeyboardOpen(false);
        return;
      }

      // 1. Check visualViewport height delta (reliable on modern iOS/Android)
      let isShrunk = false;
      if (window.visualViewport) {
        const diff = window.innerHeight - window.visualViewport.height;
        // On mobile, on-screen keyboards are at least 120px tall
        if (diff > 120) {
          isShrunk = true;
        }
      }

      // 2. Check if an editable input/textarea inside the document currently has focus
      const activeEl = document.activeElement;
      const isInputFocused = Boolean(
        activeEl &&
          (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
          activeEl.type !== 'button' &&
          activeEl.type !== 'submit' &&
          activeEl.type !== 'checkbox' &&
          activeEl.type !== 'radio' &&
          activeEl.type !== 'file'
      );

      setIsKeyboardOpen(isShrunk || isInputFocused);
    };

    // Initial check
    updateKeyboardState();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateKeyboardState);
      window.visualViewport.addEventListener('scroll', updateKeyboardState);
    }
    window.addEventListener('resize', updateKeyboardState);
    window.addEventListener('focusin', updateKeyboardState);

    const handleFocusOut = () => {
      // Small timeout so if focus transfers between inputs, it doesn't flicker
      setTimeout(updateKeyboardState, 60);
    };
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateKeyboardState);
        window.visualViewport.removeEventListener('scroll', updateKeyboardState);
      }
      window.removeEventListener('resize', updateKeyboardState);
      window.removeEventListener('focusin', updateKeyboardState);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return isKeyboardOpen;
}

export default useVirtualKeyboard;

