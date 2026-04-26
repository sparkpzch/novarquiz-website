import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/hooks/useAuth";
import { ThemeProvider } from "@/lib/hooks/useTheme";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NovarQuiz - Interactive Quiz Platform",
  description: "A Kahoot-like quiz platform with node-based question flows, real-time scoring, and leaderboards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans antialiased">
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10"
          style={{
            background:
              'linear-gradient(180deg, rgba(4,96,169,0.18), transparent 20%), radial-gradient(circle at bottom right, rgba(146,191,255,0.22), transparent 26%), linear-gradient(180deg, #70A2F9 0%, #92BFFF 50%, #c4deff 100%)',
          }}
        />
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
