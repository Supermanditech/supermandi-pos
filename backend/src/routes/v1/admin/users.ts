// ADM-SCR-002: Admin Users Management Route
// GO-LIVE-128: Enhanced with RBAC permissions
import { Router } from "express";
import { requireAdminToken, requirePermission, generateAdminApiKey, hashAdminApiKey, AdminRole } from "../../../middleware/adminToken";
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
// GO-LIVE-128: Requires 'users:read' permission
adminUsersRouter.get("/users", requirePermission("users", "read"), async (_req, res) => {
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
// GO-LIVE-128: Requires 'users:read' permission
adminUsersRouter.get("/users/:userId", requirePermission("users", "read"), async (req, res) => {
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
// GO-LIVE-128: Requires 'users:update' permission
adminUsersRouter.patch("/users/:userId", requirePermission("users", "update"), async (req, res) => {
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
// GL-CRIT-0053: Require verification for admin (platform) user creation
// GO-LIVE-128: Requires 'users:create' permission
adminUsersRouter.post("/users", requirePermission("users", "create"), async (req, res) => {
  const { name, email, phone, actor_type, actor_id, admin_verification } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    actor_type?: string;
    actor_id?: string;
    admin_verification?: {
      reason?: string;
      confirmed?: boolean;
    };
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

  // GL-CRIT-0053: Require verification for platform (admin) user creation
  if (finalActorType === 'platform') {
    if (!admin_verification?.confirmed) {
      return res.status(400).json({
        error: "admin_verification_required",
        message: "Creating platform admin users requires explicit verification."
      });
    }
    if (!admin_verification?.reason || admin_verification.reason.trim().length < 10) {
      return res.status(400).json({
        error: "admin_verification_reason_required",
        message: "A reason of at least 10 characters is required for creating platform admin users."
      });
    }
    console.log(`[admin/users] GL-CRIT-0053: Platform user creation verified. Reason: ${admin_verification.reason}`);
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

// ITER3-P0-008: DELETE /api/v1/admin/users/:userId - Soft delete a user
// Uses 'suspended' status as soft delete since constraint doesn't allow 'deleted'
// GO-LIVE-128: Requires 'users:delete' permission
adminUsersRouter.delete("/users/:userId", requirePermission("users", "delete"), async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId_required" });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Soft delete: Set status to 'suspended' and clear PII
    const result = await pool.query(
      `UPDATE auth.users
       SET status = 'suspended',
           email = CONCAT('deleted_', id::TEXT, '@removed'),
           phone = NULL,
           updated_at = NOW()
       WHERE id = $1::uuid AND status NOT IN ('suspended')
       RETURNING id::TEXT as id, name`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "user_not_found_or_already_deleted" });
    }

    const user = result.rows[0];
    console.log(`[admin/users] User soft-deleted: ${user.name} (${user.id})`);

    return res.json({ success: true, message: `User ${user.name} has been deleted` });
  } catch (error: any) {
    console.error("[admin/users] Failed to delete user:", error);
    return res.status(500).json({ error: "delete_user_failed" });
  }
});

// =============================================================================
// GO-LIVE-128: Admin Account Management (RBAC)
// =============================================================================

interface AdminRecord {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

// GET /api/v1/admin/admins - List all admin accounts
// GO-LIVE-128: Requires 'admins:read' permission (super_admin only)
adminUsersRouter.get("/admins", requirePermission("admins", "read"), async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await pool.query<AdminRecord>(`
      SELECT
        id::TEXT as id,
        email,
        name,
        role,
        status,
        last_login_at,
        created_at
      FROM admin.admins
      ORDER BY created_at DESC
    `);

    return res.json({ admins: result.rows });
  } catch (error: any) {
    if (error.code === '42P01') {
      // Table doesn't exist yet - return empty array
      return res.json({ admins: [] });
    }
    console.error("[admin/admins] Failed to fetch admins:", error);
    return res.status(500).json({ error: "fetch_admins_failed" });
  }
});

// POST /api/v1/admin/admins - Create a new admin account
// GO-LIVE-128: Requires 'admins:create' permission (super_admin only)
// Returns the API key ONLY ONCE - it cannot be retrieved later
adminUsersRouter.post("/admins", requirePermission("admins", "create"), async (req, res) => {
  const { email, name, role } = req.body as {
    email?: string;
    name?: string;
    role?: AdminRole;
  };

  // Validation
  if (!email || !email.trim()) {
    return res.status(400).json({ error: "email_required" });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name_required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "invalid_email_format" });
  }

  const validRoles: AdminRole[] = ['super_admin', 'admin', 'moderator', 'viewer'];
  const finalRole = validRoles.includes(role as AdminRole) ? role : 'viewer';

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Generate API key
    const apiKey = generateAdminApiKey();
    const apiKeyHash = hashAdminApiKey(apiKey);

    // Check for duplicate email
    const existingCheck = await pool.query(
      'SELECT id FROM admin.admins WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (existingCheck.rowCount && existingCheck.rowCount > 0) {
      return res.status(409).json({ error: "admin_email_exists" });
    }

    // Get creator's admin ID
    const creatorId = req.adminId !== 'master-token' ? req.adminId : null;

    const result = await pool.query<AdminRecord & { api_key?: string }>(`
      INSERT INTO admin.admins (email, name, role, api_key_hash, created_by, status)
      VALUES ($1, $2, $3, $4, $5::uuid, 'active')
      RETURNING
        id::TEXT as id,
        email,
        name,
        role,
        status,
        created_at
    `, [
      email.trim().toLowerCase(),
      name.trim(),
      finalRole,
      apiKeyHash,
      creatorId
    ]);

    const admin = result.rows[0];
    console.log(`[admin/admins] GO-LIVE-128: Created admin account: ${admin.email} with role ${admin.role}`);

    // Return the API key ONLY on creation - it cannot be retrieved later
    return res.status(201).json({
      admin: {
        ...admin,
        apiKey // Only returned on creation!
      },
      warning: "IMPORTANT: Save this API key now. It cannot be retrieved later."
    });
  } catch (error: any) {
    if (error.code === '42P01') {
      return res.status(503).json({ error: "admin_tables_not_initialized", message: "Run migrations to create admin.admins table" });
    }
    if (error.code === '23505') {
      return res.status(409).json({ error: "admin_email_exists" });
    }
    console.error("[admin/admins] Failed to create admin:", error);
    return res.status(500).json({ error: "create_admin_failed" });
  }
});

// PATCH /api/v1/admin/admins/:adminId - Update admin account (role, status)
// GO-LIVE-128: Requires 'admins:update' permission (super_admin only)
adminUsersRouter.patch("/admins/:adminId", requirePermission("admins", "update"), async (req, res) => {
  const { adminId } = req.params;
  if (!adminId) return res.status(400).json({ error: "adminId_required" });

  const { role, status } = req.body as { role?: AdminRole; status?: string };

  const validRoles: AdminRole[] = ['super_admin', 'admin', 'moderator', 'viewer'];
  const validStatuses = ['active', 'inactive', 'suspended'];

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (role !== undefined) {
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "invalid_role" });
      }
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }

    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "invalid_status" });
      }
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "no_updates_provided" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(adminId);

    const result = await pool.query<AdminRecord>(`
      UPDATE admin.admins
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}::uuid
      RETURNING
        id::TEXT as id,
        email,
        name,
        role,
        status,
        last_login_at,
        created_at
    `, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "admin_not_found" });
    }

    console.log(`[admin/admins] GO-LIVE-128: Updated admin ${adminId}: role=${role}, status=${status}`);
    return res.json({ admin: result.rows[0] });
  } catch (error: any) {
    console.error("[admin/admins] Failed to update admin:", error);
    return res.status(500).json({ error: "update_admin_failed" });
  }
});

