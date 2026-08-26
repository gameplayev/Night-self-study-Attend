# Night Self-study Attend Design System

## 1. Atmosphere & Identity

학교 운영 도구답게 차분하고 빠르게 읽히는 출결 화면이다. 장식보다 상태·행동·오류의 구분을 우선하며, 흰색 카드와 slate 계열의 절제된 대비를 시그니처로 유지한다. 학생은 스마트폰 한 손 사용, 교사는 큰 명단을 빠르게 훑는 사용을 기준으로 한다.

## 2. Color

| Role | Tailwind token | Light value | Usage |
| --- | --- | --- | --- |
| Page surface | `slate-100` | `#f1f5f9` | 전체 배경 |
| Card surface | `white` | `#ffffff` | 카드, 대화상자 |
| Primary text/action | `slate-900` | `#0f172a` | 제목, 기본 CTA |
| Secondary text | `slate-500` / `slate-600` / `slate-700` | Tailwind v3 default | 설명, 표 본문 |
| Border | `slate-200` / `slate-300` | Tailwind v3 default | 카드, 입력, 구분선 |
| Focus/info | `sky-100` / `sky-500` / `sky-700` | Tailwind v3 default | 포커스, 기기 등록 |
| Success | `emerald-50` / `emerald-700` | Tailwind v3 default | 정상 처리 |
| Warning | `amber-50` / `amber-700` | Tailwind v3 default | 퇴실·주의 상태 |
| Error/destructive | `rose-50` / `rose-300` / `rose-700` | Tailwind v3 default | 결석, 오류, 삭제 |

새 색상은 추가하지 않는다. 새 상태는 가장 가까운 기존 semantic ramp를 재사용한다.

## 3. Typography

| Level | Tailwind class | Usage |
| --- | --- | --- |
| Page title | `text-2xl font-semibold` | 앱 제목 |
| Section title | `text-xl font-semibold` | 카드·표 제목 |
| Body | browser default / `text-base` | 주요 입력·버튼 |
| Body small | `text-sm` | 폼 라벨, 표 본문 |
| Caption | `text-xs` | 학번, 상태 메타데이터 |

Font stack: `Inter, Pretendard, Noto Sans KR, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`. 본문은 14px 미만으로 내리지 않는다.

## 4. Spacing & Layout

기준 단위는 4px이며 기존 Tailwind spacing scale만 사용한다.

- 모바일 바깥 여백: 16px (`px-4`)
- 카드 내부: 20px 또는 24px (`p-5`, `p-6`)
- 섹션 간격: 24px (`gap-6`, `space-y-6`)
- 앱 최대 폭: 1600px
- Breakpoints: Tailwind v3 기본 `sm`, `md`, `lg`, `xl`
- 학생·로그인 화면은 375px에서 가로 스크롤 없이 한 열로 동작한다.
- 교사 명단의 넓은 데이터 표는 카드 내부가 가로 스크롤 소유자다. 페이지 전체 가로 스크롤은 허용하지 않는다.

## 5. Components

### Surface Card

- Structure: semantic `section`/`aside` + border + white surface.
- Variants: normal, message, destructive.
- Spacing: `p-4`~`p-6`.
- States: default; message cards also support success/error.
- Accessibility: heading hierarchy and readable contrast.
- Motion: none.
- Layout: stack.

### Primary and Secondary Button

- Structure: native `button` with explicit `type`.
- Variants: primary slate, info sky, success emerald, destructive rose, outline.
- States: default, hover, focus-visible, disabled, loading label.
- Accessibility: minimum 40px height; primary student action 48px; text label always present.
- Motion: color transition only, 150ms class default.
- Layout: cluster or full-width stack.

### Form Field

- Structure: visible `label`, text label, native `input`.
- States: default, focus, disabled, browser validation.
- Accessibility: numeric keyboard hints where appropriate; no placeholder-only labels.
- Motion: focus color transition.
- Layout: stack.

### Status Badge and Feedback

- Variants: present/success, checked-out/warning, absent/error, neutral.
- Accessibility: color is paired with Korean text; color alone never carries status.
- Motion: none.

### Attendance Table

- Structure: semantic `table`, heading row, horizontally scrollable local wrapper.
- States: populated, empty, filtered-empty, editable row.
- Accessibility: text actions use native buttons; row actions remain keyboard reachable.
- Motion: none.
- Layout: table inside local scroll owner.

### Correction Dialog

- Structure: native `dialog`, title, student identity, dated attendance rows, close button.
- States: open, saving through parent feedback, empty date history.
- Accessibility: browser-managed modal focus and Escape close; each action names date and result.
- Motion: none.
- Layout: mobile-first stack; bounded-height list owns vertical scroll.

### Seat Map Dialog

- Structure: native `dialog`, compact status legend, classroom zones, close action.
- States: present, checked-out, not checked-in, unassigned seat, refresh error.
- Accessibility: each seat exposes its number, assigned student, and status as text; Escape closes the dialog; color never carries status alone.
- Motion: none.
- Layout: the dialog owns vertical scroll and expands through `max-w-screen-2xl`; the floor-plan canvas expands to the available dialog width with a 1120px minimum and owns horizontal scroll below tablet width. The 1–15 zone reserves 504px so eight 56px seats and their 8px gaps never overlap. Seats 58–81 form three desk columns, each with two-seat rows and a larger gap between desk columns; seats 16–22 align above the main desks and the right-side 23–29 column.
- Zone color: the teacher desk reuses the sky information ramp so it remains distinct from amber attendance warnings.

### Install Guide

- Structure: native `details`/`summary` with iOS and Android steps.
- States: collapsed, expanded.
- Accessibility: no custom disclosure JavaScript; browser keyboard semantics retained.
- Motion: none.
- Layout: stack below login card.

Existing Login, Student, and Teacher views are the state harness for these primitives. Automated component tests exercise behavioral states; browser QA covers 375px, 768px, and 1280px.

## 6. Motion & Interaction

- Interactive color changes use existing Tailwind `transition` timing.
- Layout properties are not animated.
- No decorative animation is added.
- Native dialog and details behavior is preferred over custom animation/state machinery.
- Reduced-motion users receive no essential information through motion.

## 7. Depth & Surface

Strategy: mixed borders plus subtle shadows. Cards use `border-slate-200 bg-white shadow-sm`; nested neutral areas use tonal `slate-50`. Only modal backdrops add a translucent dark layer.

## 8. Accessibility Constraints & Accepted Debt

Target: WCAG 2.2 AA, 4.5:1 body-text contrast, visible keyboard focus, labeled controls, 40px minimum routine touch target, 48px primary student action.

Relevant users:

- 스마트폰으로 빠르게 출석하는 학생
- 작은 화면 또는 확대 화면에서 명단을 확인하는 교사
- 키보드로 출결을 정정하는 교사
- 긴 Korean 이름·학번과 큰 글자 설정을 사용하는 사용자

| Item | Location | Why accepted | Owner / Exit |
| --- | --- | --- | --- |
| 교사 표는 375px에서 내부 가로 스크롤 필요 | Teacher tables | 열 수가 많아 카드형 재구성은 별도 범위 | 모바일 교사 사용 빈도가 높아질 때 카드/열 선택 UI로 교체 |
| 네이티브 스토어 배포 미제공 | Deployment | 이 제품의 모바일 배포는 설치형 PWA로 한정 | App Store/Play Store 바이너리·제출은 범위 밖 |
