export interface Student {
  id: number;
  studentNumber: string;
  name: string;
  grade: number;
  classNumber: number;
  deviceCount: number;
}

// 출결 화면과 서비스 계층이 공통으로 사용하는 단일 출결 이벤트 형식이다.
export interface AttendanceRecord {
  id: string;
  studentNumber: string;
  studentName: string;
  action: 'check_in' | 'check_out' | 'absent';
  timestamp: string;
  deviceId: string;
  deviceLabel: string;
}

export type DailyPresence = null | 'present' | 'checked_out';

export interface DailyAttendanceSummary {
  studentNumber: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: 'absent' | 'present' | 'checked_out';
}

// 출결 기준일은 브라우저의 로컬 시간대가 아니라 학교가 있는 한국 시간으로 고정한다.
const ATTENDANCE_TIME_ZONE = 'Asia/Seoul';

// 전체 기록에서 가장 최신 이벤트 하나만 보고 현재 상태를 계산할 때 사용한다.
export function getCurrentPresence(
  studentNumber: string,
  records: AttendanceRecord[],
) {
  const latestRecord = records.find(
    (record) => record.studentNumber === studentNumber,
  );

  if (!latestRecord || latestRecord.action === 'absent') return null;
  return latestRecord.action === 'check_in' ? 'present' : 'checked_out';
}

// 날짜별 집계를 안정적으로 하기 위해 YYYY-MM-DD 형태의 한국 시간 기준 키로 변환한다.
export function getAttendanceDateKey(timestamp: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ATTENDANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

// 오늘 출결 상태를 계산할 때 사용할 한국 시간 기준의 오늘 날짜 키를 만든다.
export function getTodayDateKey(referenceDate = new Date()) {
  return getAttendanceDateKey(referenceDate.toISOString());
}

// 날짜 선택 버튼처럼 짧은 문구가 필요한 화면에서 쓰는 표시용 포맷이다.
export function formatAttendanceDateLabel(dateKey: string) {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${month}/${day}`;
}

// 교사 화면 상단처럼 사람이 바로 읽을 수 있는 긴 날짜가 필요할 때 사용한다.
export function formatKoreanFullDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: ATTENDANCE_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const weekday = parts.find((part) => part.type === 'weekday')?.value;

  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

// 학생 한 명의 "오늘" 상태만 계산한다.
// 교사는 상태를 여러 번 보정할 수 있으므로, 오늘 기록 중 가장 최신 이벤트를 현재 상태로 본다.
export function getDailyPresence(
  studentNumber: string,
  records: AttendanceRecord[],
  referenceDate = new Date(),
): DailyPresence {
  const todayKey = getTodayDateKey(referenceDate);
  const todayRecords = records.filter(
    (record) =>
      record.studentNumber === studentNumber &&
      getAttendanceDateKey(record.timestamp) === todayKey,
  );
  const latestRecord = [...todayRecords].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  )[0];
  if (!latestRecord || latestRecord.action === 'absent') return null;
  return latestRecord.action === 'check_in' ? 'present' : 'checked_out';
}

// 특정 날짜의 학생별 일일 요약을 만든다.
// 날짜별 출결표는 이벤트를 그대로 보여주지 않고 이 요약 결과를 기준으로 렌더링한다.
export function getDailyAttendanceSummary(
  studentNumber: string,
  records: AttendanceRecord[],
  dateKey: string,
): DailyAttendanceSummary {
  const dailyRecords = records.filter(
    (record) =>
      record.studentNumber === studentNumber &&
      getAttendanceDateKey(record.timestamp) === dateKey,
  );
  const latestRecord = [...dailyRecords].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  )[0];
  const isLatestAbsent = latestRecord?.action === 'absent';
  const checkInAt = isLatestAbsent
    ? null
    : dailyRecords
        .filter((record) => record.action === 'check_in')
        .map((record) => record.timestamp)
        .sort()
        .at(-1) ?? null;
  const checkOutAt = isLatestAbsent
    ? null
    : dailyRecords
        .filter((record) => record.action === 'check_out')
        .map((record) => record.timestamp)
        .sort()
        .at(-1) ?? null;

  return {
    studentNumber,
    checkInAt,
    checkOutAt,
    status: latestRecord
      ? latestRecord.action === 'absent'
        ? 'absent'
        : latestRecord.action === 'check_in'
          ? 'present'
          : 'checked_out'
      : 'absent',
  };
}

// 출석/퇴실 시각을 표에서 읽기 쉬운 한국어 날짜와 시간으로 바꾼다.
export function formatKoreanDateTime(timestamp: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}
