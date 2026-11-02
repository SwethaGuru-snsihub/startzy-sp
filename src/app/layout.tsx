import type { Metadata } from 'next';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import './globals.css';
import Shell from '@/components/shell/Shell';
import { MockAuthProvider } from '@/context/MockAuthContext';

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'], weight: ['500', '700'] });

export const metadata: Metadata = {
  title: 'Founder HQ',
  description: 'Startzy × Solution Planning: run your company from one office.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${jetbrains.variable}`}>
        <MockAuthProvider>
          <Shell>{children}</Shell>
        </MockAuthProvider>
      </body>
    </html>
  );
}
