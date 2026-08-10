/**
 * Haptic feedback utility using Web Vibration API
 */
export function triggerHaptic(type: 'success' | 'warning' | 'light' | 'click' = 'light', enabled = true): boolean {
  if (!enabled || typeof window === 'undefined' || !('vibrate' in navigator)) {
    return false;
  }

  try {
    switch (type) {
      case 'success':
        // Two crisp pulses on sign detection success
        return navigator.vibrate([35, 50, 35]);
      case 'warning':
        return navigator.vibrate([50, 100, 50, 100, 50]);
      case 'click':
        return navigator.vibrate(15);
      case 'light':
      default:
        return navigator.vibrate(20);
    }
  } catch {
    // Ignore permissions or non-supported devices
    return false;
  }
}

export function triggerTermFeedback(enabled = true) {
  if (!enabled || triggerHaptic('success', true) || typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 620;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.09);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch {
    // Audio feedback is best effort when the browser blocks autoplay.
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
