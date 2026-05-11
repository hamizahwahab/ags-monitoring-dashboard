import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASG Monitoring Dashboard",
  description: "After Sales Department Monitoring Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-[#050505] text-white">
        {children}
      </body>
    </html>
  );
}