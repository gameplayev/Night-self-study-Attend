export interface DeviceIdentity {
  id: string;
  label: string;
}

// 화면에 보이는 기기 이름은 브라우저가 가진 비식별 정보로 만들고,
// 실제 기기 신원은 서버가 발급한 HttpOnly 쿠키로 따로 관리한다.
function browserDeviceLabel() {
  const userAgent = window.navigator.userAgent;
  const platform = detectPlatform(userAgent);
  const browser = detectBrowser(userAgent);
  const viewport = `${window.screen.width}x${window.screen.height}`;
  const input = window.navigator.maxTouchPoints > 0 ? 'touch' : 'pointer';
  return `${platform} · ${browser} · ${viewport} · ${input}`;
}

function detectPlatform(userAgent: string) {
  if (/iPad|Macintosh/.test(userAgent) && window.navigator.maxTouchPoints > 1) {
    return 'iPadOS';
  }
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Mac OS X/.test(userAgent)) return 'macOS';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Linux/.test(userAgent)) return 'Linux';
  return window.navigator.platform || 'Unknown OS';
}

function detectBrowser(userAgent: string) {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/CriOS\//.test(userAgent) || /Chrome\//.test(userAgent)) return 'Chrome';
  if (/FxiOS\//.test(userAgent) || /Firefox\//.test(userAgent)) return 'Firefox';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Browser';
}

// 서버가 브라우저별 장기 기기 쿠키를 만들고, 프론트에는 표시용 ID만 돌려준다.
export async function getCurrentDevice(): Promise<DeviceIdentity> {
  const response = await window.fetch('/api/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ label: browserDeviceLabel() }),
  });
  if (!response.ok) {
    throw new Error('기기 정보를 가져오지 못했습니다.');
  }
  return (await response.json()) as DeviceIdentity;
}
