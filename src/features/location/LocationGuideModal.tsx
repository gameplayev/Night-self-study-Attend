import { LocationCapability } from '../../services/locationService';

export function LocationGuideModal({
  capability,
  onClose,
  onContinue,
}: {
  capability: LocationCapability | null;
  onClose: () => void;
  onContinue: () => void;
}) {
  // 같은 출석 기능을 여러 기기에서 쓰므로, 운영체제별 복구 방법을 한 모달 안에서 함께 안내한다.
  const guideItems = [
    {
      title: 'iPhone / iPad',
      steps: [
        '브라우저가 위치 사용을 물으면 `허용`을 누릅니다.',
        '막혀 있으면 `설정 > 개인정보 보호 및 보안 > 위치 서비스`를 켭니다.',
        'Safari나 사용 중인 브라우저의 사이트 위치 권한을 다시 허용합니다.',
      ],
    },
    {
      title: 'Android 휴대폰 / 태블릿',
      steps: [
        '브라우저가 위치 사용을 물으면 `허용`을 누릅니다.',
        'Chrome이라면 `설정 > 사이트 설정 > 위치`에서 위치 사용을 허용합니다.',
        '기기 자체의 위치 기능도 켜져 있어야 합니다.',
      ],
    },
    {
      title: 'Windows / macOS PC',
      steps: [
        '주소창 왼쪽 사이트 정보에서 위치 권한을 `허용`으로 바꿉니다.',
        '브라우저에서 위치가 막혀 있으면 사이트 권한을 다시 열어 허용합니다.',
        '운영체제의 위치 서비스가 꺼져 있으면 함께 켭니다.',
      ],
    },
  ];

  const currentStatus = !capability
    ? '확인 중'
    : !capability.isSecureContext
      ? '현재 접속 주소에서 요청 불가'
      : !capability.hasGeolocation
        ? '이 기기에서 지원 안 됨'
        : capability.permissionState === 'denied'
          ? '현재 차단됨'
          : capability.permissionState === 'granted'
            ? '이미 허용됨'
            : '권한 요청 가능';

  return (
    <div className="fixed inset-0 z-20 grid place-items-center overflow-y-auto bg-slate-950/45 px-4 py-6">
      <section className="w-full max-w-2xl rounded-md bg-white p-5 shadow-xl">
        <p className="text-sm font-medium text-slate-500">위치 권한 안내</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          출석 전에 위치 권한을 허용해 주세요
        </h2>
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-slate-700">현재 상태</span>
            <span
              className={`rounded px-2 py-1 text-xs font-semibold ${
                currentStatus === '권한 요청 가능' ||
                currentStatus === '이미 허용됨'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {currentStatus}
            </span>
          </div>
          {!capability?.isSecureContext && (
            <p className="mt-2 text-slate-600">
              현재 주소에서는 브라우저가 위치 권한 팝업을 띄우지 않습니다.
              HTTPS 주소 또는 설치된 앱으로 접속해야 합니다.
            </p>
          )}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {guideItems.map((item) => (
            <section
              key={item.title}
              className="rounded-md border border-slate-200 p-4 text-sm"
            >
              <h3 className="font-semibold text-slate-900">{item.title}</h3>
              <ol className="mt-3 space-y-2 text-slate-700">
                {item.steps.map((step, index) => (
                  <li key={step}>
                    {index + 1}. {step}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={
              capability !== null &&
              (!capability.isSecureContext || !capability.hasGeolocation)
            }
            className="h-10 flex-1 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            위치 권한 요청하기
          </button>
        </div>
      </section>
    </div>
  );
}
