// GCP-STG-0665: Supplier SLA monitoring — track promised vs actual delivery
import { Router } from 'express';
import { getPool } from '../../../db/client';
import { requireAdminToken } from '../../../middleware/adminToken';

const router = Router();

// GET /admin/suppliers/:supplierId/sla — delivery SLA performance
router.get('/suppliers/:supplierId/sla', requireAdminToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Service unavailable' });

  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        AVG(EXTRACT(EPOCH FROM (actual_delivery_at - created_at)) / 86400)::numeric(5,1) as avg_delivery_days,
        COUNT(*) FILTER (WHERE actual_delivery_at <= created_at + (promised_delivery_days || ' days')::interval) as on_time,
        COUNT(*) FILTER (WHERE actual_delivery_at > created_at + (promised_delivery_days || ' days')::interval) as late
      FROM orders.purchase_orders
      WHERE supplier_id = $1 AND status = 'DELIVERED' AND actual_delivery_at IS NOT NULL
    `, [req.params.supplierId]);

    const row = result.rows[0];
    const totalOrders = parseInt(row.total_orders) || 0;
    const onTime = parseInt(row.on_time) || 0;
    const late = parseInt(row.late) || 0;
    const onTimeRate = totalOrders > 0 ? Math.round((onTime / totalOrders) * 100) : 0;

    res.json({
      supplierId: req.params.supplierId,
      totalOrders,
      avgDeliveryDays: parseFloat(row.avg_delivery_days) || 0,
      onTimeDeliveries: onTime,
      lateDeliveries: late,
      onTimeRate,
      slaStatus: onTimeRate >= 90 ? 'GOOD' : onTimeRate >= 70 ? 'WARNING' : 'POOR',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch SLA data' });
  }
});

export const supplierSlaRouter = router;
