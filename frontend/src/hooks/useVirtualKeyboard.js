import { useEffect, useState } from 'react';

/**
 * Hook to detect whether the virtual on-screen keyboard is active on mobile devices.
 * 
 * Fundamental Rule:
 * An on-screen virtual keyboard CANNOT be open unless an editable text field
 * (input/textarea) is actively focused.
 * 
 * Therefore:
 * 1. If NO text input is focused: Keyboard is guaranteed closed -> returns `false`.
 *    (This prevents false positives from browser chrome bars like iOS Safari's URL/tab bars).
 * 2. If a text input IS focused on a mobile/touch device: Keyboard is open -> returns `true`.
 * 3. On desktop devices (fine pointer / mouse): Always returns `false`.
 */
export function useVirtualKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const isTouchDevice = () =>
      window.matchMedia('(pointer: coarse)').matches ||
      window.innerWidth < 768 ||
      Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

    const updateKeyboardState = () => {
      // 1. On desktop devices, virtual keyboard is never active
      if (!isTouchDevice()) {
        setIsKeyboardOpen(false);
        return;
      }

      // 2. Check if an editable input/textarea currently has focus
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

      // If NO text field is focused, the virtual keyboard is definitely closed!
      // This ensures that when the modal first opens, it is ALWAYS centered.
      if (!isInputFocused) {
        setIsKeyboardOpen(false);
        return;
      }

      // If an input IS focused on mobile/touch, the user has opened the on-screen keyboard
      setIsKeyboardOpen(true);
    };

    // Initial check (guaranteed false on modal open because no input is focused yet)
    updateKeyboardState();

    window.addEventListener('focusin', updateKeyboardState);

    const handleFocusOut = () => {
      // Small delay so moving focus between inputs (e.g. username -> password) doesn't flicker
      setTimeout(updateKeyboardState, 80);
    };
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      window.removeEventListener('focusin', updateKeyboardState);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return isKeyboardOpen;
}

export default useVirtualKeyboard;
