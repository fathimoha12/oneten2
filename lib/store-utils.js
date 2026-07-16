function safeCartItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: item && item.id,
      size: String((item && item.size) || "").toUpperCase(),
      qty: Math.max(1, Number((item && item.qty) || 1) || 1),
    }))
    .filter((item) => item.id !== undefined && item.id !== null);
}

function cartKey(item) {
  return `${item && item.id}::${String((item && item.size) || "").toUpperCase()}`;
}

function getProductSizes(product) {
  return (Array.isArray(product && product.product_sizes) ? product.product_sizes : [])
    .map((item) => ({
      size: String(item && item.size ? item.size : "").trim().toUpperCase(),
      stock: Math.max(0, Number(item && item.stock) || 0),
    }))
    .filter((item) => item.size && item.stock > 0);
}

function getSizeStock(product, size) {
  const sizes = getProductSizes(product);
  if (!sizes.length) return Math.max(0, Number(product && product.stock) || 0);
  const match = sizes.find((item) => item.size === String(size || "").toUpperCase());
  return match ? match.stock : 0;
}

function normalizeWhatsAppNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "252633454984";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `252${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("63")) return `252${digits}`;
  return digits;
}

module.exports = {
  cartKey,
  getProductSizes,
  getSizeStock,
  normalizeWhatsAppNumber,
  safeCartItems,
};
