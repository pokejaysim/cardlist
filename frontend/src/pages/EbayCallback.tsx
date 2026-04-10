import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export default function EbayCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");

    if (!code) {
      setError("No authorization code received from eBay");
      return;
    }

    apiFetch<{ message: string; ebay_user_id: string }>("/auth/ebay-callback", {
      method: "POST",
      body: JSON.stringify({ code }),
    })
      .then(() => {
        const returnTo = localStorage.getItem("snapcard_ebay_return");
        localStorage.removeItem("snapcard_ebay_return");
        const destination = returnTo === "onboarding" ? "/onboarding"
          : returnTo === "account" ? "/account"
          : "/dashboard";
        navigate(destination, { replace: true });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to link eBay account");
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">eBay Link Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Linking your eBay account...</p>
    </div>
  );
}
