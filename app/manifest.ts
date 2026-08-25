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
