/** Brand logo: shows the dark-ink version in light mode and the light-ink version in dark mode (pure CSS, no flash). */
export default function Logo({ width = 168, className = '' }: { width?: number; className?: string }) {
  return (<span className={className} style={{ display: 'block', width }}>
    <img className="logo-l" src="/brand/logo.png" alt="Tashmak Design & Print" width={width} height={Math.round(width * 0.2935)} style={{ width, height: 'auto' }} />
    <img className="logo-d" src="/brand/logo-dark.png" alt="" aria-hidden="true" width={width} height={Math.round(width * 0.2935)} style={{ width, height: 'auto' }} />
  </span>);
}
export function LogoMark({ size = 30 }: { size?: number }) { return <img src="/brand/mark.png" alt="Tashmak" width={size} height={size} style={{ width: size, height: size, borderRadius: 8 }} />; }
