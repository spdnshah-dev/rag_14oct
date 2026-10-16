import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppStateProvider } from "@/components/AppState";
import { Sidebar } from "@/components/Sidebar";
import { APP_NAME } from "@/lib/app";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Ask questions about your files",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="font-sans text-[15px] leading-normal antialiased">
        <AppStateProvider>
          <div className="flex min-h-dvh flex-wrap bg-page text-ink">
            <Sidebar />
            <main className="flex min-w-0 flex-[999_1_560px] flex-col px-[clamp(16px,4vw,56px)] py-10">
              {children}
            </main>
          </div>
        </AppStateProvider>
      </body>
    </html>
  );
}
