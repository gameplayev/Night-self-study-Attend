# Mobile PWA and Absence Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an installable iOS/Android PWA surface and let teachers correct the dated records behind each student's absence total.

**Architecture:** Keep the Next.js App Router entry thin and preserve the existing server-mediated Supabase boundary. Add only a typed manifest and two feature-scoped UI leaves; reuse `POST /api/attendance/manual` so absence corrections remain dated events instead of a mutable counter.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Tailwind CSS 3, Jest + Testing Library, Supabase PostgreSQL

**Spec:** `docs/superpowers/specs/2026-08-25-mobile-pwa-absence-correction-design.md`

## Global Constraints

- Keep Supabase access server-only through `SUPABASE_SERVICE_ROLE_KEY`.
- Keep HttpOnly session cookies and CSRF validation unchanged.
- Do not add an `absence_count` or adjustment column; corrections append dated `present`/`absent` records through the existing manual endpoint.
- Do not cache authenticated or attendance responses offline.
- Support student use at 375px and home-screen installation from HTTPS on iOS and Android.
- Follow root `DESIGN.md`; introduce no new palette, animation system, or dependency.
- Add only tests protecting a user requirement, plausible regression, or packaging contract.

---

### Task 1: Split the oversized student roster row without changing behavior

**Files:**
- Create: `src/features/teacher/StudentRosterRow.tsx`
- Modify: `src/features/teacher/StudentRosterSection.tsx`
- Test: `src/App.test.tsx` (existing weekday-edit scenario; no new test)

**Interfaces:**
- Consumes: `Student`, `DailyPresence`, `UpdateStudentInput`, existing manual attendance/reset/delete/update callbacks.
- Produces: `StudentRosterRow` rendering one student and preserving all current edit/actions behavior.

- [ ] **Step 1: Run the existing behavior lock**

```bash
npm test -- --runInBand src/App.test.tsx -t "teacher edits one student attendance weekdays and absence total updates"
```

Expected: PASS. This protects the real editing and absence-total behavior during extraction.

- [ ] **Step 2: Extract the row and its edit state**

Move the row JSX, `EditStudentForm`, weekday labels, edit initialization, weekday toggle, and save flow into `StudentRosterRow.tsx`. Export this contract:

```tsx
export type StudentRosterRowProps = {
  readonly student: Student;
  readonly status: DailyPresence;
  readonly absentCount: number;
  readonly onDeleteStudent: (student: Student) => Promise<void>;
  readonly onManualAttendance: (
    student: Student,
    action: 'check_in' | 'check_out' | 'absent',
  ) => Promise<void>;
  readonly onResetDevices: (student: Student) => Promise<void>;
  readonly onUpdateStudent: (
    student: Student,
    input: UpdateStudentInput,
  ) => Promise<void>;
};
```

`StudentRosterSection` keeps filtering, heading, table shell, columns, and maps one `StudentRosterRow` per filtered student. Task 2 extends this contract with `onCorrectAbsences` and makes the count interactive.

- [ ] **Step 3: Run the behavior lock and type checker**

```bash
npm test -- --runInBand src/App.test.tsx -t "teacher edits one student attendance weekdays and absence total updates"
npx tsc --noEmit
```

Expected: PASS with unchanged visible behavior.

- [ ] **Step 4: Commit**

```bash
git add src/features/teacher/StudentRosterRow.tsx src/features/teacher/StudentRosterSection.tsx
git commit -m "학생 명단 행 컴포넌트 분리"
```

### Task 2: Add dated absence correction from the roster

**Files:**
- Create: `src/features/teacher/TeacherView.test.tsx`
- Create: `src/features/teacher/AbsenceCorrectionDialog.tsx`
- Modify: `src/features/teacher/StudentRosterRow.tsx`
- Modify: `src/features/teacher/StudentRosterSection.tsx`
- Modify: `src/features/teacher/TeacherView.tsx`