// POST /api/v1/admin/admins/:adminId/regenerate-key - Regenerate admin API key
// GO-LIVE-128: Requires 'admins:update' permission (super_admin only)
// Returns the new API key ONLY ONCE - it cannot be retrieved later
adminUsersRouter.post("/admins/:adminId/regenerate-key", requirePermission("admins", "update"), async (req, res) => {
  const { adminId } = req.params;
  if (!adminId) return res.status(400).json({ error: "adminId_required" });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Generate new API key
    const apiKey = generateAdminApiKey();
    const apiKeyHash = hashAdminApiKey(apiKey);

    const result = await pool.query<AdminRecord>(`
      UPDATE admin.admins
      SET api_key_hash = $1, updated_at = NOW()
      WHERE id = $2::uuid
      RETURNING
        id::TEXT as id,
        email,
        name,
        role
    `, [apiKeyHash, adminId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "admin_not_found" });
    }

    const admin = result.rows[0];
    console.log(`[admin/admins] GO-LIVE-128: Regenerated API key for admin ${admin.email}`);

    return res.json({
      admin: {
        ...admin,
        apiKey // Only returned on regeneration!
      },
      warning: "IMPORTANT: Save this API key now. It cannot be retrieved later. Old key is now invalid."
    });
  } catch (error: any) {
    console.error("[admin/admins] Failed to regenerate key:", error);
    return res.status(500).json({ error: "regenerate_key_failed" });
  }
});

// DELETE /api/v1/admin/admins/:adminId - Deactivate admin account
// GO-LIVE-128: Requires 'admins:delete' permission (super_admin only)
adminUsersRouter.delete("/admins/:adminId", requirePermission("admins", "delete"), async (req, res) => {
  const { adminId } = req.params;
  if (!adminId) return res.status(400).json({ error: "adminId_required" });

  // Prevent self-deletion
  if (req.adminId === adminId) {
    return res.status(400).json({ error: "cannot_delete_self" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Soft delete: set status to 'suspended' and clear API key
    const result = await pool.query(`
      UPDATE admin.admins
      SET status = 'suspended', api_key_hash = NULL, updated_at = NOW()
      WHERE id = $1::uuid AND status != 'suspended'
      RETURNING id::TEXT as id, email, name
    `, [adminId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "admin_not_found_or_already_deleted" });
    }

    const admin = result.rows[0];
    console.log(`[admin/admins] GO-LIVE-128: Deactivated admin account: ${admin.email}`);

    return res.json({ success: true, message: `Admin ${admin.email} has been deactivated` });
  } catch (error: any) {
    console.error("[admin/admins] Failed to delete admin:", error);
    return res.status(500).json({ error: "delete_admin_failed" });
  }
});
