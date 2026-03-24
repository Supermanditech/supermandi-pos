/**
 * GCP-STG-0662: Credit/debit note CRUD — behavioral supertest tests
 *
 * Tests the admin credit-notes routes with a simulated Express app that
 * mirrors the real route structure (auth middleware + creditNotesRouter).
 * The database layer is mocked via jest.mock on the service module.
 */

import express from "express";
import request from "supertest";

// Mock data
const STORE_A = "11111111-1111-1111-1111-111111111111";
const STORE_B = "22222222-2222-2222-2222-222222222222";
const NOTE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const mockNote = {
  id: NOTE_ID,
  type: "CREDIT_NOTE" as const,
  referenceInvoiceId: null,
  storeId: STORE_A,
  supplierId: null,
  items: [{ productId: "p1", productName: "Rice 5kg", qty: 2, amountMinor: 50000, gstMinor: 9000, reason: "damaged" }],
  totalAmountMinor: 50000,
  gstAmountMinor: 9000,
  reason: "damaged goods",
  issueDate: "2026-03-25",
  status: "DRAFT",
  createdAt: "2026-03-25T10:00:00.000Z",
};

// Mock the service functions
const mockGenerateCreditNote = jest.fn();
const mockGetCreditNote = jest.fn();
const mockListCreditNotes = jest.fn();

jest.mock("../src/services/creditNoteService", () => ({
  generateCreditNote: (...args: any[]) => mockGenerateCreditNote(...args),
  getCreditNote: (...args: any[]) => mockGetCreditNote(...args),
  listCreditNotes: (...args: any[]) => mockListCreditNotes(...args),
}));

// Mock adminToken middleware — always pass
jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

import { creditNotesRouter } from "../src/routes/v1/admin/creditNotes";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/admin", creditNotesRouter);
  return app;
}

describe("GCP-STG-0662: Credit/debit note CRUD routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /admin/credit-notes with valid body returns 201 + note", async () => {
    mockGenerateCreditNote.mockResolvedValue(mockNote);

    const app = createApp();
    const res = await request(app)
      .post("/admin/credit-notes")
      .send({
        type: "CREDIT_NOTE",
        storeId: STORE_A,
        items: [{ productId: "p1", productName: "Rice 5kg", qty: 2, amountMinor: 50000, gstMinor: 9000, reason: "damaged" }],
        reason: "damaged goods",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(NOTE_ID);
    expect(res.body.type).toBe("CREDIT_NOTE");
    expect(res.body.totalAmountMinor).toBe(50000);
    expect(mockGenerateCreditNote).toHaveBeenCalledTimes(1);
  });

  test("POST /admin/credit-notes without items returns 400", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/admin/credit-notes")
      .send({ type: "CREDIT_NOTE", storeId: STORE_A });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("items required");
    expect(mockGenerateCreditNote).not.toHaveBeenCalled();
  });

  test("GET /admin/credit-notes?storeId=X returns 200 + list with total", async () => {
    mockListCreditNotes.mockResolvedValue({ notes: [mockNote], total: 1 });

    const app = createApp();
    const res = await request(app)
      .get("/admin/credit-notes")
      .query({ storeId: STORE_A });

    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(mockListCreditNotes).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: STORE_A })
    );
  });

  test("GET /admin/credit-notes without storeId returns 400", async () => {
    const app = createApp();
    const res = await request(app).get("/admin/credit-notes");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("storeId required");
  });

  test("GET /admin/credit-notes/:id?storeId=X returns 200 + single note", async () => {
    mockGetCreditNote.mockResolvedValue(mockNote);

    const app = createApp();
    const res = await request(app)
      .get(`/admin/credit-notes/${NOTE_ID}`)
      .query({ storeId: STORE_A });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(NOTE_ID);
    expect(mockGetCreditNote).toHaveBeenCalledWith(NOTE_ID, STORE_A);
  });

  test("store isolation: different storeId returns 404 (not found)", async () => {
    mockGetCreditNote.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get(`/admin/credit-notes/${NOTE_ID}`)
      .query({ storeId: STORE_B });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
    expect(mockGetCreditNote).toHaveBeenCalledWith(NOTE_ID, STORE_B);
  });
});
