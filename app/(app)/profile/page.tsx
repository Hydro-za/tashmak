import { requireMe } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import ProfileForm from '@/components/ProfileForm';
export const dynamic = 'force-dynamic';
export default async function Profile() {
  const { profile, user } = await requireMe();
  let email = user.email || '';
  if (profile.role !== 'owner') {
    const { data: recovery, error } = await createAdminClient().from('employee_recovery').select('email').eq('user_id', user.id).maybeSingle();
    if (error) throw new Error('Could not load your recovery email. Please refresh the page or contact the owner.');
    email = recovery?.email || '';
  }
  return (<><h1 style={{ marginBottom: 12 }}>Profile</h1><div className="card"><div className="grid g2">
    <div><div className="lbl">Account type</div><b style={{ textTransform: 'capitalize' }}>{profile.role}</b></div>
    <div><div className="lbl">Username</div>{profile.username || '—'}</div>
  </div></div><ProfileForm initial={{ fullName: profile.full_name || '', email, phone: profile.phone || '' }} /></>);
}
