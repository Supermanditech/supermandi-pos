// StatusTimeline - V3.0.9 compliant
// Visual timeline component for order status events

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";
import type { OrderEvent, OrderStatus } from "../../services/api/orderApi";
import { getStatusLabel, getStatusColor } from "../../services/api/orderApi";

// =============================================================================
// TYPES
// =============================================================================

export interface StatusTimelineProps {
  events: OrderEvent[];
  currentStatus: OrderStatus;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function StatusTimeline({ events, currentStatus }: StatusTimelineProps) {
  // Sort events by date (newest first for display)
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (sortedEvents.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="timeline-outline"
          size={24}
          color={theme.colors.textTertiary}
        />
        <Text style={styles.emptyText}>No events recorded</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {sortedEvents.map((event, index) => {
        const isFirst = index === 0;
        const isLast = index === sortedEvents.length - 1;
        const eventInfo = getEventInfo(event);

        return (
          <View key={event.id} style={styles.eventRow}>
            {/* Timeline Connector */}
            <View style={styles.timelineColumn}>
              {/* Top connector line */}
              {!isFirst && (
                <View style={[styles.connectorLine, styles.connectorTop]} />
              )}

              {/* Event dot */}
              <View
                style={[
                  styles.eventDot,
                  isFirst && styles.eventDotActive,
                  { borderColor: eventInfo.color },
                ]}
              >
                {isFirst && (
                  <View
                    style={[
                      styles.eventDotInner,
                      { backgroundColor: eventInfo.color },
                    ]}
                  />
                )}
              </View>

              {/* Bottom connector line */}
              {!isLast && (
                <View style={[styles.connectorLine, styles.connectorBottom]} />
              )}
            </View>

            {/* Event Content */}
            <View style={styles.eventContent}>
              <View style={styles.eventHeader}>
                <MaterialCommunityIcons
                  name={eventInfo.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={16}
                  color={eventInfo.color}
                />
                <Text style={[styles.eventTitle, isFirst && styles.eventTitleActive]}>
                  {eventInfo.title}
                </Text>
              </View>

              {eventInfo.description && (
                <Text style={styles.eventDescription}>{eventInfo.description}</Text>
              )}

              <Text style={styles.eventTime}>{formatEventTime(event.createdAt)}</Text>

              {/* Actor info */}
              {event.actorType && event.actorType !== "system" && (
                <View style={styles.actorRow}>
                  <MaterialCommunityIcons
                    name={event.actorType === "user" ? "account" : "store"}
                    size={12}
                    color={theme.colors.textTertiary}
                  />
                  <Text style={styles.actorText}>
                    {event.actorType === "user" ? "User" : "Supplier"}
                    {event.actorId && ` (${event.actorId.slice(0, 8)}...)`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

interface EventInfo {
  title: string;
  description: string | null;
  icon: string;
  color: string;
}

function getEventInfo(event: OrderEvent): EventInfo {
  const { eventType, fromStatus, toStatus, metadata } = event;

  // Status transition events
  if (eventType === "status_changed" && toStatus) {
    const statusColor = getStatusColor(toStatus);

    switch (toStatus) {
      case "submitted":
        return {
          title: "Order Submitted",
          description: "Awaiting supplier confirmation",
          icon: "send",
          color: statusColor,
        };
      case "confirmed":
        return {
          title: "Order Confirmed",
          description: "Supplier has confirmed the order",
          icon: "check-circle",
          color: statusColor,
        };
      case "shipped":
        return {
          title: "Order Shipped",
          description: metadata?.trackingNumber
            ? `Tracking: ${metadata.trackingNumber}`
            : "Order is on its way",
          icon: "truck-delivery",
          color: statusColor,
        };
      case "partial_received":
        return {
          title: "Partially Received",
          description: "Some items have been received",
          icon: "package-variant",
          color: statusColor,
        };
      case "delivered":
        return {
          title: "Order Complete",
          description: "All items received successfully",
          icon: "check-all",
          color: statusColor,
        };
      case "cancelled":
        return {
          title: "Order Cancelled",
          description: metadata?.reason ? String(metadata.reason) : null,
          icon: "close-circle",
          color: statusColor,
        };
      default:
        return {
          title: getStatusLabel(toStatus),
          description: null,
          icon: "circle-outline",
          color: statusColor,
        };
    }
  }

  // Other event types
  switch (eventType) {
    case "created":
      return {
        title: "Order Created",
        description: "Draft order created",
        icon: "plus-circle",
        color: theme.colors.textSecondary,
      };
    case "items_received":
      return {
        title: "Items Received",
        description: metadata?.itemCount
          ? `${metadata.itemCount} item(s) received`
          : null,
        icon: "package-down",
        color: theme.colors.success,
      };
    case "note_added":
      return {
        title: "Note Added",
        description: metadata?.note ? String(metadata.note) : null,
        icon: "note-text",
        color: theme.colors.info,
      };
    default:
      return {
        title: eventType.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
        description: null,
        icon: "circle-outline",
        color: theme.colors.textSecondary,
      };
  }
}

function formatEventTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "Just now";
  }
  if (diffMins < 60) {
    return `${diffMins} min ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }
  if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    paddingVertical: theme.spacing.sm,
  },
  emptyContainer: {
    alignItems: "center",
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  eventRow: {
    flexDirection: "row",
    minHeight: 60,
  },
  timelineColumn: {
    width: 32,
    alignItems: "center",
    position: "relative",
  },
  connectorLine: {
    position: "absolute",
    width: 2,
    backgroundColor: theme.colors.border,
  },
  connectorTop: {
    top: 0,
    bottom: "50%",
  },
  connectorBottom: {
    top: "50%",
    bottom: 0,
  },
  eventDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  eventDotActive: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  eventDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventContent: {
    flex: 1,
    paddingLeft: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: 2,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  eventTitleActive: {
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  eventDescription: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  actorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  actorText: {
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
});

export default StatusTimeline;
