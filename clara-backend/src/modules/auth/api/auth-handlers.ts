// ── POST /api/auth/login ──────────────────────────────────────────────────────

export async function loginHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const body = await req.json();
    const { email, password } = body ?? {};

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    const userWithHash = await getUserByEmail(email);
    if (!userWithHash) {
      await hashPassword("dummy-anti-timing-run");
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, userWithHash.passwordHash);
    if (!valid) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

    if (userWithHash.status === "suspended") {
      return NextResponse.json({ error: "Account is suspended" }, { status: 403 });
    }

    const token     = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = sessionExpiresAt();
    await createSession(userWithHash.id, tokenHash, expiresAt, getIp(req), req.headers.get("user-agent") ?? undefined);
    await touchLastLogin(userWithHash.id);
    await writeAuditLog({ userId: userWithHash.id, action: "user.login", resourceType: "user", resourceId: userWithHash.id, ipAddress: getIp(req) });

    const { passwordHash: _ph, ...user } = userWithHash;
    const res = NextResponse.json({ user, token });
    res.headers.set("Set-Cookie", buildSetCookieHeader(token, expiresAt));
    return res;
  } catch (err) {
    console.error("[auth] login:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

export async function logoutHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const token = extractToken(req);
    if (token) {
      const session = await getSessionByTokenHash(hashToken(token));
      if (session) await deleteSession(session.id);
    }
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", buildClearCookieHeader());
    return res;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

export async function meHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    return NextResponse.json({ user: auth.user, session: { id: auth.session.id, expiresAt: auth.session.expiresAt } });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── DELETE /api/auth/sessions ─────────────────────────────────────────────────

export async function logoutAllHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await deleteAllUserSessions(auth.user.id);
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", buildClearCookieHeader());
    return res;
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST /api/orgs/:orgId/members ─────────────────────────────────────────────

export async function inviteOrgMemberHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "user:invite");

    const body = await req.json();
    const { userId, role } = body ?? {};
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    const validRoles: RoleName[] = ["org_admin", "project_manager", "kb_editor", "kb_viewer"];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }

    const target = await getUserById(userId);
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const member = await addOrgMember(orgId, userId, role as RoleName, auth.user.id);
    await writeAuditLog({ userId: auth.user.id, orgId, action: "org.invite_member", resourceType: "user", resourceId: userId, newData: { role }, ipAddress: getIp(req) });

    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/orgs/:orgId/members ──────────────────────────────────────────────

export async function listOrgMembersHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "user:read");
    const members = await listOrgMembers(orgId);
    return NextResponse.json(members);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── DELETE /api/orgs/:orgId/members/:userId ───────────────────────────────────

export async function removeOrgMemberHandler(req: NextRequest, orgId: string, userId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "user:remove");

    const removed = await removeOrgMember(orgId, userId);
    if (!removed) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    await writeAuditLog({ userId: auth.user.id, orgId, action: "org.remove_member", resourceType: "user", resourceId: userId, ipAddress: getIp(req) });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
