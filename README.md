# 야자 출석 시스템

학생과 교사가 함께 쓰는 설치형 PWA 야자 출석 관리 앱입니다.

## 구조

```text
Next.js App Router
├─ 브라우저 UI
└─ Route Handler API -> Supabase PostgreSQL
```

- 브라우저는 Supabase에 직접 접근하지 않습니다.
- 모든 데이터 접근은 Next 서버 라우트에서 `SUPABASE_SERVICE_ROLE_KEY`로 처리합니다.
- 로그인 세션은 `HttpOnly` 쿠키로 관리합니다.
- 변경 요청은 CSRF 토큰을 추가로 확인합니다.
- 교사 고유 번호는 보안 해시로 저장합니다.
- 학생 기기는 서버가 발급한 브라우저 기기 쿠키로 관리합니다.

## 주요 기능

- 학생 출석/퇴실 처리
- 학생/교사 로그인
- 학생 첫 기기 등록 시 학번과 이름 확인
- 한 기기는 한 학생에게만 등록
- 학생 한 명당 최대 2개 기기 등록
- 학생 계정은 등록된 기기에서만 출석/퇴실 처리
- 교사 계정은 학생 추가/수정/삭제, 교사 계정 추가/수정, 기기 초기화, 날짜별 출결 확인, 수동 출석/퇴실 처리
- 학생별 결석 횟수의 근거가 되는 날짜별 출결 기록 정정
- iOS Safari와 Android Chrome 홈 화면 설치(PWA)

모바일 설치와 Vercel 운영 절차는 [모바일 배포 가이드](docs/mobile-deployment.md)를 참고합니다.

## 개발 실행

Supabase 프로젝트에서 SQL editor를 열고 먼저 스키마를 적용합니다.

```sql
-- supabase/schema.sql 전체 내용을 Supabase SQL editor에서 실행
```

`Could not find the table 'public.users' in the schema cache` 오류가 보이면 아직 이 SQL이 적용되지 않았거나 Supabase API 캐시가 갱신되지 않은 상태입니다. `supabase/schema.sql`을 끝까지 다시 실행하면 마지막 줄에서 캐시를 갱신합니다.

`.env.local`에 Supabase 서버 환경 변수를 입력한 뒤 실행합니다.

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY`에는 anon/public key가 아니라 Supabase Dashboard > Project Settings > API의 `service_role` secret key를 넣어야 합니다. anon key를 넣으면 `new row violates row-level security policy` 오류가 납니다.

```bash
npm run dev
```

프론트엔드와 API가 모두 `http://localhost:3000`에서 실행됩니다.

## 운영 빌드

```bash
npm run build
NODE_ENV=production \
BOOTSTRAP_TEACHER_IDENTIFIER='처음 사용할 교사 고유 번호' \
BOOTSTRAP_TEACHER_NAME='처음 사용할 교사 이름' \
npm start
```

운영 서버는 반드시 HTTPS 뒤에서 배포해야 합니다. Supabase 서비스 역할 키는 서버 환경 변수로만 보관해야 하며 브라우저에 노출하면 안 됩니다. 첫 실행 시 위 환경 변수로 최초 교사 계정을 한 번만 만들고, 이후 교사 계정은 관리자 화면에서 추가합니다.

