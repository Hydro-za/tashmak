import { requireMe } from '@/lib/session';
import ProfileForm from '@/components/ProfileForm';
export const dynamic = 'force-dynamic';
export default async function Profile() {
  const { profile, user } = await requireMe();
  const email = profile.role === 'owner' ? (user.email || '') : (profile.recovery_email || '');
  return (<><h1 style={{ marginBottom: 12 }}>Profile</h1><div className="card"><div className="grid g2">
    <div><div className="lbl">Account type</div><b style={{ textTransform: 'capitalize' }}>{profile.role}</b></div>
    <div><div className="lbl">Username</div>{profile.username || '—'}</div>
  </div></div><ProfileForm initial={{ fullName: profile.full_name || '', email, phone: profile.phone || '' }} /></>);
}
