import { apiGet, apiPost, apiPut, apiDelete } from './poketrace';

export async function fetchProducts(type) {
  const params = type ? `?type=${encodeURIComponent(type)}` : '';
  return apiGet(`/api/products${params}`);
}

export async function fetchProduct(id) {
  return apiGet(`/api/products/${encodeURIComponent(id)}`);
}

export async function createCheckoutSession(items) {
  return apiPost('/api/checkout', { items });
}

// --- Admin ---

export async function fetchAdminProducts() {
  return apiGet('/api/admin/products');
}

export async function createProduct(product) {
  return apiPost('/api/admin/products', product);
}

export async function updateProduct(id, product) {
  return apiPut(`/api/admin/products/${encodeURIComponent(id)}`, product);
}

export async function deleteProduct(id) {
  return apiDelete(`/api/admin/products/${encodeURIComponent(id)}`);
}

export async function fetchAdminOrders() {
  return apiGet('/api/admin/orders');
}

export async function updateOrderStatus(id, status) {
  return apiPut(`/api/admin/orders/${encodeURIComponent(id)}`, { status });
}
