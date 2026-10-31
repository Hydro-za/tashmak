'use server';
import { createHash, randomInt } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPasswordResetEmail } from '@/lib/email';

type Result = { ok: boolean; error?: string };
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function codeHash(email: string, code: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Password reset security configuration is missing.');
  return createHash('sha256').update(email + ':' + code + ':' + secret).digest('hex');
}

export async function requestPasswordReset(identifier: string): Promise<Result> {
  const supplied = (identifier || '').trim().toLowerCase();
  if (!supplied) return { ok: false, error: 'Enter your username or registered email address.' };
  try {
    const sb = createAdminClient();
    const isEmail = validEmail(supplied);
    let profile: any = null;
    let address = supplied;
    if (isEmail) {
      const { data: employee, error } = await sb.from('profiles').select('id,full_name,recovery_email,role')
        .ilike('recovery_email', supplied).eq('active', true).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      profile = employee;
      if (!profile) {
        const { data: users, error: usersError } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (usersError) throw usersError;
        const match = users.find((u: any) => (u.email || '').toLowerCase() === supplied);
        if (match) {
          const { data, error: pError } = await sb.from('profiles').select('id,full_name,recovery_email,role')
            .eq('id', match.id).eq('active', true).is('deleted_at', null).maybeSingle();
          if (pError) throw pError;
          profile = data;
        }
      }
    } else {
      // Username matching is case-insensitive: login accepts the original case, so reset must too.
      const { data, error } = await sb.from('profiles').select('id,full_name,recovery_email,role')
        .ilike('username', supplied).eq('active', true).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      profile = data;
      if (profile?.recovery_email) address = String(profile.recovery_email).trim().toLowerCase();
      else if (profile?.role === 'owner') {
        const { data: owner, error: ownerError } = await sb.auth.admin.getUserById(profile.id);
        if (ownerError) throw ownerError;
        address = (owner.user?.email || '').toLowerCase();
      } else return { ok: true };
      if (!validEmail(address)) return { ok: true };
    }

    if (profile && validEmail(address)) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data: recent, error: recentError } = await sb.from('password_reset_codes').select('id')
        .eq('email', address).gte('created_at', since).limit(1).maybeSingle();
      if (recentError) throw recentError;
      if (recent) return { ok: true };
      const { error: cleanupError } = await sb.from('password_reset_codes').delete()
        .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      if (cleanupError) throw cleanupError;
      const { data: userData, error: userError } = await sb.auth.admin.getUserById(profile.id);
      if (userError) throw userError;
      if (userData.user) {
        const code = String(randomInt(1000, 10000));
        const hash = codeHash(address, code);
        const { error: consumeError } = await sb.from('password_reset_codes').update({ consumed_at: new Date().toISOString() })
          .eq('email', address).is('consumed_at', null);
        if (consumeError) throw consumeError;
        const { error: insertError } = await sb.from('password_reset_codes').insert({
          email: address, user_id: profile.id, code_hash: hash,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        });
        if (insertError) throw insertError;
        try { await sendPasswordResetEmail(address, profile.full_name || 'there', code); }
        catch (error) {
          await sb.from('password_reset_codes').update({ consumed_at: new Date().toISOString() }).eq('email', address).eq('code_hash', hash);
          throw error;
        }
      }
    }
    // Keep account-existence responses generic.
    return { ok: true };
  } catch (error) {
    console.error('Password reset request failed', error);
    return { ok: false, error: 'Could not send the reset email. Please try again in a few minutes.' };
  }
}

export async function completePasswordReset(email: string, code: string, password: string): Promise<Result> {
  const address = (email || '').trim().toLowerCase();
  if (!validEmail(address)) return { ok: false, error: 'Enter the registered recovery email address.' };
  if (!/^\d{4}$/.test(code || '')) return { ok: false, error: 'Enter the four-digit code from your email.' };
  if (typeof password !== 'string' || password.length < 8 || password.length > 128)
    return { ok: false, error: 'Password must be between 8 and 128 characters.' };
  try {
    const sb = createAdminClient();
    const { data: userId, error } = await sb.rpc('consume_password_reset_code', {
      p_email: address, p_code_hash: codeHash(address, code)
    });
    if (error) throw error;
    if (!userId) return { ok: false, error: 'That code is invalid or expired. Request a new code and try again.' };
    const { error: updateError } = await sb.auth.admin.updateUserById(userId, { password });
    if (updateError) throw updateError;
    const { error: profileError } = await sb.from('profiles').update({ must_change_password: false }).eq('id', userId);
    if (profileError) throw profileError;
    return { ok: true };
  } catch (error) {
    console.error('Password reset completion failed', error);
    return { ok: false, error: 'Could not change the password. Please request a new code and try again.' };
  }
}
