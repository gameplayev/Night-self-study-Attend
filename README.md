# 야자 출석 시스템

학생과 교사가 함께 쓰는 웹 전용 야자 출석 관리 앱입니다.

## 구조

```text
Next.js App Router
├─ 브라우저 UI
└─ Route Handler API -> SQLite
```

- 브라우저는 데이터베이스에 직접 접근하지 않습니다.
- 모든 데이터 접근은 Next 서버 라우트에서 로컬 SQLite 파일로 처리합니다.
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

## 개발 실행

Node.js의 내장 SQLite 모듈을 사용하므로 Node.js `22.5.0` 이상에서 실행합니다.

```bash
npm install
npm run dev
```

기본 DB 파일은 `data/attend.sqlite`에 자동 생성됩니다. 다른 위치를 쓰려면 서버 실행 전에 `SQLITE_PATH`를 지정합니다.

```bash
SQLITE_PATH=/absolute/path/attend.sqlite npm run dev
```

프론트엔드와 API가 모두 `http://localhost:3000`에서 실행됩니다.

개발 모드에서 DB가 비어 있으면 기본 교사 계정과 샘플 학생이 자동 생성됩니다.

- 선생님 이름: `담당 교사`
- 선생님 고유 번호: `teacher01`

## 운영 빌드

```bash
npm run build
NODE_ENV=production \
SQLITE_PATH=/absolute/path/attend.sqlite \
BOOTSTRAP_TEACHER_IDENTIFIER='처음 사용할 교사 고유 번호' \
BOOTSTRAP_TEACHER_NAME='처음 사용할 교사 이름' \
npm start
```

운영 서버는 반드시 HTTPS 뒤에서 배포해야 합니다. 첫 실행 시 위 환경 변수로 최초 교사 계정을 한 번만 만들고, 이후 교사 계정은 관리자 화면에서 추가합니다.

SQLite는 서버 로컬 파일에 저장됩니다. 서버를 옮기거나 재배포할 때는 `SQLITE_PATH`가 가리키는 DB 파일을 함께 백업하고 복원해야 합니다.

