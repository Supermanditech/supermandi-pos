import AsyncStorage from '@react-native-async-storage/async-storage';

export type EventType =
  | 'APP_START'
  | 'APP_BACKGROUND'
  | 'APP_FOREGROUND'
  | 'CART_ADD_ITEM'
  | 'CART_REMOVE_ITEM'
  | 'CART_UPDATE_QUANTITY'
  | 'CART_CLEAR'
  | 'CART_APPLY_DISCOUNT'
  | 'CHECKOUT_START'
  | 'CHECKOUT_COMPLETE'
  | 'CHECKOUT_CANCEL'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PRINT_RECEIPT'
  | 'PRINT_FAILED'
  | 'PRODUCTS_LOADED'
  | 'PRODUCTS_LOAD_FAILED'
  | 'ERROR'
  | 'USER_ACTION';

export interface EventLog {
  id: string;
  type: EventType;
  timestamp: number;
  payload: Record<string, any>;
}

const STORAGE_KEY = '@pos_event_logs';
const MAX_LOGS = 1000; // Keep last 1000 events

class EventLogger {
  private logs: EventLog[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize EventLogger:', error);
      this.logs = [];
      this.initialized = true;
    }
  }

  async log(type: EventType, payload: Record<string, any> = {}): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const event: EventLog = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      payload,
    };

    this.logs.push(event);

    // Keep only the last MAX_LOGS events
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS);
    }

    // Save to AsyncStorage (fire and forget for performance)
    this.persistLogs().catch(error => {
      console.error('Failed to persist event logs:', error);
    });
  }

  private async persistLogs(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch (error) {
      console.error('Failed to persist logs:', error);
    }
  }

  async getLogs(filter?: {
    type?: EventType;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<EventLog[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    let filtered = [...this.logs];

    if (filter?.type) {
      filtered = filtered.filter(log => log.type === filter.type);
    }

    if (filter?.startTime) {
      filtered = filtered.filter(log => log.timestamp >= filter.startTime!);
    }

    if (filter?.endTime) {
      filtered = filtered.filter(log => log.timestamp <= filter.endTime!);
    }

    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  async clearLogs(): Promise<void> {
    this.logs = [];
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  }

  async exportLogs(): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    return JSON.stringify(this.logs, null, 2);
  }
}

export const eventLogger = new EventLogger();
