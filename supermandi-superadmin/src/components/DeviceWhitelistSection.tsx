// SA-P2-009: Device Hardware Whitelist management section
import { useState, useEffect, useCallback } from "react";
import {
  fetchWhitelistRules,
  createWhitelistRule,
  deleteWhitelistRule,
  toggleWhitelistRule,
  type WhitelistRule,
} from "../api/devices";
import { formatDateTime } from "../lib/formatters";
import { ConfirmDialog, type ConfirmDialogConfig } from "./ConfirmDialog";

export function DeviceWhitelistSection() {
  const [rules, setRules] = useState<WhitelistRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);

  // Form state
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [minAndroidVersion, setMinAndroidVersion] = useState("");
  const [notes, setNotes] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchWhitelistRules();
      setRules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load whitelist rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    if (!manufacturer.trim() && !model.trim() && !minAndroidVersion.trim()) {
      setError("At least one of Manufacturer, Model, or Min Android Version is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const rule = await createWhitelistRule({
        manufacturer: manufacturer.trim() || undefined,
        model: model.trim() || undefined,
        minAndroidVersion: minAndroidVersion.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setRules((prev) => [rule, ...prev]);
      setManufacturer("");
      setModel("");
      setMinAndroidVersion("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (ruleId: string) => {
    setConfirmDialog({
      title: "Delete Whitelist Rule",
      message: "Are you sure you want to delete this whitelist rule? Devices matching only this rule may be blocked from enrolling.",
      confirmLabel: "Delete",
      variant: "danger",
      onConfirm: async () => {
        setConfirmDialog(null);
        setError("");
        try {
          await deleteWhitelistRule(ruleId);
          setRules((prev) => prev.filter((r) => r.id !== ruleId));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to delete rule");
        }
      },
    });
  };

  const handleToggle = async (ruleId: string, active: boolean) => {
    setError("");
    try {
      const updated = await toggleWhitelistRule(ruleId, active);
      setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle rule");
    }
  };

  const activeCount = rules.filter((r) => r.active).length;

  return (
    <section className="card sa-mt-16">
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Hardware Whitelist</div>
          <div className="muted">
            {rules.length === 0
              ? "No whitelist rules — all devices can enroll"
              : `${activeCount} active rule${activeCount !== 1 ? "s" : ""} — devices must match at least one to enroll`}
          </div>
        </div>
      </div>

      {error && <div className="banner sa-mb-12" role="alert">{error}</div>}

      {/* Add rule form */}
      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="control">
            <label>Manufacturer</label>
            <input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="e.g. Samsung"
              maxLength={100}
            />
          </div>
          <div className="control">
            <label>Model</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. Galaxy* (wildcard)"
              maxLength={100}
            />
          </div>
          <div className="control">
            <label>Min Android</label>
            <input
              value={minAndroidVersion}
              onChange={(e) => setMinAndroidVersion(e.target.value)}
              placeholder="e.g. 12"
              maxLength={10}
            />
          </div>
          <div className="control">
            <label>Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note"
              maxLength={255}
            />
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={handleAdd} disabled={saving}>
              {saving ? "Adding..." : "Add Rule"}
            </button>
          </div>
        </div>
      </div>

      {/* Rules list */}
      {loading ? (
        <div className="empty">Loading whitelist rules...</div>
      ) : rules.length === 0 ? (
        <div className="empty">
          No whitelist rules defined. All device hardware is permitted to enroll.
        </div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Manufacturer</th>
                <th>Model</th>
                <th>Min Android</th>
                <th>Notes</th>
                <th>Active</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} style={!rule.active ? { opacity: 0.5 } : undefined}>
                  <td className="mono">{rule.manufacturer || "*"}</td>
                  <td className="mono">{rule.model || "*"}</td>
                  <td className="mono">{rule.min_android_version || "*"}</td>
                  <td>{rule.notes || "-"}</td>
                  <td>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={rule.active}
                        onChange={(e) => handleToggle(rule.id, e.target.checked)}
                      />
                    </label>
                  </td>
                  <td className="mono">{rule.created_at ? formatDateTime(rule.created_at) : "-"}</td>
                  <td>
                    <button
                      className="btnDanger btnSm"
                      onClick={() => handleDelete(rule.id)}
                      title="Delete this whitelist rule"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
