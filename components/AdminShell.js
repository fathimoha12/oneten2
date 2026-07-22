import Head from "next/head";
import Script from "next/script";
import React from "react";
import { createRoot } from "react-dom/client";

const ASSET_VERSION = "20260722-dark-balance-3";

if (typeof window !== "undefined") {
  window.React = React;
  window.ReactDOM = { createRoot };
  window.API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
}

export default function AdminShell() {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#f20d14" />
        <meta name="robots" content="noindex,nofollow" />
        <meta name="one-ten-api-base" content={process.env.NEXT_PUBLIC_API_BASE_URL || ""} />
        <title>ONE TEN Admin</title>
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      </Head>
      <div id="admin-root" />
      <Script src={`/admin.js?v=${ASSET_VERSION}`} strategy="afterInteractive" />
    </>
  );
}
