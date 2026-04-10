import { DEV_MODE, DEV_LISTINGS, DEV_USAGE } from "./devMode";
import { useAuthStore } from "@/store/auth";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

// Mock responses for dev mode so the UI is fully navigable without a backend
function devMockResponse<T>(path: string, options?: RequestInit): T | null {
  if (!DEV_MODE) return null;

  // GET /listings
  if (path === "/listings" && (!options?.method || options.method === "GET")) {
    return DEV_LISTINGS as unknown as T;
  }

  // GET /account/usage
  if (path === "/account/usage") {
    return DEV_USAGE as unknown as T;
  }

  // GET /account/ebay-status
  if (path === "/account/ebay-status") {
    return { linked: false } as unknown as T;
  }

  // GET /account
  if (path === "/account" && (!options?.method || options.method === "GET")) {
    return { id: "dev", email: "demo@snapcard.dev", name: "Demo User", plan: "free" } as unknown as T;
  }

  // POST /listings (save draft)
  if (path === "/listings" && options?.method === "POST") {
    return { id: "dev-new-listing", status: "draft" } as unknown as T;
  }

  // POST /cards/identify (blocked for free)
  if (path === "/cards/identify") {
    throw new Error("Upgrade to Pro to use AI card identification");
  }

  // POST /pricing/suggest (blocked for free)
  if (path === "/pricing/suggest") {
    throw new Error("Upgrade to Pro to use pricing suggestions");
  }

  return null;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  // In dev mode, return mock data instead of hitting the backend
  const mock = devMockResponse<T>(path, options);
  if (mock !== null) {
    return mock;
  }

  const token = localStorage.getItem("access_token");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      },
    });
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }

  if (!res.ok) {
    // Handle 401 — session expired, force logout
    if (res.status === 401) {
      localStorage.removeItem("access_token");
      useAuthStore.getState().signOut();
      window.location.href = "/login";
      throw new Error("Session expired. Please sign in again.");
    }

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Upload a file via multipart/form-data (e.g., photo upload).
 * Does NOT set Content-Type — the browser sets it with the boundary.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  if (DEV_MODE) {
    return { id: "dev-photo", file_url: "https://placeholder.dev/photo.jpg" } as unknown as T;
  }

  const token = localStorage.getItem("access_token");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("access_token");
      useAuthStore.getState().signOut();
      window.location.href = "/login";
      throw new Error("Session expired. Please sign in again.");
    }

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Upload failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
