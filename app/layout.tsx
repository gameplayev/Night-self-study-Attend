import type { Metadata } from 'next';
import '../src/index.css';

export const metadata: Metadata = {
  title: '야자 출석 시스템',
  description: '학생과 교사가 함께 쓰는 야간자율학습 출석 관리 앱',
  icons: {
    icon: '/logo.jpeg',
    apple: '/logo.jpeg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
