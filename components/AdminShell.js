import Head from "next/head";
import Script from "next/script";

const ASSET_VERSION = "20260716-pwa-security";

export default function AdminShell() {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f20d14" />
        <title>ONE TEN Admin</title>
        <link rel="stylesheet" href={`/styles.css?v=${ASSET_VERSION}`} />
      </Head>
      <div id="admin-root" />
      <Script src="https://unpkg.com/react@18/umd/react.production.min.js" strategy="afterInteractive" />
      <Script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" strategy="afterInteractive" />
      <Script src={`/config.js?v=${ASSET_VERSION}`} strategy="afterInteractive" />
      <Script src={`/admin.js?v=${ASSET_VERSION}`} strategy="afterInteractive" />
    </>
  );
}
