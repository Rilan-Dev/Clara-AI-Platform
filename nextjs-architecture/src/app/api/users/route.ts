import { NextResponse } from "next/server";
import { createUserPayloadSchema, listUsersParamsSchema } from "@/server/users/user.schemas";
import { userRepository } from "@/server/users/user.repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedParams = listUsersParamsSchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  if (!parsedParams.success) {
    return NextResponse.json(
      { success: false, message: "Invalid list parameters" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: userRepository.list(parsedParams.data),
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsedBody = createUserPayloadSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, message: "Invalid user payload", detail: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const createdUser = userRepository.create(parsedBody.data);

  return NextResponse.json(
    {
      success: true,
      data: createdUser,
      message: "User created successfully",
    },
    { status: 201 },
  );
}
