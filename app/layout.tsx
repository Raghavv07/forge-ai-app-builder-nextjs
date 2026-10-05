import type { Metadata, Viewport } from "next";
import { DM_Sans, Lora } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import Header from "@/components/Header";
import { dark } from "@clerk/themes";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider";
import { Toaster } from "@/components/ui/sonner";

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-sans",
});

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://forge-app-builder.vercel.app"
  ),
  title: {
    default: "Forge - AI App Builder",
    template: "%s | Forge",
  },
  description:
    "Build full-stack and interactive React applications in seconds with Gemini AI. Live preview, sandbox editing, smart dependency resolution, and instant export.",
  keywords: [
    "AI app builder",
    "React generator",
    "Next.js 16",
    "Tailwind CSS",
    "Gemini AI",
    "web development",
    "Sandpack",
  ],
  authors: [{ name: "Forge" }],
  creator: "Forge",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "Forge - AI App Builder",
    description:
      "Generate production-ready React apps with AI in seconds. Live preview and full source code.",
    siteName: "Forge",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "Forge - AI App Builder",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Forge - AI App Builder",
    description:
      "Generate production-ready React apps with AI in seconds. Live preview and full source code.",
    images: ["/logo.png"],
  },
  icons: {
    icon: "/logo-short.jpeg",
    apple: "/logo-short.jpeg",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        theme: dark,
      }}
    >




      <html lang="en" suppressHydrationWarning>
        <body className={`${lora.variable} ${dmSans.variable} font-sans`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <MotionProvider>
              <Header />

              <main>{children}</main>

              <Toaster richColors />
            </MotionProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
