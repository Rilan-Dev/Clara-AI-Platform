import { useLocation, useNavigate, useParams as useRouteParams, useSearchParams as useRouteSearchParams } from "react-router-dom";

export function useRouter() {
  const navigate = useNavigate();

  return {
    push: (to: string) => navigate(to),
    replace: (to: string) => navigate(to, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => window.location.reload(),
    prefetch: async () => {},
  };
}

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  const [searchParams] = useRouteSearchParams();
  return searchParams;
}

export function useParams<T extends Record<string, string | undefined>>() {
  return useRouteParams() as T;
}

export function redirect(to: string) {
  window.location.replace(to);
  throw new Error(`Redirected to ${to}`);
}
