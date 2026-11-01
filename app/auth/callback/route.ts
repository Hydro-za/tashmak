import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = request.nextUrl.searchParams.get('next') || '/change-password';
  const fallback = new URL('/change-password', request.url);
  let destination = fallback;

  // Validate both the input form and the resolved origin. URL parsing treats
  // backslashes as path separators, so checking only for a leading "//" is not safe.
  if (next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) {
    const candidate = new URL(next, request.url);
    if (candidate.origin === request.nextUrl.origin) destination = candidate;
  }

  const response = NextResponse.redirect(destination);

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.redirect(new URL('/login?error=configuration', request.url));
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/login?error=auth-callback', request.url));
    }
  }

  return response;
}
