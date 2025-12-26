import { create } from 'zustand';
import { eventLogger } from '../services/eventLogger';

export interface Product {
  id: string;
  name: string;
  price: number;
  barcode: string;
  category?: string;
  stock?: number;
  description?: string;
}

interface ProductsState {
  products: Product[];
  loading: boolean;
  error: string | null;
  loadProducts: () => Promise<void>;
  getProductByBarcode: (barcode: string) => Product | undefined;
  searchProducts: (query: string) => Product[];
}

export const useProductsStore = create<ProductsState>((set, get) => ({
  products: [],
  loading: false,
  error: null,

  loadProducts: async () => {
    set({ loading: true, error: null });

    try {
      // For now, load from a local data source
      // This can be replaced with API call later
      const productsData = await loadProductsFromData();

      set({
        products: productsData,
        loading: false,
        error: null
      });

      await eventLogger.log('PRODUCTS_LOADED', {
        count: productsData.length,
        source: 'local_data'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load products';
      set({
        loading: false,
        error: errorMessage
      });

      await eventLogger.log('PRODUCTS_LOAD_FAILED', {
        error: errorMessage
      });
    }
  },

  getProductByBarcode: (barcode: string) => {
    const { products } = get();
    return products.find(product => product.barcode === barcode);
  },

  searchProducts: (query: string) => {
    const { products } = get();
    if (!query.trim()) return products;

    const lowercaseQuery = query.toLowerCase();
    return products.filter(product =>
      product.name.toLowerCase().includes(lowercaseQuery) ||
      product.barcode.toLowerCase().includes(lowercaseQuery) ||
      product.category?.toLowerCase().includes(lowercaseQuery)
    );
  }
}));

// Local products data - can be moved to a separate file or API
const loadProductsFromData = async (): Promise<Product[]> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));

  return [
    {
      id: '1',
      name: 'Sample Product A',
      price: 99.99,
      barcode: '1234567890',
      category: 'General',
      stock: 50,
      description: 'High quality sample product'
    },
    {
      id: '2',
      name: 'Sample Product B',
      price: 149.50,
      barcode: '0987654321',
      category: 'Electronics',
      stock: 25,
      description: 'Premium electronic item'
    },
    {
      id: '3',
      name: 'QR Product C',
      price: 79.99,
      barcode: 'QR_PRODUCT_C',
      category: 'Accessories',
      stock: 100,
      description: 'Scannable QR product'
    },
    {
      id: '4',
      name: 'Barcode Product D',
      price: 199.99,
      barcode: 'BAR_PRODUCT_D',
      category: 'Tools',
      stock: 15,
      description: 'Professional barcode product'
    },
    {
      id: '5',
      name: 'Fresh Milk 1L',
      price: 65.00,
      barcode: 'MILK_001',
      category: 'Dairy',
      stock: 200,
      description: 'Fresh cow milk'
    },
    {
      id: '6',
      name: 'Bread Loaf',
      price: 45.00,
      barcode: 'BREAD_001',
      category: 'Bakery',
      stock: 75,
      description: 'Fresh bakery bread'
    },
    {
      id: '7',
      name: 'Cooking Oil 1L',
      price: 180.00,
      barcode: 'OIL_001',
      category: 'Grocery',
      stock: 40,
      description: 'Pure cooking oil'
    },
    {
      id: '8',
      name: 'Sugar 1KG',
      price: 55.00,
      barcode: 'SUGAR_001',
      category: 'Grocery',
      stock: 150,
      description: 'Refined sugar'
    }
  ];
};