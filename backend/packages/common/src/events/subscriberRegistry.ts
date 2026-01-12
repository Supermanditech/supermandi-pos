// Subscriber Registry - V3.0.9 compliant
// Maps event types to subscriber-specific queues (FANOUT pattern)
//
// V3.0.9 CRITICAL: Bull queues are WORK QUEUES (load-balanced), NOT pub/sub!
// If 2 services consume the same queue, jobs are distributed randomly between them.
// FIX: Each consumer gets its own queue. Outbox worker FANS OUT to all subscriber queues.

// =============================================================================
// TYPES
// =============================================================================

export interface QueueInfo {
  queueName: string;
  consumer: string;
  description?: string;
}

// =============================================================================
// SUBSCRIBER QUEUES
// =============================================================================

/**
 * Each consumer gets its own dedicated queue.
 * Queue naming convention: {producer}-events.{consumer}
 */
export const subscriberQueues: Record<string, QueueInfo> = {
  // inventory-service publishes to:
  'inventory-events.catalog': {
    queueName: 'inventory-events.catalog',
    consumer: 'catalog-service',
    description: 'Stock updates for catalog read model',
  },
  'inventory-events.reorder': {
    queueName: 'inventory-events.reorder',
    consumer: 'reorder-service',
    description: 'Stock updates for reorder triggers',
  },

  // order-service publishes to:
  'orders-events.notification': {
    queueName: 'orders-events.notification',
    consumer: 'notification-service',
    description: 'Order events for notifications',
  },
  'orders-events.analytics': {
    queueName: 'orders-events.analytics',
    consumer: 'analytics-service',
    description: 'Order events for analytics',
  },
  'orders-events.inventory': {
    queueName: 'orders-events.inventory',
    consumer: 'inventory-service',
    description: 'GRN received events for stock updates',
  },

  // supplier-service publishes to:
  'supplier-events.catalog': {
    queueName: 'supplier-events.catalog',
    consumer: 'catalog-service',
    description: 'Supplier catalog updates',
  },

  // reorder-service publishes to:
  'reorder-events.notification': {
    queueName: 'reorder-events.notification',
    consumer: 'notification-service',
    description: 'Reorder alerts for notifications',
  },
  'reorder-events.orders': {
    queueName: 'reorder-events.orders',
    consumer: 'order-service',
    description: 'Approved reorders to create POs',
  },
};

// =============================================================================
// EVENT → SUBSCRIBERS MAPPING
// =============================================================================

/**
 * Maps each event type to the queue names it should be fanned out to.
 * This is the core of the fanout pattern - one event can go to multiple queues.
 */
export const eventSubscribers: Record<string, string[]> = {
  // Inventory events → catalog (read model) AND reorder (triggers)
  'inventory.stock.changed.v1': [
    'inventory-events.catalog',
    'inventory-events.reorder',
  ],

  // Order events
  'orders.po.created.v1': [
    'orders-events.notification',
  ],
  'orders.po.status_changed.v1': [
    'orders-events.notification',
  ],
  'orders.po.received.v1': [
    'orders-events.notification',
    'orders-events.analytics',
    'orders-events.inventory', // Update stock from GRN
  ],

  // Supplier events
  'supplier.linked.v1': [
    'supplier-events.catalog',
  ],
  'supplier.catalog_updated.v1': [
    'supplier-events.catalog',
  ],

  // Reorder events
  'reorder.draft.created.v1': [
    'reorder-events.notification',
  ],
  'reorder.approved.v1': [
    'reorder-events.orders', // Create POs from approved reorders
    'reorder-events.notification',
  ],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the list of queue names an event should be fanned out to
 */
export function getSubscriberQueues(eventType: string): string[] {
  return eventSubscribers[eventType] || [];
}

/**
 * Get queue info by queue name
 */
export function getQueueInfo(queueName: string): QueueInfo | undefined {
  return subscriberQueues[queueName];
}

/**
 * Get all queue names for a specific consumer service
 */
export function getQueuesForConsumer(consumer: string): string[] {
  return Object.entries(subscriberQueues)
    .filter(([_, info]) => info.consumer === consumer)
    .map(([name]) => name);
}

/**
 * Check if an event type has any subscribers
 */
export function hasSubscribers(eventType: string): boolean {
  const queues = eventSubscribers[eventType];
  return queues !== undefined && queues.length > 0;
}

/**
 * Get all unique event types that have subscribers
 */
export function getAllEventTypes(): string[] {
  return Object.keys(eventSubscribers);
}

/**
 * Get all unique queue names
 */
export function getAllQueueNames(): string[] {
  return Object.keys(subscriberQueues);
}
