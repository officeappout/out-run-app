import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for Domain-Based Routing and Role-Based Access Control
 * 
 * Domain Routing:
 * - admin.outrun.co.il -> Super Admin / System Admin portal
 * - portal.outrun.co.il -> Authority Manager portal
 * - localhost / other -> Allow both (for development)
 * 
 * Route Protection:
 * - Authority managers cannot access /admin/system-settings, /admin/login, or main admin routes
 * - Super/System admins cannot access /authority-portal routes
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';
  
  // Extract domain (handle localhost and port numbers)
  const domain = hostname.split(':')[0].toLowerCase();
  
  // Determine portal type based on domain
  const isAdminDomain = domain === 'admin.outrun.co.il' || domain === 'admin.outrun.local';
  const isAuthorityDomain = domain === 'portal.outrun.co.il' || domain === 'portal.outrun.local';
  const isDevelopment = domain === 'localhost' || domain.includes('127.0.0.1') || domain.includes('192.168');

  // Admin Domain Routing: Only allow Super Admin / System Admin routes
  if (isAdminDomain) {
    // Block authority portal routes
    if (pathname.startsWith('/authority-portal')) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    
    // Block authority manager routes
    if (pathname.startsWith('/admin/authority-manager')) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // Authority Portal Domain Routing: Only allow Authority Manager routes
  if (isAuthorityDomain) {
    // Block admin login and system settings
    if (pathname.startsWith('/admin/login') || pathname.startsWith('/admin/system-settings')) {
      return NextResponse.redirect(new URL('/authority-portal/login', request.url));
    }
    
    // Block main admin dashboard (redirect to authority manager dashboard)
    if (pathname === '/admin' || pathname === '/admin/') {
      return NextResponse.redirect(new URL('/admin/authority-manager', request.url));
    }
    
    // Block other admin routes except authority-manager, parks, routes, and users
    if (pathname.startsWith('/admin')) {
      const allowedPaths = [
        '/admin/authority-manager',
        '/admin/parks',
        '/admin/routes',
        '/admin/users',
        '/admin/auth/callback', // Allow callback for magic link
      ];
      
      const isAllowed = allowedPaths.some(path => pathname.startsWith(path));
      
      if (!isAllowed) {
        return NextResponse.redirect(new URL('/admin/authority-manager', request.url));
      }
    }
  }

  // Development mode: Allow all routes (for testing)
  if (isDevelopment) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

// Configure which routes should trigger the middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|mp3|otf|woff|woff2)$).*)',
  ],
};