**Interfaces:**
- Consumes: `AttendanceRecord[]`, already-derived past `absenceDateKeys`, `getDailyAttendanceSummary`, `getDailyAttendanceResult`, and `onManualAttendance(student, action, dateKey)`.
- Produces: a native modal dialog that sends an exact dated `present` or `absent` correction through the existing parent callback.

- [ ] **Step 1: Write the failing user-flow test**

Protected regression: teacher clicks one student's total but UI sends the wrong student, action, or date.

```tsx
test('teacher corrects the dated record behind a student absence total', async () => {
  const onManualAttendance = jest.fn().mockResolvedValue(undefined);
  render(<TeacherView {...teacherFixture} onManualAttendance={onManualAttendance} />);

  fireEvent.click(screen.getByRole('button', { name: '홍길동 결석 기록 수정' }));
  const dialog = screen.getByRole('dialog', { name: '홍길동 결석 기록 수정' });
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: '2026-08-03 정상출석으로 수정',
    }),
  );

  expect(onManualAttendance).toHaveBeenCalledWith(
    teacherFixture.students[0],
    'present',
    '2026-08-03',
  );
});
```

The fixture contains one scheduled student and an `absent` event at `2026-08-03T12:00:00.000Z`.

- [ ] **Step 2: Run RED**

```bash
npm test -- --runInBand src/features/teacher/TeacherView.test.tsx
```

Expected: FAIL because correction button/dialog do not exist.

- [ ] **Step 3: Implement the native dialog and wiring**

`AbsenceCorrectionDialog` contract:

```tsx
export type AbsenceCorrectionDialogProps = {
  readonly student: Student;
  readonly records: AttendanceRecord[];
  readonly dateKeys: readonly string[];
  readonly onCorrect: (
    student: Student,
    action: 'present' | 'absent',
    dateKey: string,
  ) => Promise<void>;
  readonly onClose: () => void;
};
```

Call `showModal()` on mount, close on native `cancel`, list scheduled past dates newest-first, derive status with existing attendance helpers, and give every action a date-specific accessible name. `TeacherView` owns `correctionStudent: Student | null` and renders the dialog.

- [ ] **Step 4: Run GREEN and affected suites**

```bash
npm test -- --runInBand src/features/teacher/TeacherView.test.tsx src/features/teacher/DailyAttendanceSection.test.tsx src/lib/attendance.test.ts
npx tsc --noEmit
```

Expected: PASS. New test proves exact student/action/date routing; existing suites protect daily-state and absence calculations.

- [ ] **Step 5: Commit**

```bash
git add src/features/teacher/TeacherView.test.tsx src/features/teacher/AbsenceCorrectionDialog.tsx src/features/teacher/StudentRosterRow.tsx src/features/teacher/StudentRosterSection.tsx src/features/teacher/TeacherView.tsx
git commit -m "결석 기록 날짜별 정정 추가"
```

### Task 3: Add the installable PWA surface and remove obsolete CRA files

