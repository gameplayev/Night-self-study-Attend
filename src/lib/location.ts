export interface LocationSample {
  latitude: number;
  longitude: number;
  accuracy: number;
}

// 학교 출결 허용 범위의 기준점이다.
// 위치 정확도가 너무 낮으면 학교 안팎을 신뢰하기 어려우므로 정확도 한계도 함께 둔다.
export const GOSAEK_HIGH_SCHOOL = {
  name: '고색고등학교',
  latitude: 37.2537794,
  longitude: 126.9824637,
  radiusMeters: 250,
  maxAccuracyMeters: 100,
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

// 두 좌표 사이 거리를 구한다.
// 가까운 거리에서도 오차가 적은 하버사인 공식을 써서 학교 반경 판정에 재사용한다.
export function distanceMeters(
  from: Pick<LocationSample, 'latitude' | 'longitude'>,
  to: Pick<LocationSample, 'latitude' | 'longitude'>,
) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

// 학생이 보낸 위치가 출결 처리에 쓸 만큼 정확하고 학교 반경 안에 있는지 검증한다.
export function validateSchoolLocation(location: LocationSample) {
  if (location.accuracy > GOSAEK_HIGH_SCHOOL.maxAccuracyMeters) {
    throw new Error('위치 정확도가 낮습니다. 잠시 후 다시 시도해 주세요.');
  }

  const distance = distanceMeters(location, GOSAEK_HIGH_SCHOOL);
  if (distance > GOSAEK_HIGH_SCHOOL.radiusMeters) {
    throw new Error('학교 위치에서만 출석할 수 있습니다.');
  }
}
