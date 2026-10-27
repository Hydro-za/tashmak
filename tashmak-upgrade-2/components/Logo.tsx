/** Brand logo: ONE element. The picture (dark-ink or light-ink version) is chosen by the theme in CSS, so only one logo is ever drawn. */
export default function Logo({ width = 168, className = '' }: { width?: number; className?: string }) {
  return <span role="img" aria-label="Tashmak Design & Print" className={'brandlogo ' + className} style={{ width, height: Math.round(width * 188 / 640) }} />;
}
export function LogoMark({ size = 30 }: { size?: number }) { return <img src="/brand/mark.png" alt="Tashmak" width={size} height={size} style={{ width: size, height: size, borderRadius: 8 }} />; }