**Files:**
- Create: `app/manifest.ts`
- Create: `src/features/install/InstallGuide.tsx`
- Modify: `app/layout.tsx`
- Modify: `src/features/auth/LoginView.tsx`
- Modify: `src/App.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `public/index.html`
- Delete: `public/manifest.json`
- Delete: `src/index.tsx`
- Delete: `src/reportWebVitals.ts`

**Interfaces:**
- Consumes: `public/logo192.png`, `public/logo512.png`, Next.js `MetadataRoute.Manifest`, and `Viewport`.
- Produces: `/manifest.webmanifest`, standalone display metadata, Apple-capable metadata, and visible install steps without custom prompt JavaScript.

- [ ] **Step 1: Add the typed manifest**

```tsx
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '야자 출석 시스템',
    short_name: '야자 출석',
    description: '학생과 교사가 함께 쓰는 야간자율학습 출석 관리 앱',
    start_url: '/',
    display: 'standalone',
    background_color: '#f1f5f9',
    theme_color: '#0f172a',
    lang: 'ko-KR',
    icons: [
      { src: '/logo192.png', sizes: '192x192', type: 'image/png' },
      { src: '/logo512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
```

Add `export const viewport: Viewport = { themeColor: '#0f172a', width: 'device-width', initialScale: 1, viewportFit: 'cover' }` and `appleWebApp` metadata in `app/layout.tsx`.

- [ ] **Step 2: Add native install guidance**

Create `InstallGuide.tsx` as a native `details`/`summary` card with two numbered lists:

- iPhone/iPad: browser share menu, `홈 화면에 추가`, confirm.
- Android: Chrome menu, `앱 설치` or `홈 화면에 추가`, confirm.

Render it under login form. No platform sniffing, event listeners, dependency, or offline claim.

- [ ] **Step 3: Remove dead CRA paths and dependency**

Delete the four unused files, remove unused `SpeedInsights` import from `src/App.tsx`, and run:

```bash
npm uninstall web-vitals
```

Expected: `web-vitals` leaves direct dependencies and npm regenerates lockfile.

- [ ] **Step 4: Verify packaging**

```bash
npx tsc --noEmit
npm run build
```

Expected: PASS and route output includes `/manifest.webmanifest`.

- [ ] **Step 5: Commit**

```bash
git add app/manifest.ts app/layout.tsx src/features/install/InstallGuide.tsx src/features/auth/LoginView.tsx src/App.tsx package.json package-lock.json public/index.html public/manifest.json src/index.tsx src/reportWebVitals.ts
git commit -m "iOS Android 설치형 PWA 지원"
```

### Task 4: Update operations documentation and run final evidence gates

**Files:**
- Modify: `README.md`
- Create: `docs/mobile-deployment.md`

**Interfaces:**
- Consumes: implemented PWA route and existing Vercel/Supabase deployment.
- Produces: exact PWA deployment/install instructions; App Store/Play Store and Capacitor remain out of scope.

- [ ] **Step 1: Document current deployment**

Update README from “웹 전용” to “설치형 웹 앱”, list PWA and dated absence correction, and link `docs/mobile-deployment.md`. Deployment doc contains:

- Vercel HTTPS, `/api/health` liveness check (not Supabase readiness), `/manifest.webmanifest`, iOS/Android device checks.
- Explicit exclusions: offline attendance writes, push, App Store/Play Store submission, and Capacitor.

- [ ] **Step 2: Run complete functional gates**

```bash
npm test -- --runInBand src/features/teacher/TeacherView.test.tsx src/features/teacher/DailyAttendanceSection.test.tsx src/features/student/StudentView.test.tsx src/lib/attendance.test.ts src/services/appService.test.ts src/App.test.tsx src/server/attendanceApi.test.ts
npx tsc --noEmit
npm run build
git diff --check
```

Expected: zero test failures, type errors, build errors, or whitespace errors.

- [ ] **Step 3: Run production browser QA**

Start `npm run start` from fresh build. Capture login at 375x812, 768x1024, 1280x900; capture teacher roster and correction dialog through an authenticated local scenario if valid test credentials/data exist. Verify:

- no page-level horizontal overflow on login/student surfaces;
- install guide keyboard open/close and Korean wrapping;
- roster count opens correct dialog;
- dialog Escape closes and actions remain reachable;
- `/manifest.webmanifest` returns typed manifest and both icons resolve.

Label teacher screenshot unavailable if local Supabase credentials/data are absent; do not infer a pass.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/mobile-deployment.md
git commit -m "모바일 배포 절차 문서화"
```

- [ ] **Step 5: Fast-forward original local repository**

From `/Users/choiwuseck/Desktop/Night-self-study-Attend`, fetch the verified clone commit and merge it with `--ff-only`. Re-run `git status --short --branch` and `git log -5 --oneline`; do not push.
