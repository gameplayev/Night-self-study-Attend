import { LocationSample } from '../lib/location';

export type LocationAccessErrorReason =
  | 'insecure_context'
  | 'unsupported'
  | 'permission_denied'
  | 'unavailable'
  | 'timeout';

export type LocationPermissionState =
  | PermissionState
  | 'unsupported'
  | 'unavailable';

export interface LocationCapability {
  isSecureContext: boolean;
  hasGeolocation: boolean;
  permissionState: LocationPermissionState;
}

export class LocationAccessError extends Error {
  reason: LocationAccessErrorReason;

  constructor(reason: LocationAccessErrorReason, message: string) {
    super(message);
    this.name = 'LocationAccessError';
    this.reason = reason;
  }
}

// 실제 위치 요청 전에 현재 브라우저가 어떤 상태인지 읽는다.
// 이 값은 권한 안내 모달에서 사용자가 막힌 이유를 이해하도록 돕는다.
export async function getLocationCapability(): Promise<LocationCapability> {
  let permissionState: LocationPermissionState = 'unsupported';

  try {
    if (window.navigator.permissions?.query) {
      const result = await window.navigator.permissions.query({
        name: 'geolocation',
      });
      permissionState = result.state;
    }
  } catch {
    permissionState = 'unavailable';
  }

  return {
    isSecureContext: window.isSecureContext,
    hasGeolocation: Boolean(window.navigator.geolocation),
    permissionState,
  };
}

// 브라우저의 현재 위치를 한 번만 요청한다.
// 학교 출결은 위치가 오래 캐시되면 안 되므로 maximumAge를 0으로 두고 매번 새 값을 요구한다.
export async function getCurrentLocation(): Promise<LocationSample> {
  if (!window.isSecureContext) {
    throw new LocationAccessError(
      'insecure_context',
      '현재 접속 주소에서는 위치 권한을 요청할 수 없습니다. HTTPS 주소나 설치 앱으로 접속해 주세요.',
    );
  }

  if (!window.navigator.geolocation) {
    throw new LocationAccessError(
      'unsupported',
      '이 기기에서 위치 정보를 사용할 수 없습니다.',
    );
  }

  return new Promise((resolve, reject) => {
    window.navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) => {
        // 브라우저별 원시 에러 코드를 화면에서 다루기 쉬운 앱 전용 이유 값으로 바꾼다.
        if (error.code === error.PERMISSION_DENIED) {
          reject(
            new LocationAccessError(
              'permission_denied',
              '위치 권한을 허용해야 출석할 수 있습니다.',
            ),
          );
          return;
        }
        if (error.code === error.TIMEOUT) {
          reject(
            new LocationAccessError(
              'timeout',
              '위치 확인 시간이 초과되었습니다. 다시 시도해 주세요.',
            ),
          );
          return;
        }
        reject(
          new LocationAccessError(
            'unavailable',
            '현재 위치를 확인하지 못했습니다. 다시 시도해 주세요.',
          ),
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      },
    );
  });
}
