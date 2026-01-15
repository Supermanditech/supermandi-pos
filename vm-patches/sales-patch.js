// PATCH: Add UUID validation and barcode resolution for offline sales
// Insert this function after line 17 (after buildBillRef function)

function isValidUUID(value) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
}

// Insert this function after variantExists function (around line 191)

async function resolveVariantByBarcode(client, storeId, barcode, fallbackName, currency) {
    const trimmed = barcode.trim();
    if (!trimmed) return null;

    // First try to find existing variant by barcode
    const barcodeRes = await client.query(
        `SELECT v.id FROM barcodes b JOIN variants v ON v.id = b.variant_id WHERE b.barcode = $1 LIMIT 1`,
        [trimmed]
    );

    if (barcodeRes.rows[0]?.id) {
        const variantId = String(barcodeRes.rows[0].id);
        await ensureRetailerVariantLink(client, storeId, variantId);
        return variantId;
    }

    // Try to find global product by barcode identifier
    const globalRes = await client.query(
        `SELECT gpi.global_product_id FROM global_product_identifiers gpi WHERE gpi.normalized_value = $1 OR gpi.raw_value = $1 LIMIT 1`,
        [trimmed]
    );

    if (globalRes.rows[0]?.global_product_id) {
        const globalProductId = String(globalRes.rows[0].global_product_id);
        return resolveVariantForGlobalProduct({
            client,
            storeId,
            globalProductId,
            fallbackName,
            currency
        });
    }

    return null;
}

// Replace the variant resolution loop (around line 410-450) with:
/*
    for (const item of cleanedItems) {
        let variantId = null;
        if (item.explicitVariantId) {
            variantId = item.explicitVariantId;
        }
        else if (item.globalProductId && isValidUUID(item.globalProductId)) {
            variantId = await resolveVariantForGlobalProduct({
                client,
                storeId,
                globalProductId: item.globalProductId,
                fallbackName: item.name ?? null,
                currency: saleCurrency
            });
        }
        else if (item.productId && isValidUUID(item.productId)) {
            if (await variantExists(client, item.productId)) {
                variantId = item.productId;
            }
            else {
                variantId = await resolveVariantForGlobalProduct({
                    client,
                    storeId,
                    globalProductId: item.productId,
                    fallbackName: item.name ?? null,
                    currency: saleCurrency
                });
            }
        }
        else if (item.barcode) {
            variantId = await resolveVariantByBarcode(
                client,
                storeId,
                item.barcode,
                item.name ?? null,
                saleCurrency
            );
        }
        else if (item.productId) {
            // Last resort: productId might be a barcode (offline items)
            variantId = await resolveVariantByBarcode(
                client,
                storeId,
                item.productId,
                item.name ?? null,
                saleCurrency
            );
        }
        if (!variantId) {
            throw new Error("product_not_found");
        }
        resolvedItems.push({
            variantId,
            quantity: item.quantity,
            priceMinor: item.priceMinor,
            name: item.name,
            barcode: item.barcode,
            globalProductId: item.globalProductId ?? undefined
        });
    }
*/
