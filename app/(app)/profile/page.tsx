import { requireMe } from '@/lib/session';
import ProfileForm from '@/components/ProfileForm';
export const dynamic = 'force-dynamic';
export default async function Profile() {
  const { profile, user } = await requireMe();
  return (<><h1 style={{ marginBottom: 12 }}>Profile</h1><div className="card"><div className="grid g2"><div><div className="lbl">Name</div><b>{profile.full_name}</b></div><div><div className="lbl">Role</div><b style={{ textTransform: 'capitalize' }}>{profile.role}</b></div>
    <div><div className="lbl">Login</div>{profile.role === 'owner' ? user.email : profile.username}</div><div><div className="lbl">Phone</div>{profile.phone || '—'}</div></div></div><ProfileForm /></>);
}
