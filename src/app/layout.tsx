import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Providers } from "@/components/Providers";
import { PWAInstaller } from "@/components/PWAInstaller";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.paktechjobs.com"),
  title: {
    default: "Pakistan Tech Job Board — Software, AI & IT Jobs 2026 | PakTechJobs",
    template: "%s | PakTechJobs",
  },
  description:
    "Browse 100+ software engineering, AI, and IT jobs in Pakistan. Updated daily. Roles in Lahore, Karachi, Islamabad & Remote. Free for developers. Also: salary guides, career tools, and AI resume checker.",
  keywords: [
    "software engineer salary in pakistan",
    "salary of software engineer in pakistan",
    "software engineering salary in pakistan",
    "cyber security salary in pakistan",
    "cyber security salary",
    "mern developer salary pakistan",
    "mern developer salary lahore",
    "react developer salary pakistan",
    "frontend developer salary pakistan",
    "backend developer salary karachi",
    "full stack developer salary pakistan",
    "ai engineer salary pakistan",
    "data scientist salary pakistan",
    "machine learning engineer salary pakistan",
    "software engineer scope in pakistan",
    "highest paying tech jobs in pakistan",
    "developer salary calculator pakistan",
    "income tax calculator pakistan salary",
    "freelance rate calculator pakistan",
    "salary after tax pakistan",
    "fresh graduate software engineer salary pakistan",
    "senior software engineer salary in pakistan",
    "computer engineer salary in pakistan",
    "node js developer salary pakistan",
    "software engineering internship salary pakistan",
    "internship stipend pakistan",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "PakTechJobs",
    title: "Software Engineer Salary in Pakistan 2026 — PakTechJobs",
    description:
      "Complete salary guides for software engineers, MERN developers, cyber security experts, AI engineers & more across Lahore, Karachi & Islamabad. Free career tools included.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PakTechJobs — Pakistan Tech Salary Guides & Career Tools",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@PakTechJobs",
    title: "Software Engineer Salary in Pakistan 2026 — PakTechJobs",
    description:
      "Software engineer salary Pakistan, cyber security salary, developer salaries Lahore, Karachi & Islamabad. Free calculators & AI resume checker.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "PakTechJobs",
    "url": "https://www.paktechjobs.com",
    "logo": "https://www.paktechjobs.com/og-image.png",
    "email": "paktechhjobs@gmail.com",
    "description": "Pakistan's resource for tech salary data, career tools, and professional development.",
    "areaServed": "PK",
    "sameAs": [
      "https://twitter.com/PakTechJobs",
      "https://www.linkedin.com/company/paktechjobs"
    ]
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "PakTechJobs",
    "url": "https://www.paktechjobs.com",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://www.paktechjobs.com/salaries?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <html lang="en">
      <head>
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-XKS083QWTM"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-XKS083QWTM');
          `}
        </Script>

        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&d)||(t==='system'&&d)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#10b981" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="PakTechJobs" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Navbar />
          <main className="min-h-screen pt-16">{children}</main>
          <Footer />
          <PWAInstaller />
        </Providers>
      </body>
    </html>
  );
}
