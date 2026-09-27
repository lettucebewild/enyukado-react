export default function Toast({ show, message, type }) {
  return (
    <div className={`toast${show ? ' show' : ''}`}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={type === 'error' ? '#e0504a' : '#5ddf7a'}
        strokeWidth="2.5"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
