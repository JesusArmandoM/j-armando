import type { Metadata } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import Link from "next/link";
import { ChatPanel } from "./chat/chat-panel";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "J. Armando",
  description:
    "J. Armando — considered garments, cut with precision. A clothing house for everyday silhouettes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${hankenGrotesk.variable}`}
    >
      <body>
        <header className="site-header" data-testid="site-header">
          <div className="site-header__inner">
            <Link href="/" className="site-header__brand">
              J. Armando
            </Link>
            <nav className="site-header__nav" aria-label="Main Navigation">
              <Link href="/catalog" className="site-header__link">
                Collection
              </Link>
              <Link href="/cart" className="site-header__link">
                Cart
              </Link>
              <Link href="/account" className="site-header__link" data-testid="account-nav-link">
                Account
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <ChatPanel />
      </body>
    </html>
  );
}
