  async function handleSubmit() {
    setLoading(true); setError("");
    try {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), password: form.password, fullName: form.fullName.trim(), orgName: form.orgName.trim(), planId: form.planId }),
      });
      const data = await res.json() as { error?: string; token?: string; org?: { id: string } };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.token) setStoredToken(data.token);

      // Paid plans → checkout page (gateway selection + payment)
      // Free plan  → email verification
      if (form.planId !== "free" && data.org?.id) {
        router.push(`/checkout?plan=${form.planId}&orgId=${data.org.id}`);
      } else {
        router.push(`/signup/verify?email=${encodeURIComponent(form.email)}&plan=${form.planId}`);
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }
