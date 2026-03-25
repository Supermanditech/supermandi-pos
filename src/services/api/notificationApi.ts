import { apiClient } from "./apiClient";

// GCP-STG-0749: POS Notification Center API

export type NotificationType =
  | "ORDER_STATUS"
  | "LOW_STOCK"
  | "PAYMENT_RECEIVED"
  | "EXPIRY_ALERT"
  | "SYSTEM";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  data?: { screen?: string; [key: string]: unknown };
  createdAt: string;
};

export type NotificationsResponse = {
  notifications: Notification[];
  total: number;
  unread: number;
};

export async function getNotifications(params?: {
  unread?: boolean;
  limit?: number;
}): Promise<NotificationsResponse> {
  const query = new URLSearchParams();
  if (params?.unread) query.set("unread", "true");
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiClient.get<NotificationsResponse>(
    `/api/v1/pos/notifications${qs ? `?${qs}` : ""}`
  );
}

export async function markNotificationRead(
  id: string
): Promise<{ success: boolean }> {
  return apiClient.patch<{ success: boolean }>(
    `/api/v1/pos/notifications/${id}/read`
  );
}

export async function markAllNotificationsRead(): Promise<{
  success: boolean;
  count: number;
}> {
  return apiClient.patch<{ success: boolean; count: number }>(
    "/api/v1/pos/notifications/read-all"
  );
}
