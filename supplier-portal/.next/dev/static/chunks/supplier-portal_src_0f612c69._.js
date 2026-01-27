(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/supplier-portal/src/lib/api.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ApiError",
    ()=>ApiError,
    "apiFetch",
    ()=>apiFetch,
    "changePassword",
    ()=>changePassword,
    "clearAuthToken",
    ()=>clearAuthToken,
    "createProduct",
    ()=>createProduct,
    "deleteProduct",
    ()=>deleteProduct,
    "getAuthToken",
    ()=>getAuthToken,
    "getDashboardStats",
    ()=>getDashboardStats,
    "getOrders",
    ()=>getOrders,
    "getProducts",
    ()=>getProducts,
    "getSupplierProfile",
    ()=>getSupplierProfile,
    "loginSupplier",
    ()=>loginSupplier,
    "registerSupplier",
    ()=>registerSupplier,
    "setAuthToken",
    ()=>setAuthToken,
    "updateOrderStatus",
    ()=>updateOrderStatus,
    "updateProduct",
    ()=>updateProduct,
    "updateSupplierProfile",
    ()=>updateSupplierProfile,
    "uploadProductsCsv",
    ()=>uploadProductsCsv
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/supplier-portal/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
// SM-023: API client for supplier portal
const API_BASE_URL = ("TURBOPACK compile-time value", "http://34.14.220.171:3000") || ("TURBOPACK compile-time value", "http://34.14.220.171:3000") || 'http://localhost:3000';
class ApiError extends Error {
    status;
    code;
    constructor(status, code, message){
        super(message), this.status = status, this.code = code;
        this.name = 'ApiError';
    }
}
function getAuthToken() {
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    return localStorage.getItem('supplier_token');
}
function setAuthToken(token) {
    localStorage.setItem('supplier_token', token);
}
function clearAuthToken() {
    localStorage.removeItem('supplier_token');
}
async function apiFetch(endpoint, options = {}) {
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });
    const data = await response.json();
    if (!response.ok) {
        throw new ApiError(response.status, data.error?.code || 'UNKNOWN', data.error?.message || 'Request failed');
    }
    return data.data ?? data;
}
async function registerSupplier(input) {
    const result = await apiFetch('/api/v1/supplier/auth/register', {
        method: 'POST',
        body: JSON.stringify(input)
    });
    setAuthToken(result.token);
    return result;
}
async function loginSupplier(input) {
    const result = await apiFetch('/api/v1/supplier/auth/login', {
        method: 'POST',
        body: JSON.stringify(input)
    });
    setAuthToken(result.token);
    return result;
}
async function getSupplierProfile() {
    return apiFetch('/api/v1/supplier/profile');
}
async function updateSupplierProfile(data) {
    return apiFetch('/api/v1/supplier/profile', {
        method: 'PATCH',
        body: JSON.stringify(data)
    });
}
async function changePassword(data) {
    await apiFetch('/api/v1/supplier/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}
async function getProducts() {
    return apiFetch('/api/v1/supplier/products');
}
async function createProduct(input) {
    return apiFetch('/api/v1/supplier/products', {
        method: 'POST',
        body: JSON.stringify(input)
    });
}
async function updateProduct(id, input) {
    return apiFetch(`/api/v1/supplier/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input)
    });
}
async function deleteProduct(id) {
    await apiFetch(`/api/v1/supplier/products/${id}`, {
        method: 'DELETE'
    });
}
async function getOrders() {
    return apiFetch('/api/v1/supplier/orders');
}
async function updateOrderStatus(id, status) {
    return apiFetch(`/api/v1/supplier/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
            status
        })
    });
}
async function getDashboardStats() {
    return apiFetch('/api/v1/supplier/dashboard/stats');
}
async function uploadProductsCsv(file) {
    const formData = new FormData();
    formData.append('file', file);
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/v1/supplier/products/csv-upload`, {
        method: 'POST',
        headers: token ? {
            Authorization: `Bearer ${token}`
        } : {},
        body: formData
    });
    const data = await response.json();
    if (!response.ok) {
        throw new ApiError(response.status, data.error?.code || 'UNKNOWN', data.error?.message || 'Upload failed');
    }
    return data.data;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/supplier-portal/src/lib/auth.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AuthProvider",
    ()=>AuthProvider,
    "useAuth",
    ()=>useAuth,
    "withAuth",
    ()=>withAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supplier-portal/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supplier-portal/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supplier-portal/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supplier-portal/src/lib/api.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
'use client';
;
;
;
const AuthContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])({
    supplier: null,
    isLoading: true,
    isAuthenticated: false,
    logout: ()=>{},
    refreshProfile: async ()=>{}
});
function AuthProvider({ children }) {
    _s();
    const [supplier, setSupplier] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [isLoading, setIsLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const refreshProfile = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AuthProvider.useCallback[refreshProfile]": async ()=>{
            const token = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getAuthToken"])();
            if (!token) {
                setSupplier(null);
                setIsLoading(false);
                return;
            }
            try {
                const profile = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getSupplierProfile"])();
                setSupplier(profile);
            } catch (error) {
                console.error('[Auth] Failed to fetch profile:', error);
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clearAuthToken"])();
                setSupplier(null);
            } finally{
                setIsLoading(false);
            }
        }
    }["AuthProvider.useCallback[refreshProfile]"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AuthProvider.useEffect": ()=>{
            refreshProfile();
        }
    }["AuthProvider.useEffect"], [
        refreshProfile
    ]);
    const logout = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "AuthProvider.useCallback[logout]": ()=>{
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clearAuthToken"])();
            setSupplier(null);
            router.push('/login');
        }
    }["AuthProvider.useCallback[logout]"], [
        router
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AuthContext.Provider, {
        value: {
            supplier,
            isLoading,
            isAuthenticated: !!supplier,
            logout,
            refreshProfile
        },
        children: children
    }, void 0, false, {
        fileName: "[project]/supplier-portal/src/lib/auth.tsx",
        lineNumber: 59,
        columnNumber: 5
    }, this);
}
_s(AuthProvider, "wPWU9mxAS06Rzwss0QphYAJ52s4=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = AuthProvider;
function useAuth() {
    _s1();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(AuthContext);
}
_s1(useAuth, "gDsCjeeItUuvgOWf1v4qoK9RF6k=");
function withAuth(Component) {
    var _s = __turbopack_context__.k.signature();
    return _s(function ProtectedComponent(props) {
        _s();
        const { isAuthenticated, isLoading } = useAuth();
        const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
            "withAuth.ProtectedComponent.useEffect": ()=>{
                if (!isLoading && !isAuthenticated) {
                    router.push('/login');
                }
            }
        }["withAuth.ProtectedComponent.useEffect"], [
            isLoading,
            isAuthenticated,
            router
        ]);
        if (isLoading) {
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-center min-h-screen",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
                }, void 0, false, {
                    fileName: "[project]/supplier-portal/src/lib/auth.tsx",
                    lineNumber: 92,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supplier-portal/src/lib/auth.tsx",
                lineNumber: 91,
                columnNumber: 9
            }, this);
        }
        if (!isAuthenticated) {
            return null;
        }
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Component, {
            ...props
        }, void 0, false, {
            fileName: "[project]/supplier-portal/src/lib/auth.tsx",
            lineNumber: 101,
            columnNumber: 12
        }, this);
    }, "mEH+GTDGNx6l1kiic8iucxoBZHI=", false, function() {
        return [
            useAuth,
            __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
        ];
    });
}
var _c;
__turbopack_context__.k.register(_c, "AuthProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/supplier-portal/src/components/Providers.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Providers",
    ()=>Providers
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supplier-portal/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f40$tanstack$2f$query$2d$core$2f$build$2f$modern$2f$queryClient$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supplier-portal/node_modules/@tanstack/query-core/build/modern/queryClient.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supplier-portal/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$react$2d$hot$2d$toast$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supplier-portal/node_modules/react-hot-toast/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supplier-portal/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$src$2f$lib$2f$auth$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supplier-portal/src/lib/auth.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
function Providers({ children }) {
    _s();
    const [queryClient] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "Providers.useState": ()=>new __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f40$tanstack$2f$query$2d$core$2f$build$2f$modern$2f$queryClient$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["QueryClient"]({
                defaultOptions: {
                    queries: {
                        staleTime: 60 * 1000,
                        retry: 1
                    }
                }
            })
    }["Providers.useState"]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["QueryClientProvider"], {
        client: queryClient,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$src$2f$lib$2f$auth$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AuthProvider"], {
                children: children
            }, void 0, false, {
                fileName: "[project]/supplier-portal/src/components/Providers.tsx",
                lineNumber: 23,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supplier$2d$portal$2f$node_modules$2f$react$2d$hot$2d$toast$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Toaster"], {
                position: "top-right",
                toastOptions: {
                    duration: 4000,
                    style: {
                        background: '#1e293b',
                        color: '#fff'
                    },
                    success: {
                        iconTheme: {
                            primary: '#22c55e',
                            secondary: '#fff'
                        }
                    },
                    error: {
                        iconTheme: {
                            primary: '#ef4444',
                            secondary: '#fff'
                        }
                    }
                }
            }, void 0, false, {
                fileName: "[project]/supplier-portal/src/components/Providers.tsx",
                lineNumber: 26,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supplier-portal/src/components/Providers.tsx",
        lineNumber: 22,
        columnNumber: 5
    }, this);
}
_s(Providers, "32+z6YI1W53DAIkaD+JhMNHpE+c=");
_c = Providers;
var _c;
__turbopack_context__.k.register(_c, "Providers");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=supplier-portal_src_0f612c69._.js.map