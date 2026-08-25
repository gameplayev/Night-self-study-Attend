import { useMemo, useState } from 'react';
import {
  AttendanceRecord,
  Student,
  formatKoreanFullDate,
  getAttendanceDateKey,
  getDailyPresence,
  getStudentAbsentCount,
  getTodayDateKey,
} from '../../lib/attendance';
import {
  CreateTeacherInput,
  CreateStudentInput,
  ManualAttendanceAction,
  Teacher,
  UpdateStudentInput,
  UpdateTeacherInput,
} from '../../services/appService';
import { StatCard } from '../../components/StatCard';
import { FeedbackMessage } from '../../types/ui';
import { DailyAttendanceSection } from './DailyAttendanceSection';
import { AbsenceCorrectionDialog } from './AbsenceCorrectionDialog';
import { StudentRosterSection } from './StudentRosterSection';
import { TeacherManagementPanels } from './TeacherManagementPanels';
import { SeatMapDialog } from './SeatMapDialog';

export function TeacherView({
  teachers,
  students,
  records,
  onRefreshAttendance,
  onAddTeacher,
  onAddStudent,
  onDeleteStudent,
  onManualAttendance,
  onDeleteAttendanceDate,
  onDeleteAllAttendanceRecords,
  onResetDevices,
  onUpdateStudent,
  onUpdateTeacher,
  message,
}: {
  teachers: Teacher[];
  students: Student[];
  records: AttendanceRecord[];
  onRefreshAttendance: () => Promise<void>;
  onAddTeacher: (input: CreateTeacherInput) => Promise<void>;
  onAddStudent: (input: CreateStudentInput) => Promise<void>;
  onDeleteStudent: (student: Student) => Promise<void>;
  onManualAttendance: (
    student: Student,
    action: ManualAttendanceAction,
    dateKey?: string,
  ) => Promise<void>;
  onDeleteAttendanceDate: (dateKey: string) => Promise<void>;
  onDeleteAllAttendanceRecords: () => Promise<void>;
  onResetDevices: (student: Student) => Promise<void>;
  onUpdateStudent: (
    student: Student,
    input: UpdateStudentInput,
  ) => Promise<void>;
  onUpdateTeacher: (
    teacher: Teacher,
    input: UpdateTeacherInput,
  ) => Promise<void>;
  message: FeedbackMessage | null;
}) {
  const [query, setQuery] = useState('');
  const [correctionStudent, setCorrectionStudent] = useState<Student | null>(
    null,
  );
  const [isSeatMapOpen, setIsSeatMapOpen] = useState(false);
  const sortedStudents = useMemo(
    () =>
      [...students].sort(
        (left, right) =>
          left.seatNumber - right.seatNumber ||
          left.studentNumber.localeCompare(right.studentNumber),
      ),
    [students],
  );
  // 교사 화면 상단 통계는 오늘 기록만 기준으로 하므로 학생별 현재 상태를 먼저 맵으로 만든다.
  const presenceMap = useMemo(
    () =>
      new Map(
        sortedStudents.map((student) => [
          student.studentNumber,
          getDailyPresence(student.studentNumber, records),
        ]),
      ),
    [records, sortedStudents],
  );
  const absenceDateKeys = useMemo(() => {
    const todayKey = getTodayDateKey();
    const pastRecordDateKeys = records
      .map((record) => getAttendanceDateKey(record.timestamp))
      .filter((dateKey) => dateKey < todayKey);
    return Array.from(new Set(pastRecordDateKeys)).sort();
  }, [records]);
  const absentCountMap = useMemo(
    () =>
      new Map(
        sortedStudents.map((student) => [
          student.studentNumber,
          getStudentAbsentCount(
            student.studentNumber,
            records,
            {
              dateKeys: absenceDateKeys,
              activeWeekdays: student.attendanceWeekdays,
            },
          ),
        ]),
      ),
    [absenceDateKeys, records, sortedStudents],
  );
  const presentCount = [...presenceMap.values()].filter(
    (status) => status === 'present',
  ).length;
  const checkedOutCount = [...presenceMap.values()].filter(
    (status) => status === 'checked_out',
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-sm font-medium text-slate-500">오늘 날짜</p>
        <p className="mt-1 text-xl font-semibold text-slate-900">
          {formatKoreanFullDate()}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="등록 학생" value={students.length} tone="slate" />
        <StatCard label="현재 출석" value={presentCount} tone="emerald" />
        <StatCard label="퇴실 완료" value={checkedOutCount} tone="amber" />
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <StudentRosterSection
          students={sortedStudents}
          presenceMap={presenceMap}
          absentCountMap={absentCountMap}
          query={query}
          onQueryChange={setQuery}
          onOpenSeatMap={() => setIsSeatMapOpen(true)}
          onDeleteStudent={onDeleteStudent}
          onManualAttendance={onManualAttendance}
          onCorrectAbsences={setCorrectionStudent}
          onResetDevices={onResetDevices}
          onUpdateStudent={onUpdateStudent}
        />
        <TeacherManagementPanels
          teachers={teachers}
          onAddTeacher={onAddTeacher}
          onAddStudent={onAddStudent}
          onUpdateTeacher={onUpdateTeacher}
        />
      </section>

      <DailyAttendanceSection
        students={sortedStudents}
        records={records}
        onManualAttendance={onManualAttendance}
        onDeleteAttendanceDate={onDeleteAttendanceDate}
        onDeleteAllAttendanceRecords={onDeleteAllAttendanceRecords}
      />

      {correctionStudent && (
        <AbsenceCorrectionDialog
          student={correctionStudent}
          records={records}
          dateKeys={absenceDateKeys}
          onCorrect={onManualAttendance}
          onClose={() => setCorrectionStudent(null)}
        />
      )}

      {isSeatMapOpen && (
        <SeatMapDialog
          students={sortedStudents}
          presenceMap={presenceMap}
          onRefreshAttendance={onRefreshAttendance}
          onClose={() => setIsSeatMapOpen(false)}
        />
      )}

      {message && (
        <p
          className={`rounded-md px-4 py-3 text-sm font-medium ${
            message.tone === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
