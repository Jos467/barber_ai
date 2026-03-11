import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Rutas que solo puede ver un admin
const ADMIN_ONLY_ROUTES = [
  '/dashboard/customers',
  '/dashboard/barbers',
  '/dashboard/settings',
]

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Si no hay sesión y quiere entrar al dashboard → login
  if (pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Si ya tiene sesión y va al login → dashboard
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Si tiene sesión y quiere entrar a ruta de admin → verificar rol
  if (user && ADMIN_ONLY_ROUTES.some(route => pathname.startsWith(route))) {
    const { data: member } = await supabase
      .from('business_members')
      .select('role')
      .eq('user_id', user.id)
      .single()

    // Si es barber (no admin) → redirigir al inicio del dashboard
    if (!member || member.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}