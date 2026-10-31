'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Result = { ok: boolean; error?: string; message?: string };

export async function updateMyProfile(input: { fullName: string; email: string; phone: string }): Promise<Result> {
  const fullName = (input.fullName || '').trim();
  const email = (input.email || '').trim().toLowerCase();
  const phone = (input.phone || '').trim();
  if (!fullName || fullName.length > 120) return { ok: false, error: 'Enter a name (maximum 120 characters).' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (phone.length > 40) return { ok: false, error: 'Phone number is too long.' };

  const sb = createClient();
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return { ok: false, error: 'Your session has expired. Sign in again.' };
  const { data: profile, error: profileError } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError || !profile) return { ok: false, error: 'Could not load your profile.' };

  const admin = createAdminClient();
  const { data: saved, error: saveError } = await admin.from('profiles').update({ full_name: fullName, phone: phone || null }).eq('id', user.id).select('id').maybeSingle();
  if (saveError || !saved) return { ok: false, error: 'Your name and phone could not be saved. Please try again.' };

  let message = 'Profile updated.';
  if (profile.role !== 'owner') {
    const { error: emailError } = await admin.from('employee_recovery').upsert({ user_id: user.id, email, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (emailError) return { ok: false, error: 'Your name and phone were saved, but the recovery email could not be updated. Please try again.' };
  } else if (email !== (user.email || '').toLowerCase()) {
    const { error: authError } = await sb.auth.updateUser({ email });
    if (authError) return { ok: false, error: 'Your name and phone were saved, but the login email could not be changed: ' + (authError.message || 'please try again.') };
    message += ' Check your new email address to confirm the login email change.';
  }

  revalidatePath('/profile');
  return { ok: true, message };
}
