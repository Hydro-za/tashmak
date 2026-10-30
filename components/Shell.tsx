'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  const path = usePathname(); const router = useRouter(); const [more, setMore] = useState(false);
  const items = navFor(isOwner, perms);
  const on = (h: string) => path === h || path.startsWith(h + '/');
  useEffect(() => setMore(false), [path]);
  async function signOut() { await createClient().auth.signOut(); window.location.href = '/login'; }
  const primary = items.slice(0, items.length > 5 ? 4 : items.length); const rest = items.length > 5 ? items.slice(4) : [];
  const viewAll = isOwner || perms.includes('jobs.view_all');
  const canSearch = isOwner || perms.some(p => ['jobs.view_all', 'customers.view', 'employees.view'].includes(p));
  return (
    <div className="app">
      <aside className="side glass-surface">
        <div className="brand"><Logo width={168} /></div>
        <nav className="nav">{items.map(i => <Link key={i.href} href={i.href} className={on(i.href) ? 'on' : ''}><NavIcon name={i.icon} /><span>{i.label}</span></Link>)}</nav>
        <div className="who">{name}<br /><b>{roleName}</b><div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}><ThemeToggle /><button className="btn sm" onClick={signOut}>Sign out</button></div></div>
      </aside>
      <main className="main">
        <div className="hdr glass-surface"><span className="mobilemark"><LogoMark size={32} /></span>{canSearch ? <GlobalSearch jobBase={viewAll ? '/jobs' : '/my-jobs'} /> : <b style={{ flex: 1 }}>{name}</b>}
          <span className="mobiletheme"><ThemeToggle /></span>
          <NotificationBell initialUnread={unread} jobBase={viewAll ? '/jobs' : '/my-jobs'} canQuotes={isOwner} /></div>
        {children}
      </main>
      <nav className="bottom glass-surface">
        {primary.map(i => <button key={i.href} className={on(i.href) ? 'on' : ''} onClick={() => router.push(i.href)}><NavIcon name={i.icon} /><span>{i.label.split(' ')[0]}</span></button>)}
        {rest.length > 0 && <button className={more ? 'on' : ''} onClick={() => setMore(!more)}><NavIcon name="more" /><span>More</span></button>}
      </nav>
      {more && <div className="sheet">{rest.map(i => <Link key={i.href} href={i.href}><NavIcon name={i.icon} /> {i.label}</Link>)}<Link href="/profile">Profile</Link><a href="#" onClick={e => { e.preventDefault(); signOut(); }}>Sign out</a></div>}
    </div>
  );
}
