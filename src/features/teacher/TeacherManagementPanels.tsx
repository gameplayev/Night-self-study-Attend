import { FormEvent, useState } from 'react';
import {
  CreateTeacherInput,
  CreateStudentInput,
  Teacher,
  UpdateTeacherInput,
} from '../../services/appService';

export function TeacherManagementPanels({
  teachers,
  onAddTeacher,
  onAddStudent,
  onUpdateTeacher,
}: {
  teachers: Teacher[];
  onAddTeacher: (input: CreateTeacherInput) => Promise<void>;
  onAddStudent: (input: CreateStudentInput) => Promise<void>;
  onUpdateTeacher: (
    teacher: Teacher,
    input: UpdateTeacherInput,
  ) => Promise<void>;
}) {
  // 입력 폼은 성공 시 초기화되지만, 실패 시에는 사용자가 입력을 다시 확인할 수 있게 유지한다.
  const [newTeacher, setNewTeacher] = useState({
    identifier: '',
    name: '',
  });
  const [newStudent, setNewStudent] = useState({
    studentNumber: '',
    name: '',
    grade: '2',
    classNumber: '1',
  });
  const [editingTeacherId, setEditingTeacherId] = useState<number | null>(null);
  const [editTeacher, setEditTeacher] = useState<UpdateTeacherInput | null>(null);

  async function handleAddStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onAddStudent({
        studentNumber: newStudent.studentNumber,
        name: newStudent.name,
        grade: Number(newStudent.grade),
        classNumber: Number(newStudent.classNumber),
      });
      setNewStudent({
        studentNumber: '',
        name: '',
        grade: '2',
        classNumber: '1',
      });
    } catch {
      // Error feedback is shown by the parent view.
    }
  }

  async function handleAddTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onAddTeacher(newTeacher);
      setNewTeacher({ identifier: '', name: '' });
    } catch {
      // Error feedback is shown by the parent view.
    }
  }

  function startEditingTeacher(teacher: Teacher) {
    setEditingTeacherId(teacher.id);
    setEditTeacher({ name: teacher.name, newIdentifier: '' });
  }

  async function saveTeacher(teacher: Teacher) {
    if (!editTeacher) return;
    await onUpdateTeacher(teacher, editTeacher);
    setEditingTeacherId(null);
    setEditTeacher(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">학생 등록</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          신규 학생 추가
        </h2>
        <form className="mt-5 space-y-3" onSubmit={handleAddStudent}>
          <input
            value={newStudent.studentNumber}
            onChange={(event) =>
              setNewStudent((value) => ({
                ...value,
                studentNumber: event.target.value,
              }))
            }
            placeholder="학번"
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          <input
            value={newStudent.name}
            onChange={(event) =>
              setNewStudent((value) => ({
                ...value,
                name: event.target.value,
              }))
            }
            placeholder="이름"
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={newStudent.grade}
              onChange={(event) =>
                setNewStudent((value) => ({
                  ...value,
                  grade: event.target.value,
                }))
              }
              placeholder="학년"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
            <input
              value={newStudent.classNumber}
              onChange={(event) =>
                setNewStudent((value) => ({
                  ...value,
                  classNumber: event.target.value,
                }))
              }
              placeholder="반"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <button
            type="submit"
            className="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            학생 추가
          </button>
        </form>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">교사 계정</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          선생님 추가
        </h2>
        <form className="mt-5 space-y-3" onSubmit={handleAddTeacher}>
          <input
            value={newTeacher.name}
            onChange={(event) =>
              setNewTeacher((value) => ({
                ...value,
                name: event.target.value,
              }))
            }
            placeholder="이름"
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          <input
            type="password"
            value={newTeacher.identifier}
            onChange={(event) =>
              setNewTeacher((value) => ({
                ...value,
                identifier: event.target.value,
              }))
            }
            placeholder="고유 번호"
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="submit"
            className="h-10 w-full rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            선생님 추가
          </button>
        </form>

        <div className="mt-5 space-y-2">
          {teachers.map((teacher) => (
            <div
              key={teacher.id}
              className="rounded-md bg-slate-50 px-3 py-3 text-sm"
            >
              {editingTeacherId === teacher.id && editTeacher ? (
                <div className="space-y-2">
                  <input
                    value={editTeacher.name}
                    onChange={(event) =>
                      setEditTeacher((value) =>
                        value ? { ...value, name: event.target.value } : value,
                      )
                    }
                    className="h-9 w-full rounded-md border border-slate-300 px-3"
                  />
                  <input
                    type="password"
                    value={editTeacher.newIdentifier ?? ''}
                    onChange={(event) =>
                      setEditTeacher((value) =>
                        value
                          ? { ...value, newIdentifier: event.target.value }
                          : value,
                      )
                    }
                    placeholder="새 고유 번호 (변경할 때만 입력)"
                    className="h-9 w-full rounded-md border border-slate-300 px-3"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveTeacher(teacher)}
                      className="h-8 rounded-md border border-sky-300 px-3 text-xs font-medium text-sky-700 hover:bg-sky-50"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTeacherId(null);
                        setEditTeacher(null);
                      }}
                      className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{teacher.name}</p>
                    <p className="text-xs text-slate-500">
                      고유 번호는 보안 해시로 저장됨
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEditingTeacher(teacher)}
                    className="h-8 rounded-md border border-sky-300 px-3 text-xs font-medium text-sky-700 hover:bg-sky-50"
                  >
                    수정
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
