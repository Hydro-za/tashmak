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
  const { data: profile, error: profileError } = await sb.from('profiles').select('role,recovery_email').eq('id', user.id).maybeSingle();
  if (profileError || !profile) return { ok: false, error: 'Could not load your profile.' };

  let emailMessage = '';
  if (profile.role === 'owner' && email !== (user.email || '').toLowerCase()) {
    const { error } = await sb.auth.updateUser({ email });
    if (error) return { ok: false, error: error.message || 'Could not update your login email.' };
    emailMessage = ' Check your new email address to confirm the change.';
  }

  const admin = createAdminClient();
  const patch: Record<string, string | null> = { full_name: fullName, phone: phone || null };
  if (profile.role !== 'owner') patch.recovery_email = email;
  const { error: saveError } = await admin.from('profiles').update(patch).eq('id', user.id);
  if (saveError) return { ok: false, error: 'Your account details could not be saved. Please try again.' };

  revalidatePath('/profile');
  return { ok: true, message: 'Profile updated.' + emailMessage };
}
