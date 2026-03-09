import { NextResponse } from "next/server";
import { updateUserPayloadSchema } from "@/server/users/user.schemas";
import { userRepository } from "@/server/users/user.repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = userRepository.findById(id);

  if (!user) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: user });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json();
  const parsedBody = updateUserPayloadSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, message: "Invalid update payload", detail: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const updatedUser = userRepository.update(id, parsedBody.data);

  if (!updatedUser) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: updatedUser });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const removed = userRepository.remove(id);

  if (!removed) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
