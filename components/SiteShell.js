import Head from "next/head";
import Script from "next/script";

const ASSET_VERSION = "20260716-pwa-security";

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
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ONE TEN" />
        <title>{title}</title>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/assets/logo-red.png" />
        <link rel="preload" as="image" href="/assets/ai-hero.png" />
        <link rel="stylesheet" href={`/styles.css?v=${ASSET_VERSION}`} />
      </Head>
      <div id="root" />
      <Script src="https://unpkg.com/react@18/umd/react.production.min.js" strategy="afterInteractive" />
      <Script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" strategy="afterInteractive" />
      <Script src={`/config.js?v=${ASSET_VERSION}`} strategy="afterInteractive" />
      <Script src={`/app.js?v=${ASSET_VERSION}`} strategy="afterInteractive" />
    </>
  );
}
