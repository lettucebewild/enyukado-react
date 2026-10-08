// Shared Enyukado logo mark: transparent (no tile), same size on every page.
export default function BrandLogo({ size = 35, stroke = '#3b6aa8', dot = '#ffb98f' }) {
  return (
    <svg width={size} height={size} viewBox="5.5 6.5 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M7 8h2l2.5 9h8l2-6H11" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13.5" cy="21.5" r="1.5" fill={dot} />
      <circle cx="19.5" cy="21.5" r="1.5" fill={dot} />
    </svg>
  );
}
