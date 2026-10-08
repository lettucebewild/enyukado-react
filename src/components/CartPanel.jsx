import AppHeader from './AppHeader.jsx';
import EmptyState from './EmptyState.jsx';

export default function CartPanel({ cart, onBack, onOpenProduct, onOpenPayment, onToast, headerProps }) {
  const items = cart?.items || [];

  return (
    <div className="fullpanel-overlay">
      <AppHeader {...headerProps} active="cart" onBack={onBack} title={`🛒 Cart${items.length > 0 ? ` (${items.length})` : ''}`} />

      <div className="fullpanel-body">
        <div className="cart-panel-inner">
          {items.length === 0 ? (
            <EmptyState
              icon="cart"
              title="Your cart is empty"
              text="Browse listings and tap “Add to cart” on anything you like."
              actionLabel="Browse listings"
              actionIcon="search"
              onAction={onBack}
            />
          ) : (
            <>
              <div className="cart-note">
                Each item here is bought separately — tap <strong>Buy</strong> on an item to pay the
                seller for that item, same as the regular checkout.
              </div>
              {items.map((item) => (
                <div className="cart-item" key={item.productID}>
                  <img
                    className="cart-item-img"
                    src={item.imgUrl || undefined}
                    alt={item.name}
                    onClick={() => onOpenProduct(item.productID)}
                    style={{ cursor: 'pointer' }}
                  />
                  <div className="cart-item-info" onClick={() => onOpenProduct(item.productID)} style={{ cursor: 'pointer' }}>
                    <div className="cart-item-name">{item.name}</div>
                    <div className="cart-item-price">₱{parseFloat(item.price).toLocaleString()}</div>
                    <div className="cart-item-sub">Sold by {item.sellerName || 'Student Seller'}</div>
                  </div>
                  <div className="cart-item-actions">
                    <button className="cart-buy-btn" onClick={() => onOpenPayment(item)}>Buy</button>
                    <button
                      className="cart-remove-btn"
                      title="Remove from cart"
                      onClick={() => {
                        cart.removeFromCart(item.productID);
                        onToast?.('Removed from cart.', 'success', { action: { label: 'Undo', onClick: () => cart.addToCart(item) } });
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
