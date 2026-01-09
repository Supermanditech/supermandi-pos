export type StockCapAddResult = {
  requestedQty: number;
  nextQty: number;
  addedQty: number;
  capped: boolean;
  outOfStock: boolean;
  unknownStock: boolean;
};

export type StockCapUpdateResult = {
  requestedQty: number;
  nextQty: number;
  capped: boolean;
  outOfStock: boolean;
  unknownStock: boolean;
};

const normalizeQuantity = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
};

const normalizeStock = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
};

export const capAddQuantity = (
  currentQty: unknown,
  addQty: unknown,
  availableStock: unknown
): StockCapAddResult => {
  const safeCurrent = normalizeQuantity(currentQty);
  const safeAdd = normalizeQuantity(addQty);
  const requestedQty = safeCurrent + safeAdd;
  const stock = normalizeStock(availableStock);

  if (stock === null) {
    return {
      requestedQty,
      nextQty: safeCurrent,
      addedQty: 0,
      capped: false,
      outOfStock: false,
      unknownStock: safeAdd > 0
    };
  }

  if (stock <= 0) {
    return {
      requestedQty,
      nextQty: safeCurrent,
      addedQty: 0,
      capped: safeAdd > 0,
      outOfStock: safeAdd > 0,
      unknownStock: false
    };
  }

  const nextQty = Math.min(requestedQty, stock);
  const addedQty = Math.max(0, nextQty - safeCurrent);
  const capped = nextQty < requestedQty;

  return {
    requestedQty,
    nextQty,
    addedQty,
    capped,
    outOfStock: false,
    unknownStock: false
  };
};

export const capRequestedQuantity = (
  currentQty: unknown,
  requestedQty: unknown,
  availableStock: unknown
): StockCapUpdateResult => {
  const safeCurrent = normalizeQuantity(currentQty);
  const safeRequested = normalizeQuantity(requestedQty);
  const stock = normalizeStock(availableStock);

  if (stock === null) {
    return {
      requestedQty: safeRequested,
      nextQty: safeRequested > safeCurrent ? safeCurrent : safeRequested,
      capped: safeRequested > safeCurrent,
      outOfStock: false,
      unknownStock: safeRequested > safeCurrent
    };
  }

  if (stock <= 0) {
    return {
      requestedQty: safeRequested,
      nextQty: 0,
      capped: safeRequested > 0,
      outOfStock: safeRequested > 0,
      unknownStock: false
    };
  }

  const nextQty = Math.min(safeRequested, stock);
  const capped = nextQty < safeRequested;

  return {
    requestedQty: safeRequested,
    nextQty,
    capped,
    outOfStock: false,
    unknownStock: false
  };
};
