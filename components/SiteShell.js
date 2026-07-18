import Head from "next/head";
import Script from "next/script";
import React from "react";
import { createRoot } from "react-dom/client";

const ASSET_VERSION = "20260718-loading-screen-3";

if (typeof window !== "undefined") {
  window.React = React;
  window.ReactDOM = { createRoot };
  window.API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
}

export default function SiteShell({
  title = "ONE TEN | Men's Fashion",
  description = "ONE TEN men's fashion ecommerce store with $1 to $10 products.",
}) {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f20d14" />
        <meta name="description" content={description} />
        <meta name="one-ten-api-base" content={process.env.NEXT_PUBLIC_API_BASE_URL || ""} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ONE TEN" />
        <title>{title}</title>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/assets/logo-red.png" />
        <link rel="preload" as="image" href="/assets/logo-red.png" />
        <link rel="preload" as="image" href="/assets/ai-hero.png" />
      </Head>
      <div id="root">
        <main className="site-loader" role="status" aria-live="polite" aria-label="ONE TEN loading">
          <span className="site-loader-rings site-loader-rings-top" aria-hidden="true" />
          <span className="site-loader-rings site-loader-rings-bottom" aria-hidden="true" />
          <div className="site-loader-center">
            <img src="/assets/logo-red.png" alt="ONE TEN" />
            <p>Loading...</p>
            <div className="site-loader-track" aria-hidden="true"><span /></div>
          </div>
        </main>
      </div>
      <Script src={`/app.js?v=${ASSET_VERSION}`} strategy="afterInteractive" />
    </>
  );
}
