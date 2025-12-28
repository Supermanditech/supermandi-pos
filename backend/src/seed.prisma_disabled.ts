import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // Clear existing products
  const deletedCount = await prisma.product.deleteMany({});
  console.log(`✅ Cleared ${deletedCount.count} existing products`);

  // Insert test products with exact barcodes used by frontend
  const testProducts = [
    {
      name: "Test Barcode Product",
      barcode: "0987654321",
      price: 1500, // 15.00 AED in fils (minor units)
      currency: "AED",
      stock: 100,
      isActive: true,
    },
    {
      name: "Test QR Product C",
      barcode: "QR_PRODUCT_C",
      price: 2500, // 25.00 AED in fils
      currency: "AED",
      stock: 50,
      isActive: true,
    },
    {
      name: "Test Barcode Product D",
      barcode: "BAR_PRODUCT_D",
      price: 3000, // 30.00 AED in fils
      currency: "AED",
      stock: 75,
      isActive: true,
    },
  ];

  for (const productData of testProducts) {
    const product = await prisma.product.create({
      data: productData,
    });
    console.log(`✅ Created product: ${product.name} (barcode: ${product.barcode})`);
  }

  console.log("\n🎉 Database seeding completed successfully!");
  console.log("\nTest products available:");
  console.log("  1. Barcode: 0987654321 → Test Barcode Product (15.00 AED)");
  console.log("  2. Barcode: QR_PRODUCT_C → Test QR Product C (25.00 AED)");
  console.log("  3. Barcode: BAR_PRODUCT_D → Test Barcode Product D (30.00 AED)");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
