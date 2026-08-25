# 모바일 PWA 및 결석 기록 정정 설계

## 목표

기존 Next.js/Supabase 출결 시스템을 iOS와 Android 홈 화면에서 설치형 앱처럼 사용할 수 있게 하고, 교사가 학생별 결석 횟수의 근거가 되는 날짜별 출결 기록을 안전하게 정정한다.

## 현재 구조와 참고 프로젝트

- 현재 구조는 Next.js App Router의 `app/`이 진입점과 Route Handler만 맡고, 화면은 `src/features`, 공통 계산은 `src/lib`, 브라우저 API는 `src/services`, 서버 경계는 `src/server`에 둔다.
- [Bulletproof React](https://github.com/alan2207/bulletproof-react)는 조사 시점 GitHub 약 35.2k stars이며 feature-first 경계와 공통 계층 분리를 강조한다. 현재 프로젝트의 기존 방향과 맞으므로 전면 재작성 없이 이 원칙만 유지한다.
- [Next.js 공식 PWA 가이드](https://nextjs.org/docs/app/guides/progressive-web-apps)는 App Router의 `app/manifest.ts`, HTTPS, 홈 화면 설치를 기본 경로로 안내한다.
- 모바일 배포 결정은 설치형 PWA로 고정한다. 네이티브 스토어 바이너리 배포는 현재 범위 밖이다.

## 선택지

### A. 설치형 PWA — 이번 구현

- 기존 Next.js, Supabase, HttpOnly cookie, CSRF 흐름을 그대로 사용한다.
- `app/manifest.ts`, mobile metadata, 기존 192/512 PNG 아이콘을 연결한다.
- 로그인 화면에 native `details` 기반 iOS/Android 설치 안내를 추가한다.
- 장점: 한 코드베이스, 즉시 배포, 앱 심사 불필요, 기존 위치 권한 흐름 유지.
- 한계: App Store/Play Store 검색 노출과 일부 native API 없음.

### B. React Native/Flutter 재작성 — 제외

- 출결 UI, 인증, 기기 등록, 위치 검증을 중복 구현한다.
- 현재 요구 대비 비용과 회귀 위험이 크며 서버 API 계약도 다시 설계해야 한다.

현재 제품의 모바일 전달 방식은 A 하나이며, 네이티브 앱 재작성이나 스토어 배포를 전제로 하지 않는다.

## 결석 횟수 정정

### 데이터 불변식

결석 횟수는 저장된 독립 숫자가 아니라 날짜별 `attendance_records` 이벤트에서 계산한다. 별도 `absence_count` 또는 수동 offset 컬럼은 만들지 않는다. 숫자를 직접 덮어쓰면 어떤 날짜가 바뀌었는지 추적할 수 없고 날짜별 화면과 합계가 충돌하기 때문이다.

### 교사 흐름

1. 학생 명단의 `결석 N회`를 버튼으로 표시한다.
2. 버튼을 누르면 해당 학생의 과거 출결 날짜를 최신순으로 보여주는 native dialog를 연다.
3. 각 날짜에서 현재 상태와 `정상출석으로 수정` 또는 `결석으로 수정`을 제공한다.
4. 기존 `POST /api/attendance/manual`에 `studentId`, `action`, `dateKey`를 전송한다.
5. 성공 이벤트를 현재 기록 배열 앞에 추가하면 기존 계산 함수가 합계를 즉시 다시 계산한다.

결석 숫자나 수동 보정값을 저장하는 컬럼, 새 API, 새 상태 저장소는 추가하지 않는다. 다만 같은 날짜의 정정 이벤트가 동일한 유효 시각을 가져도 마지막 기록이 항상 이기도록 `attendance_records.recorded_sequence` identity 메타데이터를 추가한다. 모든 최신 상태 판정은 유효 `timestamp` 다음 `recorded_sequence` 순으로 정렬하며, 기존 Supabase 프로젝트에는 새 서버보다 먼저 최신 `supabase/schema.sql`을 적용한다. 기존 교사 인증, CSRF, 날짜 검증, 출석 요일 검증은 그대로 재사용한다.

## 프로젝트 구조

```text
app/
├─ api/[...path]/route.ts       # 얇은 HTTP 진입점
├─ layout.tsx                   # metadata와 공통 shell
├─ manifest.ts                  # PWA manifest
└─ page.tsx                     # App 연결
src/
├─ features/
│  ├─ auth/
│  ├─ install/InstallGuide.tsx  # 모바일 설치 안내
│  ├─ student/
│  └─ teacher/
│     ├─ AbsenceCorrectionDialog.tsx
│     ├─ StudentRosterSection.tsx
│     └─ ...
├─ lib/                         # 순수 출결·학번 계산
├─ services/                    # 브라우저 API adapter
├─ server/                      # 인증·Supabase 서버 경계
└─ types/
```

Create React App 잔재인 `src/index.tsx`, `src/reportWebVitals.ts`, `public/index.html`, 오래된 `public/manifest.json`, 직접 의존성 `web-vitals`는 Next.js 실행 경로에서 사용되지 않으므로 제거한다.

## 오류 처리와 보안

- 수동 정정은 교사 세션과 CSRF 검증을 통과한 기존 endpoint만 사용한다.
- 미래 날짜, 비출석 요일, 잘못된 학생 ID는 기존 서버 validation으로 거부한다.
- dialog 작업 실패는 기존 상위 feedback message로 표시하고 기록 목록은 바꾸지 않는다.
- service worker/offline cache는 추가하지 않는다. 출결·세션 응답의 기기 잔존과 stale write 위험이 이 앱의 이득보다 크다.
- PWA는 운영 HTTPS에서만 설치 가능하다고 문서화한다.

## 검증

- 고신호 컴포넌트 테스트: 학생의 결석 버튼에서 dialog가 열리고, 선택한 날짜와 `present`/`absent` action이 기존 callback으로 정확히 전달되는지 검증한다.
- 기존 attendance 계산 테스트와 teacher UI 테스트를 함께 실행한다.
- `tsc --noEmit`, production `next build`, `git diff --check`를 실행한다.
- production UI를 375px, 768px, 1280px에서 열어 로그인 설치 안내, 교사 결석 정정 dialog, 가로 overflow, Korean text wrapping, keyboard/Escape 동작을 확인한다.
- built manifest의 name, start URL, standalone display, 192/512 icons를 실제 HTTP 응답에서 확인한다.

## 배포 단계

1. Supabase server key를 Vercel server environment에 유지한다.
2. Vercel production HTTPS 배포 후 `/manifest.webmanifest`와 `/api/health`를 확인한다.
3. Android Chrome에서 `홈 화면에 추가/앱 설치`, iOS에서 `공유 > 홈 화면에 추가`를 실제 기기로 확인한다.
4. 실제 기기에서 HTTPS, 로그인, 위치 권한, 출석, 결석 정정을 확인한다.

## 범위 밖

- App Store/Play Store 계정 생성, 서명, 심사 제출
- 네이티브 스토어 바이너리 및 제출
- Capacitor 래퍼
- push notification
- offline attendance write/cache
- native biometric login
- React Native/Flutter 재작성
