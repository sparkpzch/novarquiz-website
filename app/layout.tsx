import type { Metadata } from "next";
import { connection } from "next/server";
import { headers, cookies } from "next/headers";
import { resolveTheme, THEME_KEY } from "@/lib/client/theme-preference";
import { Inter, Lexend, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/hooks/useAuth";
import { ThemeProvider } from "@/lib/hooks/useTheme";
import { ToastProvider } from "@/components/ui/Toast";
import ConsentGate from "@/components/ConsentGate";
import MediaPreconnect from "@/components/MediaPreconnect";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NovarQuiz - Interactive Quiz Platform",
  description: "A Kahoot-like quiz platform with node-based question flows, real-time scoring, and leaderboards.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce-based CSP (proxy.ts) requires every page to render dynamically so the
  // per-request nonce is stamped onto Next's <script> tags. Without this, public
  // pages (sign-in, privacy, terms) are statically prerendered with no nonce and
  // 'strict-dynamic' blocks all scripts.
  await connection();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const initialTheme = resolveTheme((await cookies()).get(THEME_KEY)?.value);
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lexend.variable} ${jakarta.variable} h-full`}
      data-theme={initialTheme}
      style={{ colorScheme: initialTheme }}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* Browser chrome must follow the app preference, not the OS theme.
            Keep this tag owned by the root layout across client navigation. */}
        <meta name="theme-color" content={initialTheme === 'dark' ? '#171717' : '#f8f9fc'} suppressHydrationWarning />
        {/* Apply the saved palette before paint, using the request's CSP nonce.
            Browsers hide the nonce attribute before hydration; suppress only
            this script's expected attribute mismatch. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: `(function(){var t=document.documentElement.dataset.theme||'light';try{var s=localStorage.getItem('novarquiz-theme');if(s==='dark'||s==='light')t=s;}catch(e){}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t==='dark'?'#171717':'#f8f9fc';})();` }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <MediaPreconnect />
        <div
          aria-hidden="true"
          className="nq-root-bg fixed inset-0 -z-10"
        />
        <AuthProvider>
          <ThemeProvider initialTheme={initialTheme}>
            <ToastProvider>
              {children}
              <ConsentGate />
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
