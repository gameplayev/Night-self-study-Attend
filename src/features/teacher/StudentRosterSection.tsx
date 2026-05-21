import { Student, DailyPresence } from '../../lib/attendance';
import { UpdateStudentInput } from '../../services/appService';
import { useState } from 'react';
import {
  formatParsedStudentClass,
  normalizeStudentNumberInput,
} from '../../lib/students';

interface EditStudentForm {
  studentNumber: string;
  name: string;
  seatNumber: string;
}

export function StudentRosterSection({
  students,
  presenceMap,
  query,
  onQueryChange,
  onDeleteStudent,
  absentCountMap,
  onManualAttendance,
  onResetDevices,
  onUpdateStudent,
}: {
  students: Student[];
  presenceMap: Map<string, DailyPresence>;
  absentCountMap: Map<string, number>;
  query: string;
  onQueryChange: (query: string) => void;
  onDeleteStudent: (student: Student) => Promise<void>;
  onManualAttendance: (
    student: Student,
    action: 'check_in' | 'check_out' | 'absent',
  ) => Promise<void>;
  onResetDevices: (student: Student) => Promise<void>;
  onUpdateStudent: (
    student: Student,
    input: UpdateStudentInput,
  ) => Promise<void>;
}) {
  // 검색어는 학번과 이름을 함께 대상으로 삼아 빠른 명단 탐색을 지원한다.
  const filteredStudents = students.filter((student) =>
    `${student.seatNumber} ${student.studentNumber} ${student.name}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [editStudent, setEditStudent] = useState<EditStudentForm | null>(null);

  function startEditing(student: Student) {
    setEditingStudentId(student.id);
    setEditStudent({
      studentNumber: student.studentNumber,
      name: student.name,
      seatNumber: String(student.seatNumber),
    });
  }

  async function saveStudent(student: Student) {
    if (!editStudent) return;
    await onUpdateStudent(student, {
      ...editStudent,
      seatNumber: Number(editStudent.seatNumber),
    });
    setEditingStudentId(null);
    setEditStudent(null);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">교사 관리</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            학생 명단
          </h2>
        </div>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="학번 또는 이름 검색"
          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">좌석</th>
              <th className="px-4 py-3 font-medium">학번</th>
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">학급</th>
              <th className="px-4 py-3 font-medium">기기</th>
              <th className="px-4 py-3 font-medium">결석</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {filteredStudents.map((student) => {
              const status = presenceMap.get(student.studentNumber) ?? null;
              const isEditing =
                editingStudentId === student.id && editStudent !== null;
              const parsedClassLabel = isEditing
                ? formatParsedStudentClass(editStudent.studentNumber)
                : null;
              return (
                <tr key={student.id}>
                  <td className="px-4 py-3 text-slate-600">
                    {isEditing ? (
                      <input
                        value={editStudent.seatNumber}
                        onChange={(event) =>
                          setEditStudent((value) =>
                            value
                              ? {
                                  ...value,
                                  seatNumber: event.target.value.replace(
                                    /\D/g,
                                    '',
                                  ),
                                }
                              : value,
                          )
                        }
                        inputMode="numeric"
                        className="h-8 w-16 rounded-md border border-slate-300 px-2 text-sm"
                      />
                    ) : (
                      student.seatNumber
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {isEditing ? (
                      <input
                        value={editStudent.studentNumber}
                        onChange={(event) =>
                          setEditStudent((value) =>
                            value
                              ? {
                                  ...value,
                                  studentNumber: normalizeStudentNumberInput(
                                    event.target.value,
                                  ),
                                }
                              : value,
                          )
                        }
                        inputMode="numeric"
                        maxLength={5}
                        pattern="[0-9]{5}"
                        className="h-8 w-24 rounded-md border border-slate-300 px-2 text-sm"
                      />
                    ) : (
                      student.studentNumber
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {isEditing ? (
                      <input
                        value={editStudent.name}
                        onChange={(event) =>
                          setEditStudent((value) =>
                            value ? { ...value, name: event.target.value } : value,
                          )
                        }
                        className="h-8 w-24 rounded-md border border-slate-300 px-2 text-sm"
                      />
                    ) : (
                      student.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {isEditing ? (
                      parsedClassLabel ?? '학번 확인 필요'
                    ) : (
                      <>
                        {student.grade}학년 {student.classNumber}반
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {student.deviceCount}/2
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {absentCountMap.get(student.studentNumber) ?? 0}회
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-semibold ${
                        status === 'present'
                          ? 'bg-emerald-50 text-emerald-700'
                          : status === 'checked_out'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {status === 'present'
                        ? '출석 중'
                        : status === 'checked_out'
                          ? '퇴실'
                          : '미출석'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveStudent(student)}
                            className="h-8 rounded-md border border-sky-300 px-3 text-xs font-medium text-sky-700 transition hover:bg-sky-50"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudentId(null);
                              setEditStudent(null);
                            }}
                            className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditing(student)}
                          className="h-8 rounded-md border border-sky-300 px-3 text-xs font-medium text-sky-700 transition hover:bg-sky-50"
                        >
                          수정
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void onManualAttendance(student, 'check_in')}
                        className="h-8 rounded-md border border-emerald-300 px-3 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        출석
                      </button>
                      <button
                        type="button"
                        onClick={() => void onManualAttendance(student, 'check_out')}
                        className="h-8 rounded-md border border-amber-300 px-3 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
                      >
                        퇴실
                      </button>
                      <button
                        type="button"
                        onClick={() => void onManualAttendance(student, 'absent')}
                        className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        미출석
                      </button>
                      <button
                        type="button"
                        onClick={() => void onResetDevices(student)}
                        disabled={student.deviceCount === 0}
                        className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        기기 초기화
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteStudent(student)}
                        className="h-8 rounded-md border border-rose-300 px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
