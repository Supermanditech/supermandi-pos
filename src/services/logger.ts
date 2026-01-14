// Logger Service - GO-LIVE-010
// Centralized logging with levels and crash reporting

import Constants from "expo-constants";

// =============================================================================
// LOG LEVELS
// =============================================================================

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// In production, only show WARN and ERROR
const IS_DEV = __DEV__ || process.env.NODE_ENV === "development";
const MIN_LOG_LEVEL: LogLevel = IS_DEV ? "DEBUG" : "WARN";

// =============================================================================
// LOGGER
// =============================================================================

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LOG_LEVEL];
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const timestamp = new Date().toISOString().substring(11, 23);
  return `[${timestamp}] [${level}] [${tag}] ${message}`;
}

export const logger = {
  debug(tag: string, message: string, ...args: any[]): void {
    if (shouldLog("DEBUG")) {
      console.log(formatMessage("DEBUG", tag, message), ...args);
    }
  },

  info(tag: string, message: string, ...args: any[]): void {
    if (shouldLog("INFO")) {
      console.log(formatMessage("INFO", tag, message), ...args);
    }
  },

  warn(tag: string, message: string, ...args: any[]): void {
    if (shouldLog("WARN")) {
      console.warn(formatMessage("WARN", tag, message), ...args);
    }
  },

  error(tag: string, message: string, error?: Error | unknown): void {
    if (shouldLog("ERROR")) {
      const errorDetails = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error ?? "");
      console.error(formatMessage("ERROR", tag, message), errorDetails);

      // Track error for crash reporting
      trackError(tag, message, error);
    }
  },
};

// =============================================================================
// CRASH TRACKING
// =============================================================================

interface CrashReport {
  tag: string;
  message: string;
  error?: string;
  stack?: string;
  timestamp: string;
  appVersion: string;
  deviceInfo: string;
}

const crashReports: CrashReport[] = [];
const MAX_CRASH_REPORTS = 50;

function trackError(tag: string, message: string, error?: Error | unknown): void {
  const report: CrashReport = {
    tag,
    message,
    timestamp: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version ?? "unknown",
    deviceInfo: `${Constants.platform?.toString() ?? "unknown"}`,
  };

  if (error instanceof Error) {
    report.error = `${error.name}: ${error.message}`;
    report.stack = error.stack?.split("\n").slice(0, 5).join("\n");
  } else if (error) {
    report.error = String(error);
  }

  crashReports.push(report);

  // Keep only recent reports
  while (crashReports.length > MAX_CRASH_REPORTS) {
    crashReports.shift();
  }
}

/**
 * Get all tracked crash reports for debugging.
 */
export function getCrashReports(): CrashReport[] {
  return [...crashReports];
}

/**
 * Clear all crash reports.
 */
export function clearCrashReports(): void {
  crashReports.length = 0;
}

// =============================================================================
// GLOBAL ERROR HANDLER
// =============================================================================

// React Native global error handler type
declare const global: typeof globalThis & {
  ErrorUtils?: {
    getGlobalHandler: () => ((error: Error, isFatal: boolean) => void) | undefined;
    setGlobalHandler: (handler: (error: Error, isFatal: boolean) => void) => void;
  };
  onunhandledrejection?: (event: { reason: unknown }) => void;
};

let globalHandlerInstalled = false;

/**
 * Install global error handler for uncaught errors.
 * Should be called once at app startup.
 */
export function installGlobalErrorHandler(): void {
  if (globalHandlerInstalled) return;

  // Handle unhandled promise rejections
  const originalRejectionHandler = global.onunhandledrejection;
  global.onunhandledrejection = (event: { reason: unknown }) => {
    logger.error("Global", "Unhandled promise rejection", event.reason);
    originalRejectionHandler?.(event);
  };

  // Handle uncaught errors (React Native)
  const originalErrorHandler = global.ErrorUtils?.getGlobalHandler();
  global.ErrorUtils?.setGlobalHandler((error: Error, isFatal: boolean) => {
    logger.error("Global", `Uncaught error (fatal=${isFatal})`, error);
    originalErrorHandler?.(error, isFatal);
  });

  globalHandlerInstalled = true;
  logger.info("Global", "Global error handler installed");
}

// =============================================================================
// STARTUP LOG
// =============================================================================

export function logAppStartup(): void {
  const appVersion = Constants.expoConfig?.version ?? "unknown";
  const apiUrl = (Constants.expoConfig as any)?.extra?.API_URL ?? "unknown";

  logger.info("App", `SuperMandi POS v${appVersion} starting`);
  logger.info("App", `API URL: ${apiUrl}`);
  logger.info("App", `Environment: ${IS_DEV ? "development" : "production"}`);
}
