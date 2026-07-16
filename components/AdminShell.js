import Head from "next/head";
import Script from "next/script";
import React from "react";
import { createRoot } from "react-dom/client";

const ASSET_VERSION = "20260716-white-screen-fix";

if (typeof window !== "undefined") {
  window.React = React;
  window.ReactDOM = { createRoot };
  window.API_BASE_URL = "";
}

export default function AdminShell() {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f20d14" />
        <title>ONE TEN Admin</title>
      </Head>
      <div id="admin-root" />
      <Script src={`/admin.js?v=${ASSET_VERSION}`} strategy="afterInteractive" />
    </>
  );
}
