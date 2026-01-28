// ADM-SCR-002: Admin Users Management Route
import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAdminToken);

export interface AdminUserRecord {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  actor_type: string;
  actor_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// GET /api/v1/admin/users - List all users
adminUsersRouter.get("/users", async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await pool.query<AdminUserRecord>(`
      SELECT
        id::TEXT as id,
        email,
        phone,
        name,
        actor_type,
        actor_id::TEXT as actor_id,
        status,
        created_at,
        updated_at
      FROM auth.users
      ORDER BY created_at DESC
      LIMIT 500
    `);

    return res.json({ users: result.rows });
  } catch (error: any) {
    console.error("[admin/users] Failed to fetch users:", error);
    return res.status(500).json({ error: "fetch_users_failed" });
  }
});

// GET /api/v1/admin/users/:userId - Get single user
adminUsersRouter.get("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId_required" });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await pool.query<AdminUserRecord>(`
      SELECT
        id::TEXT as id,
        email,
        phone,
        name,
        actor_type,
        actor_id::TEXT as actor_id,
        status,
        created_at,
        updated_at
      FROM auth.users
      WHERE id = $1::uuid
    `, [userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "user_not_found" });
    }

    return res.json({ user: result.rows[0] });
  } catch (error: any) {
    console.error("[admin/users] Failed to fetch user:", error);
    return res.status(500).json({ error: "fetch_user_failed" });
  }
});

// PATCH /api/v1/admin/users/:userId - Update user status
adminUsersRouter.patch("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId_required" });

  const { status } = req.body as { status?: string };
  const validStatuses = ["active", "inactive", "suspended"];

  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).json({ error: "invalid_status" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: "no_updates_provided" });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await pool.query<AdminUserRecord>(`
      UPDATE auth.users
      SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}::uuid
      RETURNING
        id::TEXT as id,
        email,
        phone,
        name,
        actor_type,
        actor_id::TEXT as actor_id,
        status,
        created_at,
        updated_at
    `, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "user_not_found" });
    }

    return res.json({ user: result.rows[0] });
  } catch (error: any) {
    console.error("[admin/users] Failed to update user:", error);
    return res.status(500).json({ error: "update_user_failed" });
  }
});

// SA-1.3-004: POST /api/v1/admin/users - Create a new user
adminUsersRouter.post("/users", async (req, res) => {
  const { name, email, phone, actor_type, actor_id } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    actor_type?: string;
    actor_id?: string;
  };

  // Validation: name required
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: "name_required" });
  }

  // Validation: at least one of email or phone required
  if ((!email || email.trim().length === 0) && (!phone || phone.trim().length === 0)) {
    return res.status(400).json({ error: "email_or_phone_required" });
  }

  // Validate email format if provided
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "invalid_email_format" });
  }

  // Validate phone format if provided (allow 10-15 digits with optional +)
  if (phone && !/^\+?[0-9]{10,15}$/.test(phone.replace(/[\s-]/g, ""))) {
    return res.status(400).json({ error: "invalid_phone_format" });
  }

  // Validate actor constraint:
  // - platform: actor_id must be null
  // - store/supplier: actor_id must be provided
  const finalActorType = actor_type?.trim() || (actor_id ? 'store' : 'platform');
  const finalActorId = actor_id?.trim() || null;

  if (finalActorType === 'platform' && finalActorId !== null) {
    return res.status(400).json({ error: "platform_actor_cannot_have_actor_id" });
  }
  if ((finalActorType === 'store' || finalActorType === 'supplier') && !finalActorId) {
    return res.status(400).json({ error: "actor_id_required_for_store_or_supplier" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Check for duplicate email/phone
    const duplicateCheck = await pool.query(
      `SELECT id FROM auth.users WHERE
        ($1::TEXT IS NOT NULL AND email = $1::TEXT) OR
        ($2::TEXT IS NOT NULL AND phone = $2::TEXT)
      LIMIT 1`,
      [email?.trim() || null, phone?.trim() || null]
    );

    if (duplicateCheck.rowCount && duplicateCheck.rowCount > 0) {
      return res.status(409).json({ error: "user_already_exists" });
    }

    const result = await pool.query<AdminUserRecord>(`
      INSERT INTO auth.users (name, email, phone, actor_type, actor_id, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5::uuid, 'active', NOW(), NOW())
      RETURNING
        id::TEXT as id,
        email,
        phone,
        name,
        actor_type,
        actor_id::TEXT as actor_id,
        status,
        created_at,
        updated_at
    `, [
      name.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      finalActorType,
      finalActorId
    ]);

    console.log("[admin/users] Created user:", result.rows[0]?.id);
    return res.status(201).json({ user: result.rows[0] });
  } catch (error: any) {
    console.error("[admin/users] Failed to create user:", error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({ error: "user_already_exists" });
    }

    return res.status(500).json({ error: "create_user_failed" });
  }
});
