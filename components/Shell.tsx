'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Logo, { LogoMark } from './Logo';
import ThemeToggle from './ThemeToggle';
import NavIcon from './NavIcons';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';

type Item = { href: string; label: string; icon: string };
export type ShellProps = { name: string; roleName: string; isOwner: boolean; perms: string[]; unread: number; children: React.ReactNode };

function navFor(isOwner: boolean, perms: string[]): Item[] {
  const can = (...p: string[]) => isOwner || p.some(x => perms.includes(x));
  const items: Item[] = [];
  if (can('jobs.view_all')) items.push({ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' }, { href: '/jobs', label: 'Jobs', icon: 'jobs' });
  if (isOwner) items.push({ href: '/quotes', label: 'Quotes', icon: 'quotes' });
  if (can('customers.view', 'customers.manage')) items.push({ href: '/customers', label: 'Customers', icon: 'customers' });
  if (can('stock.view', 'stock.receive', 'stock.adjust', 'stock.history')) items.push({ href: '/stock', label: 'Stock', icon: 'products' });
  if (isOwner) items.push({ href: '/products', label: 'Products & Pricing', icon: 'products' });
  if (can('employees.view', 'employees.manage', 'roles.manage')) items.push({ href: '/employees', label: 'Employees', icon: 'employees' });

  if (can('reports.view')) items.push({ href: '/reports', label: 'Reports', icon: 'reports' });
  if (can('settings.manage')) items.push({ href: '/settings', label: 'Settings', icon: 'settings' });
  const works = !isOwner && (perms.some(p => ['jobs.work_design', 'jobs.work_production', 'qc.perform'].includes(p)) || !perms.includes('jobs.view_all'));
  if (works) items.unshift({ href: '/my-jobs', label: 'My Jobs', icon: 'my-jobs' }, { href: '/completed', label: 'Completed', icon: 'completed' });
  if (!isOwner) items.push({ href: '/notifications', label: 'Notifications', icon: 'notifications' });
  // Every account can manage its own password and access profile-level controls.
  items.push({ href: '/profile', label: 'Profile', icon: 'profile' });
  return items;
}

export default function Shell({ name, roleName, isOwner, perms, unread, children }: ShellProps) {
  const path = usePathname(); const [menuOpen, setMenuOpen] = useState(false);
  const items = navFor(isOwner, perms);
  const on = (h: string) => path === h || path.startsWith(h + '/');
  useEffect(() => setMenuOpen(false), [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  async function signOut() { await createClient().auth.signOut(); window.location.href = '/login'; }
  const primary = isOwner
    ? ['/dashboard', '/jobs', '/quotes', '/products', '/stock'].map(href => items.find(item => item.href === href)).filter((item): item is Item => !!item)
    : items.filter(item => ['/my-jobs', '/dashboard', '/jobs', '/stock'].includes(item.href)).slice(0, 5);
  const primaryHrefs = new Set(primary.map(item => item.href));
  const rest = items.filter(item => !primaryHrefs.has(item.href));
  const viewAll = isOwner || perms.includes('jobs.view_all');
  const canSearch = isOwner || perms.some(p => ['jobs.view_all', 'customers.view', 'employees.view'].includes(p));
  const navGroups = [
    { title: 'Work', links: rest.filter(i => ['/customers', '/my-jobs', '/completed', '/notifications'].includes(i.href)) },
    { title: 'Manage', links: rest.filter(i => ['/products', '/stock', '/employees', '/reports', '/settings'].includes(i.href)) },
    { title: 'Account', links: rest.filter(i => ['/profile'].includes(i.href)) }
  ].filter(group => group.links.length);
  return (
    <div className="app">
      <aside className="side glass-surface">
        <div className="brand"><Logo width={168} /></div>
        <nav className="nav">{items.map(i => <Link key={i.href} href={i.href} className={on(i.href) ? 'on' : ''}><NavIcon name={i.icon} /><span>{i.label}</span></Link>)}</nav>
        <div className="who">{name}<br /><b>{roleName}</b><div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}><ThemeToggle /><button className="btn sm" onClick={signOut}>Sign out</button></div></div>
      </aside>
      <main className="main">
        <div className="hdr glass-surface">
          <button type="button" className="mobile-nav-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(open => !open)}><NavIcon name="menu" /></button>
          <span className="mobilemark"><LogoMark size={32} /></span>{canSearch ? <GlobalSearch jobBase={viewAll ? '/jobs' : '/my-jobs'} /> : <b style={{ flex: 1 }}>{name}</b>}
          <span className="mobiletheme"><ThemeToggle /></span>
          <NotificationBell initialUnread={unread} jobBase={viewAll ? '/jobs' : '/my-jobs'} canQuotes={isOwner} /></div>
        {children}
      </main>
      <nav className="bottom glass-surface" aria-label="Primary navigation">
        {primary.map(i => <Link key={i.href} href={i.href} className={on(i.href) ? 'on' : ''} aria-current={on(i.href) ? 'page' : undefined}><NavIcon name={i.icon} /><span>{i.label === 'Products & Pricing' ? 'Products' : i.label.split(' ')[0]}</span></Link>)}
      </nav>
      {menuOpen && <nav id="mobile-navigation" className="mobile-nav-panel" aria-label="Workspace navigation">
        {navGroups.map(group => <section className="mobile-nav-group" key={group.title}>
          <h2>{group.title}</h2>
          <div>{group.links.map(i => <Link key={i.href} href={i.href} className={on(i.href) ? 'on' : ''}><NavIcon name={i.icon} /><span>{i.label}</span></Link>)}</div>
        </section>)}
        <button type="button" className="mobile-nav-signout" onClick={signOut}>Sign out</button>
      </nav>}
    </div>
  );
}
