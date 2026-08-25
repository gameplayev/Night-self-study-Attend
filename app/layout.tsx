import type { Metadata, Viewport } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import '../src/index.css';

export const metadata: Metadata = {
  title: '야자 출석 시스템',
  description: '학생과 교사가 함께 쓰는 야간자율학습 출석 관리 앱',
  icons: {
    icon: '/logo.jpeg',
    apple: '/logo.jpeg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '야자 출석',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
