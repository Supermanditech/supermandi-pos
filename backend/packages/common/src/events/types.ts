// V3.0.9: Canonical Event Envelope (all services must use)
export interface DomainEvent<TPayload = unknown> {
  eventId: string;          // UUID - unique per event
  eventType: string;        // "inventory.stock.changed.v1"
  occurredAt: string;       // ISO 8601 timestamp
  correlationId?: string;   // Trace ID for distributed tracing
  producer: string;         // "inventory-service"
  payload: TPayload;
}

// Event types enum
export const EventTypes = {
  // Order Service publishes
  'orders.po.created.v1': 'PO created',
  'orders.po.status_changed.v1': 'PO status changed',
  'orders.po.received.v1': 'GRN completed',

  // Inventory Service publishes
  'inventory.stock.changed.v1': 'Stock level changed',

  // Reorder Service publishes
  'reorder.draft.created.v1': 'Pending reorder created',

  // Supplier Service publishes
  'supplier.linked.v1': 'Supplier linked to store',
  'supplier.catalog_updated.v1': 'Supplier updated catalog',
} as const;

export type EventType = keyof typeof EventTypes;
