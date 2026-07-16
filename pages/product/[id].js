import SiteShell from "../../components/SiteShell";

export async function getStaticPaths() {
  return { paths: [], fallback: "blocking" };
}

export async function getStaticProps({ params }) {
  return {
    props: {
      productId: String(params.id || ""),
    },
    revalidate: 60,
  };
}

export default function ProductRoute({ productId }) {
  return <SiteShell title={`Product ${productId} | ONE TEN`} />;
}
