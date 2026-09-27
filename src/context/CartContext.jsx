import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';

// NOTE: The Express backend has no /api/cart endpoints (its schema has an
// unused Cart table, but transactions are created directly per-product).
// So this cart is a local "items I want to buy" list, stored in
// localStorage per user. Each item is still purchased individually through
// the existing single-product payment flow — the cart just groups them so
// the buyer doesn't lose track while shopping.
const CartContext = createContext(null);

function storageKey(userId) {
  return `enyukado_cart_${userId || 'guest'}`;
}

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(user?.id));
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
  }, [user?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(user?.id), JSON.stringify(items));
    } catch {
      /* ignore quota errors */
    }
  }, [items, user?.id]);

  const addToCart = useCallback((product) => {
    setItems((prev) => {
      if (prev.some((p) => p.productID === product.productID)) return prev;
      return [...prev, product];
    });
  }, []);

  const removeFromCart = useCallback((productID) => {
    setItems((prev) => prev.filter((p) => p.productID !== productID));
  }, []);

  const isInCart = useCallback(
    (productID) => items.some((p) => p.productID === productID),
    [items]
  );

  const clearCart = useCallback(() => setItems([]), []);

  return (
    <CartContext.Provider
      value={{ items, addToCart, removeFromCart, isInCart, clearCart, count: items.length }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
