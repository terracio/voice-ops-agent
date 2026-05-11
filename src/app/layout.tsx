import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MealPlan VoiceOps",
  description: "Production-shaped voice operations demo for meal-plan workflows."
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
