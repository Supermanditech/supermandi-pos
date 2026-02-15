// T-155: Customer Profiles service — API calls for customer management
import { apiClient } from "./api/apiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  totalPurchasesMinor: number;
  visitCount: number;
  lastVisitAt: string | null;
  createdAt: string;
}

export interface CustomerDetail extends Customer {
  purchases: CustomerPurchase[];
}

export interface CustomerPurchase {
  saleId: string;
  billRef: string;
  totalMinor: number;
  itemCount: number;
  paymentMode: string;
  createdAt: string;
}

export interface CreateCustomerRequest {
  name: string;
  phone: string;
  email?: string;
  address?: string;
}

export interface UpdateCustomerRequest {
  name?: string;
  email?: string;
  address?: string;
}

interface CustomersResponse {
  customers: Customer[];
}

// =============================================================================
// API CALLS
// =============================================================================

export async function getCustomers(query?: string): Promise<Customer[]> {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  const response = await apiClient.get<CustomersResponse>(
    `/api/v1/pos/customers${params}`
  );
  return response.customers;
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail> {
  const response = await apiClient.get<CustomerDetail>(
    `/api/v1/pos/customers/${encodeURIComponent(customerId)}`
  );
  return response;
}

export async function createCustomer(data: CreateCustomerRequest): Promise<Customer> {
  const response = await apiClient.post<{ customer: Customer }>(
    `/api/v1/pos/customers`,
    data
  );
  return response.customer;
}

export async function updateCustomer(
  customerId: string,
  data: UpdateCustomerRequest
): Promise<Customer> {
  const response = await apiClient.patch<{ customer: Customer }>(
    `/api/v1/pos/customers/${encodeURIComponent(customerId)}`,
    data
  );
  return response.customer;
}
