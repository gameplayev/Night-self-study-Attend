# 모바일 PWA 배포 가이드

모바일 배포 대상은 네이티브 앱이 아닌 HTTPS 설치형 PWA다. 배포 전후 확인은 실제 운영 URL에서 수행한다. 이 문서는 라이브 배포나 실제 iOS 기기 검증을 의미하지 않는다.

## 사전 조건

- Vercel 프로젝트와 배포할 Git 브랜치
- Supabase 프로젝트에 `supabase/schema.sql` 적용
- 서버 환경 변수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Node.js와 npm 설치
- HTTPS가 가능한 운영 도메인

`SUPABASE_SERVICE_ROLE_KEY`는 anon/public/publishable key가 아닌 Supabase secret/service-role key여야 한다. `NEXT_PUBLIC_*`로 만들거나 브라우저 코드에 넣지 않는다. 세션은 `HttpOnly` 쿠키로 유지하고 변경 요청은 CSRF 검사를 통과해야 하므로, 모바일에서도 Supabase에 직접 연결하지 않는다.

## Vercel 배포

1. Vercel에서 프로젝트를 연결하고 배포 브랜치를 선택한다.
2. `Settings → Environment Variables`에 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`를 Production 환경으로 추가한다. 값 변경 후에는 새 배포를 실행한다.
3. `Settings → Domains`에서 HTTPS가 활성화된 운영 도메인을 확인한다. 출결·위치 요청은 `https://` URL에서만 점검한다.
4. 로컬에서 배포 산출물을 확인한다.

   ```bash
   npm ci
   npm run build
   ```

5. 배포 직후 다음 응답을 기록한다. `/api/health`는 HTTP 200, manifest는 HTTP 200과 `application/manifest+json`을 기대한다. 404/5xx면 모바일 설치를 진행하지 않는다.

   ```bash
   curl -i https://운영도메인.example/api/health
   curl -i https://운영도메인.example/manifest.webmanifest
   curl -I https://운영도메인.example/logo192.png
   curl -I https://운영도메인.example/logo512.png
   curl -I https://운영도메인.example/apple-touch-icon.png
   ```

Next.js App Router의 `app/manifest.ts`와 HTTPS 설치 경로는 [공식 Progressive Web Apps 가이드](https://nextjs.org/docs/app/guides/progressive-web-apps)를 따른다. manifest의 이름·아이콘·`start_url`·`standalone` 표시 방식은 [web.dev Web App Manifest 참고서](https://web.dev/learn/pwa/web-app-manifest?hl=en)를 따른다.

## 모바일 설치

실제 기기에서 운영 HTTPS URL을 연다.

- iOS Safari: `공유` → `홈 화면에 추가` → `추가`
- Android Chrome: 메뉴(`⋮`) → `앱 설치` 또는 `홈 화면에 추가` → 확인

## 실제 기기 스모크 체크

각 기기에서 다음을 순서대로 확인하고 날짜·기기·결과를 기록한다.

- [ ] 운영 URL이 HTTPS이며 `/api/health`가 HTTP 200이다.
- [ ] `/manifest.webmanifest`가 HTTP 200이고 `logo192.png`, `logo512.png`, `apple-touch-icon.png`가 모두 열린다.
- [ ] 교사 로그인과 로그아웃이 동작하고 세션 쿠키가 브라우저 화면에 노출되지 않는다.
- [ ] 학생 기기 등록 후 위치 권한을 허용했을 때 현재 위치 기반 출석이 처리된다.
- [ ] 위치 권한 거부, 로그인 만료, 잘못된 요청이 오류 메시지로 끝나며 출석 기록이 임의로 바뀌지 않는다.
- [ ] 학생 출석과 퇴실이 각각 한 번씩 처리된다.
- [ ] 교사가 학생별 `결석 기록 수정`을 열고 날짜를 선택해 정상출석/결석으로 정정한다.
- [ ] 정정 후 해당 날짜와 결석 합계가 다시 표시된다.
- [ ] Safari와 Chrome에서 홈 화면 아이콘으로 재실행하고 로그인/출석 화면이 정상 표시된다.

스모크 체크는 실제 iOS 또는 Android 기기에서 수행해야 한다. 로컬 브라우저와 정적 빌드만으로 통과를 주장하지 않는다.

## 모니터링과 롤백

- 배포 후 `/api/health`를 외부 모니터링 대상으로 등록하고 HTTP 200이 아닌 응답과 응답 지연을 알림으로 받는다.
- Vercel 배포 로그와 Supabase 로그에서 로그인·출석·정정 오류를 확인한다. 서비스 역할 키는 로그에 출력하지 않는다.
- 오류가 확인되면 Vercel `Deployments`에서 마지막 정상 배포를 선택해 `Promote to Production`으로 되돌린다.
- 롤백 후 `/api/health`, `/manifest.webmanifest`, 로그인, 출석을 다시 확인하고 문제 배포의 환경 변수·로그를 보존한다.

## 범위 밖

- offline attendance writes/cache
- push notification
- App Store/Play Store 바이너리 및 제출
- Capacitor
