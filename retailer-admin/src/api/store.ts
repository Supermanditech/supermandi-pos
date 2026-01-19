import { authFetch } from '../lib/api';

const API_BASE = '/api/v1/retailer-admin';

interface Store {
  id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  status?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export async function fetchStore(accessToken: string): Promise<ApiResponse<Store>> {
  const response = await authFetch(`${API_BASE}/store`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch store');
  }

  return response.json();
}

export async function fetchProducts(accessToken: string): Promise<ApiResponse<unknown[]>> {
  const response = await authFetch(`${API_BASE}/products`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch products');
  }

  return response.json();
}

export async function fetchInventory(accessToken: string): Promise<ApiResponse<unknown[]>> {
  const response = await authFetch(`${API_BASE}/inventory`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch inventory');
  }

  return response.json();
}

export async function fetchSuppliers(accessToken: string): Promise<ApiResponse<unknown[]>> {
  const response = await authFetch(`${API_BASE}/suppliers`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch suppliers');
  }

  return response.json();
}

export async function fetchCompliance(accessToken: string): Promise<ApiResponse<unknown[]>> {
  const response = await authFetch(`${API_BASE}/compliance`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch compliance documents');
  }

  return response.json();
}
