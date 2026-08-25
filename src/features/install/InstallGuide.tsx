export function InstallGuide() {
  return (
    <details className="mt-4 w-full rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
      <summary className="min-h-10 cursor-pointer py-2 font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
        앱처럼 홈 화면에 설치하기
      </summary>
      <div className="mt-4 space-y-4">
        <section>
          <h2 className="font-semibold text-slate-900">iPhone/iPad (Safari)</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Safari의 공유 메뉴를 누릅니다.</li>
            <li>‘홈 화면에 추가’를 선택합니다.</li>
            <li>‘추가’를 눌러 설치를 완료합니다.</li>
          </ol>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900">Android (Chrome)</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Chrome 메뉴를 엽니다.</li>
            <li>‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택합니다.</li>
            <li>확인을 눌러 설치를 완료합니다.</li>
          </ol>
        </section>
      </div>
    </details>
  );
}
