import Head from "next/head";
import Image from "next/image";
import Script from "next/script";
import React from "react";
import { createRoot } from "react-dom/client";

const ASSET_VERSION = "20260722-dark-balance-3";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://oneten2.vercel.app").replace(/\/$/, "");
const BRAND_ICON_URL = `${SITE_URL}/assets/one-ten-app-icon.png`;
const loaderSeenScript = `
try {
  if (localStorage.getItem("oneTenLoaderSeen") === "1" || sessionStorage.getItem("oneTenLoaderSeen") === "1") {
    document.documentElement.classList.add("one-ten-loader-seen");
  }
} catch (error) {}
`;

if (typeof window !== "undefined") {
  window.React = React;
  window.ReactDOM = { createRoot };
  window.API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
}

export default function SiteShell({
  title = "ONE TEN | Men's Fashion",
  description = "ONE TEN men's fashion ecommerce store with $1 to $10 products.",
}) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "ONE TEN",
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: BRAND_ICON_URL,
          width: 1254,
          height: 1254,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "ONE TEN",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#f20d14" />
        <meta name="description" content={description} />
        <meta name="application-name" content="ONE TEN" />
        <meta name="one-ten-api-base" content={process.env.NEXT_PUBLIC_API_BASE_URL || ""} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ONE TEN" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:site_name" content="ONE TEN" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={BRAND_ICON_URL} />
        <meta property="og:image:width" content="1254" />
        <meta property="og:image:height" content="1254" />
        <meta property="og:image:alt" content="ONE TEN logo" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={BRAND_ICON_URL} />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="msapplication-TileImage" content="/icons/icon-192.png" />
        <title>{title}</title>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/icons/favicon-48.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="image_src" href={BRAND_ICON_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
        <script dangerouslySetInnerHTML={{ __html: loaderSeenScript }} />
        <link rel="preload" as="image" href="/assets/logo-red.png" />
        <link rel="preload" as="image" href="/assets/ai-hero.png" />
      </Head>
      <div id="root">
        <main className="site-loader" role="status" aria-live="polite" aria-label="ONE TEN loading">
          <span className="site-loader-rings site-loader-rings-top" aria-hidden="true" />
          <span className="site-loader-rings site-loader-rings-bottom" aria-hidden="true" />
          <div className="site-loader-center">
            <Image src="/assets/logo-red.png" alt="ONE TEN" width={887} height={359} priority unoptimized />
            <p>Loading...</p>
            <div className="site-loader-track" aria-hidden="true"><span /></div>
          </div>
        </main>
      </div>
      <Script src={`/app.js?v=${ASSET_VERSION}`} strategy="afterInteractive" />
    </>
  );
}
