import { create } from 'zustand';
import { eventLogger } from '../services/eventLogger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as productsApi from '../services/api/productsApi';

const PRODUCTS_CACHE_KEY = 'supermandi.cache.products.v1';

export interface Product {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
  barcode?: string;
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
      // 1) Try backend first
      const remote = await productsApi.listProducts();
      const productsData: Product[] = remote.map((p) => ({
        id: p.id,
        name: p.name,
        priceMinor: p.price,
        currency: p.currency,
        barcode: p.barcode ?? undefined,
        stock: p.stock
      }));

      await AsyncStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(productsData));

      set({
        products: productsData,
        loading: false,
        error: null
      });

      await eventLogger.log('PRODUCTS_LOADED', {
        count: productsData.length,
        source: 'backend_api'
      });

    } catch (error) {
      // 2) Fallback to cache
      const cached = await AsyncStorage.getItem(PRODUCTS_CACHE_KEY);
      if (cached) {
        try {
          const productsData = JSON.parse(cached) as Product[];
          set({ products: productsData, loading: false, error: null });
          await eventLogger.log('PRODUCTS_LOADED', {
            count: productsData.length,
            source: 'cache'
          });
          return;
        } catch {
          // ignore and continue
        }
      }

      // 3) Final fallback to bundled sample data
      const productsData = await loadProductsFromData();
      set({ products: productsData, loading: false, error: null });

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
      (product.barcode ? product.barcode.toLowerCase().includes(lowercaseQuery) : false) ||
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
      priceMinor: 9999,
      currency: 'INR',
      barcode: '1234567890',
      category: 'General',
      stock: 50,
      description: 'High quality sample product'
    },
    {
      id: '2',
      name: 'Sample Product B',
      priceMinor: 14950,
      currency: 'INR',
      barcode: '0987654321',
      category: 'Electronics',
      stock: 25,
      description: 'Premium electronic item'
    },
    {
      id: '3',
      name: 'QR Product C',
      priceMinor: 7999,
      currency: 'INR',
      barcode: 'QR_PRODUCT_C',
      category: 'Accessories',
      stock: 100,
      description: 'Scannable QR product'
    },
    {
      id: '4',
      name: 'Barcode Product D',
      priceMinor: 19999,
      currency: 'INR',
      barcode: 'BAR_PRODUCT_D',
      category: 'Tools',
      stock: 15,
      description: 'Professional barcode product'
    },
    {
      id: '5',
      name: 'Fresh Milk 1L',
      priceMinor: 6500,
      currency: 'INR',
      barcode: 'MILK_001',
      category: 'Dairy',
      stock: 200,
      description: 'Fresh cow milk'
    },
    {
      id: '6',
      name: 'Bread Loaf',
      priceMinor: 4500,
      currency: 'INR',
      barcode: 'BREAD_001',
      category: 'Bakery',
      stock: 75,
      description: 'Fresh bakery bread'
    },
    {
      id: '7',
      name: 'Cooking Oil 1L',
      priceMinor: 18000,
      currency: 'INR',
      barcode: 'OIL_001',
      category: 'Grocery',
      stock: 40,
      description: 'Pure cooking oil'
    },
    {
      id: '8',
      name: 'Sugar 1KG',
      priceMinor: 5500,
      currency: 'INR',
      barcode: 'SUGAR_001',
      category: 'Grocery',
      stock: 150,
      description: 'Refined sugar'
    }
  ];
};
