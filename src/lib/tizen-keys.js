// Samsung Tizen TV remote key registration and keycode definitions

export const TV_KEYS = {
  RETURN: 10009,
  ENTER: 13,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  CHANNEL_UP: 427,
  CHANNEL_DOWN: 428,
  MEDIA_PLAY_PAUSE: 10252,
  MEDIA_PLAY: 415,
  MEDIA_PAUSE: 19,
  MEDIA_STOP: 413,
  INFO: 457,
  SEARCH: 10225,
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406,
  GUIDE: 458,
};

export function registerTizenKeys() {
  if (typeof window === 'undefined') return;

  const tizen = window.tizen;
  if (!tizen || !tizen.tvinputdevice) return;

  const keysToRegister = [
    'ChannelUp',
    'ChannelDown',
    'MediaPlayPause',
    'MediaPlay',
    'MediaPause',
    'MediaStop',
    'Info',
    'Search',
    'ColorF0Red',
    'ColorF1Green',
    'ColorF2Yellow',
    'ColorF3Blue',
    'Guide',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
  ];

  keysToRegister.forEach((keyName) => {
    try {
      tizen.tvinputdevice.registerKey(keyName);
    } catch {
      // Ignore unsupported keys on different Tizen versions
    }
  });
}

export function exitTizenApp() {
  if (typeof window !== 'undefined' && window.tizen && window.tizen.application) {
    try {
      window.tizen.application.getCurrentApplication().exit();
      return true;
    } catch (e) {
      console.warn('Failed to exit Tizen app:', e);
    }
  }
  return false;
}
