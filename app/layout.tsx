import type { Metadata } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
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
        {children}
        <ChatPanel />
      </body>
    </html>
  );
}
