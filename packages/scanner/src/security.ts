const AUTH_MIDDLEWARE_PATTERNS = [
  /authenticate/i,
  /authorize/i,
  /verifyJwt/i,
  /verifyToken/i,
  /requireAuth/i,
  /isAuth/i,
  /checkAuth/i,
  /authGuard/i,
  /jwtMiddleware/i,
  /bearerToken/i,
  /passportJwt/i,
  /ensureLoggedIn/i,
  /withAuth/i,
  /protected/i,
];

export function isAuthMiddleware(name: string): boolean {
  return AUTH_MIDDLEWARE_PATTERNS.some((pattern) => pattern.test(name));
}